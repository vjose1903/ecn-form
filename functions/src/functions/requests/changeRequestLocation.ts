import {createHash} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {hasCityFieldPermission, requireCityPermission} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";
import {requestIdentityKeys, requestIdentityLock} from "../../core/helpers/request-identity";
import {getActorName} from "../../core/helpers/actor-name";

export const changeRequestLocation = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
  const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
  const action = data.action;
  const sourceRetreatId = typeof data.sourceRetreatId === "string" ? data.sourceRetreatId.trim() : "";
  const targetRetreatId = typeof data.targetRetreatId === "string" ? data.targetRetreatId.trim() : sourceRetreatId;
  if (!cityId || !requestId || !sourceRetreatId || !["archive", "unarchive", "transfer"].includes(String(action))) {
    throw new HttpsError("invalid-argument", "La acción o las referencias de ciudad, solicitud y retiro no son válidas.");
  }
  const permissionAction = action === "archive" ? "archive" : action === "unarchive" ? "unarchive" : "transfer";
  const actorUid = await requireCityPermission(request, cityId, "requests", permissionAction);
  const actorName = await getActorName(actorUid, request.auth?.token.name);
  if (!await hasCityFieldPermission(request, cityId, "requests", "status", "update")) {
    throw new HttpsError("permission-denied", "No tienes permiso para modificar el estado de la solicitud.");
  }
  const rootRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
  const targetRef = v2Db.doc(`city/${cityId}/retreat/${targetRetreatId}`);
  if (targetRetreatId !== sourceRetreatId && !(await targetRef.get()).exists) {
    throw new HttpsError("not-found", "No se encontró el retiro de destino.");
  }
  await v2Db.runTransaction(async transaction => {
    const summaryRef = rootRef.collection("details").doc("payments_summary");
    const [root, statusRef, contactRef, identityRef, retreatSnapshot, paymentSummary, paymentRecords] = await Promise.all([
      transaction.get(rootRef),
      transaction.get(rootRef.collection("details").doc("status")),
      transaction.get(rootRef.collection("details").doc("contact")),
      transaction.get(rootRef.collection("details").doc("identity")),
      action === "archive" ? transaction.get(targetRef) : Promise.resolve(null),
      action === "archive" ? transaction.get(summaryRef) : Promise.resolve(null),
      action === "archive" ? transaction.get(rootRef.collection("payments")) : Promise.resolve(null),
    ]);
    if (!root.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
    if (action === "archive" && !retreatSnapshot?.exists) throw new HttpsError("not-found", "No se encontró el retiro para calcular la devolución.");
    if (root.get("retreat_id") !== sourceRetreatId) throw new HttpsError("failed-precondition", "La solicitud ya fue trasladada a otro retiro.");
    const currentlyArchived = root.get("is_archived") === true;
    if (action === "archive" && currentlyArchived) throw new HttpsError("failed-precondition", "La solicitud ya está archivada.");
    if (action === "unarchive" && !currentlyArchived) throw new HttpsError("failed-precondition", "La solicitud ya está activa.");
    if (action === "transfer" && currentlyArchived !== (data.isArchived === true)) {
      throw new HttpsError("failed-precondition", "El estado de la solicitud cambió.");
    }
    const nextArchived = action === "archive" ? true : action === "unarchive" ? false : currentlyArchived;
    const identityKeys = requestIdentityKeys(contactRef.data() ?? {}, identityRef.data() ?? {});
    const sourceLocks = identityKeys.map(key => requestIdentityLock(cityId, sourceRetreatId, key));
    const targetLocks = nextArchived ? [] : identityKeys.map(key => requestIdentityLock(cityId, targetRetreatId, key));
    const allLockRefs = [...new Map([...sourceLocks, ...targetLocks].map(ref => [ref.path, ref])).values()];
    const lockSnapshots = await Promise.all(allLockRefs.map(ref => transaction.get(ref)));
    const locksByPath = new Map(allLockRefs.map((ref, index) => [ref.path, lockSnapshots[index]]));
    for (const ref of targetLocks) {
      const targetLock = locksByPath.get(ref.path);
      if (targetLock?.exists && targetLock.get("request_id") !== requestId) {
        throw new HttpsError("already-exists", "No se puede restaurar o transferir la solicitud porque ya existe otra activa con los mismos datos.");
      }
    }
    if (nextArchived || sourceRetreatId !== targetRetreatId) {
      for (const ref of sourceLocks) {
        if (locksByPath.get(ref.path)?.get("request_id") === requestId) transaction.delete(ref);
      }
    }
    for (const ref of targetLocks) {
      transaction.set(ref, {request_id: requestId, retreat_id: targetRetreatId, created_at: FieldValue.serverTimestamp()});
    }
    let refundRetentionEvent: Record<string, unknown> | undefined;
    let refundPendingEvent: Record<string, unknown> | undefined;
    if (action === "archive" && retreatSnapshot?.exists) {
      const previousSummary = paymentSummary?.data() ?? {};
      if (typeof previousSummary.refund_due_amount !== "number") {
      const retreat = retreatSnapshot.data() ?? {};
      const days = Math.max(0, Math.min(365, Number(retreat.refund_retention_days_before_retreat ?? 0)));
      const percentage = Math.max(0, Math.min(100, Number(retreat.non_refundable_percentage ?? 0)));
      const startValue = retreat.start_date as {toDate?: () => Date} | Date | string | undefined;
      const startDate = startValue && typeof startValue === "object" && "toDate" in startValue && typeof startValue.toDate === "function"
        ? startValue.toDate()
        : new Date(startValue as string | Date);
      const cutoff = new Date(startDate);
      cutoff.setDate(cutoff.getDate() - days);
      const withinRetentionWindow = Number.isFinite(startDate.getTime()) && Date.now() >= cutoff.getTime();
      const recordedTotal = paymentRecords?.docs.reduce((sum, payment) => sum + Math.max(0, Number(payment.get("amount") ?? 0)), 0) ?? 0;
      const totalPaid = Math.max(0, recordedTotal || Number(paymentSummary?.get("total_paid") ?? 0));
      const amountPerCouple = Math.max(0, Number(retreat.amount_per_person ?? 0)) * 2;
      const configuredRetention = Math.round(amountPerCouple * percentage) / 100;
      const retainedAmount = withinRetentionWindow ? Math.min(totalPaid, configuredRetention) : 0;
      const refundDue = Math.max(0, Math.round((totalPaid - retainedAmount) * 100) / 100);
      const recordedRefund = Math.max(0, Number(previousSummary.refund_recorded_total ?? 0));
      const refundData = {
        refund_required: refundDue > 0,
        refund_status: refundDue > recordedRefund ? (recordedRefund > 0 ? "partial" : "pending") : refundDue > 0 ? "completed" : "not_required",
        refund_due_amount: refundDue,
        refund_total_paid: totalPaid,
        refund_retained_amount: retainedAmount,
        refund_retention_days_before_retreat: days,
        refund_non_refundable_percentage: withinRetentionWindow ? percentage : 0,
        refund_recorded_total: recordedRefund,
        refund_updated_at: FieldValue.serverTimestamp(),
      };
      transaction.set(summaryRef, refundData, {merge: true});
      if (retainedAmount > 0) {
        refundRetentionEvent = {
          action: "refund_retention_applied",
          message: "Retención aplicada",
          refund_amount: retainedAmount,
          refund_retained_amount: retainedAmount,
          refund_date: FieldValue.serverTimestamp(),
        };
      }
      if (refundDue > 0) {
        refundPendingEvent = {
          action: "refund_pending",
          message: "Devolución pendiente",
          refund_amount: refundDue,
          refund_date: FieldValue.serverTimestamp(),
        };
      }
      }
    }
    const eventAction = action === "archive" ? "archived" : action === "unarchive" ? "desarchived" : "transferred";
    transaction.update(rootRef, {retreat_id: targetRetreatId, is_archived: nextArchived, updated_by: actorUid});
    const statusPatch = {
      action: eventAction,
      ...(action === "archive" ? {archived_at: FieldValue.serverTimestamp(), archived_retreat_id: targetRetreatId} : {}),
      ...(action === "unarchive" ? {archived_at: null, archived_retreat_id: null} : {}),
      ...(action === "transfer" && currentlyArchived ? {archived_retreat_id: targetRetreatId} : {}),
      updated_by: actorUid,
      updated_at: FieldValue.serverTimestamp(),
    };
    transaction.set(rootRef.collection("details").doc("status"), {...(statusRef.data() ?? {}), ...statusPatch}, {merge: true});
    const suffix = createHash("sha256").update(`${requestId}:${action}:${Date.now()}`).digest("hex").slice(0, 8);
    const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${eventAction}_${suffix}`;
    transaction.create(rootRef.collection("history").doc(eventId), {
      request_id: requestId,
      retreat_id: targetRetreatId,
      source_retreat_id: sourceRetreatId,
      target_retreat_id: targetRetreatId,
      action: eventAction,
      collection_state: nextArchived ? "requests-archived" : "request",
      message: action === "archive" ? "Solicitud archivada" : action === "unarchive" ? "Solicitud desarchivada" : "Solicitud transferida a otro retiro",
      happened_at: FieldValue.serverTimestamp(),
      actor_uid: actorUid,
      actor_name: actorName,
    });
    for (const [suffix, refundEvent] of [["retention", refundRetentionEvent], ["pending", refundPendingEvent]] as const) {
      if (!refundEvent) continue;
      transaction.create(rootRef.collection("history").doc(`${eventId}_refund_${suffix}`), {
        request_id: requestId,
        retreat_id: targetRetreatId,
        collection_state: "requests-archived",
        ...refundEvent,
        happened_at: FieldValue.serverTimestamp(),
        actor_uid: actorUid,
        actor_name: actorName,
      });
    }
  });
  return {requestId, retreatId: targetRetreatId, isArchived: action === "archive" ? true : action === "unarchive" ? false : data.isArchived === true};
});
