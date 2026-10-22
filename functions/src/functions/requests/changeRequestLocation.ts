import {createHash} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {hasCityFieldPermission, requireCityPermission} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";

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
  if (!await hasCityFieldPermission(request, cityId, "requests", "status", "update")) {
    throw new HttpsError("permission-denied", "No tienes permiso para modificar el estado de la solicitud.");
  }
  const rootRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
  const targetRef = v2Db.doc(`city/${cityId}/retreat/${targetRetreatId}`);
  if (targetRetreatId !== sourceRetreatId && !(await targetRef.get()).exists) {
    throw new HttpsError("not-found", "No se encontró el retiro de destino.");
  }
  await v2Db.runTransaction(async transaction => {
    const [root, statusRef] = await Promise.all([
      transaction.get(rootRef),
      transaction.get(rootRef.collection("details").doc("status")),
    ]);
    if (!root.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
    if (root.get("retreat_id") !== sourceRetreatId) throw new HttpsError("failed-precondition", "La solicitud ya fue trasladada a otro retiro.");
    const currentlyArchived = root.get("is_archived") === true;
    if (action === "archive" && currentlyArchived) throw new HttpsError("failed-precondition", "La solicitud ya está archivada.");
    if (action === "unarchive" && !currentlyArchived) throw new HttpsError("failed-precondition", "La solicitud ya está activa.");
    if (action === "transfer" && currentlyArchived !== (data.isArchived === true)) {
      throw new HttpsError("failed-precondition", "El estado de la solicitud cambió.");
    }
    const nextArchived = action === "archive" ? true : action === "unarchive" ? false : currentlyArchived;
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
    });
  });
  return {requestId, retreatId: targetRetreatId, isArchived: action === "archive" ? true : action === "unarchive" ? false : data.isArchived === true};
});
