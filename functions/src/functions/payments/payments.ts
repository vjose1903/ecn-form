import {createHash, randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {admin, v2Db} from "../../core/firebase-admin";
import {requireAuthenticated, requireCityPermission} from "../../core/security/authorization";
import {FieldValue, Timestamp} from "firebase-admin/firestore";

const text = (value: unknown, max = 200): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const dateSlug = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");
const requestRef = (cityId: string, requestId: string) => v2Db.doc(`city/${cityId}/requests/${requestId}`);
const paymentBucket = () => admin.storage().bucket("ecn-platform.firebasestorage.app");

export const finalizePendingPaymentDeletion = async (args: {cityId: string; requestId: string; paymentId: string; eventId: string; actorUid: string}): Promise<boolean> => {
  const {cityId, requestId, paymentId, eventId, actorUid} = args;
  const rootRef = requestRef(cityId, requestId);
  const paymentRef = rootRef.collection("payments").doc(paymentId);
  const historyRef = rootRef.collection("history").doc(eventId);
  const payment = await paymentRef.get();
  if (!payment.exists) return true;
  const receiptPath = text(payment.get("receipt_path"), 500);
  if (receiptPath) {
    try {
      await paymentBucket().file(receiptPath).delete({ignoreNotFound: true});
    } catch (error) {
      console.error("No se pudo borrar el recibo:", JSON.stringify(error instanceof Error ? {name: error.name, message: error.message} : error));
      return false;
    }
  }
  await v2Db.runTransaction(async transaction => {
    const summaryRef = rootRef.collection("details").doc("payments_summary");
    const [currentEvent, currentPayment, summary] = await Promise.all([
      transaction.get(historyRef), transaction.get(paymentRef), transaction.get(summaryRef),
    ]);
    if (!currentPayment.exists) return;
    if (!currentEvent.exists || currentEvent.get("deletion_pending") !== true || currentPayment.get("deletion_pending") !== true) {
      throw new HttpsError("failed-precondition", "El pago cambió durante su eliminación.");
    }
    const summaryData = summary.data() ?? {};
    const amount = Number(currentPayment.get("amount") ?? 0);
    transaction.set(summaryRef, {
      has_payments: Number(summaryData.payments_count ?? 0) > 1,
      payments_count: Math.max(0, Number(summaryData.payments_count ?? 1) - 1),
      total_paid: Math.max(0, Number(summaryData.total_paid ?? amount) - amount),
      updated_by: actorUid,
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});
    transaction.delete(paymentRef);
    transaction.delete(historyRef);
  });
  return true;
};

export const createPaymentUploadUrl = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const requestId = text(data.requestId, 160);
  const amount = Number(data.amount);
  const paymentDate = new Date(text(data.paymentDate, 40));
  const contentType = text(data.contentType, 80);
  const safeName = text(data.fileName, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cityId || !requestId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paymentDate.getTime()) || !/^image\/(jpeg|png|webp|heic)$/.test(contentType) || !safeName) {
    throw new HttpsError("invalid-argument", "Los datos del pago o del recibo no son válidos.");
  }
  if (paymentDate.getTime() > Date.now()) throw new HttpsError("invalid-argument", "La fecha del pago no puede ser futura.");
  await requireCityPermission(request, cityId, "payments", "create");
  const parent = await requestRef(cityId, requestId).get();
  if (!parent.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
  if (!Number.isFinite(Number(data.fileSize)) || Number(data.fileSize) <= 0 || Number(data.fileSize) > 5 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "El recibo debe ser una imagen de hasta 5 MB.");
  }
  const paymentId = `pago_${dateSlug(paymentDate)}_${amount.toString().replace(".", "_")}_${randomBytes(4).toString("hex")}`;
  const extension = safeName.includes(".") ? safeName.split(".").at(-1)!.toLowerCase() : "jpg";
  const receiptPath = `receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${paymentId}/receipt.${extension}`;
  const [uploadUrl] = await paymentBucket().file(receiptPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 2 * 60 * 1000,
    contentType,
  });
  return {uploadUrl, receiptPath, paymentId};
});

export const recordPayment = onCall(async request => {
  const uid = requireAuthenticated(request);
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const requestId = text(data.requestId, 160);
  const paymentId = text(data.paymentId, 180);
  const receiptPath = text(data.receiptPath, 500);
  const receiptName = text(data.receiptName, 180);
  const amount = Number(data.amount);
  const paymentDate = new Date(text(data.paymentDate, 40));
  await requireCityPermission(request, cityId, "payments", "create");
  if (!receiptPath.startsWith(`receipts/${cityId}/`) || !paymentId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paymentDate.getTime())) {
    throw new HttpsError("invalid-argument", "Los datos del pago no son válidos.");
  }
  if (paymentDate.getTime() > Date.now()) throw new HttpsError("invalid-argument", "La fecha del pago no puede ser futura.");
  const parentRef = requestRef(cityId, requestId);
  const parentSnapshot = await parentRef.get();
  if (!parentSnapshot.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
  const expectedReceiptPrefix = `receipts/${cityId}/${parentSnapshot.get("retreat_id")}/${requestId}/${paymentId}/`;
  if (!receiptPath.startsWith(expectedReceiptPrefix) || receiptPath.slice(expectedReceiptPrefix.length).includes("/")) {
    throw new HttpsError("invalid-argument", "La ruta del recibo no corresponde con este pago.");
  }
  const paymentRef = parentRef.collection("payments").doc(paymentId);
  const summaryRef = parentRef.collection("details").doc("payments_summary");
  const file = paymentBucket().file(receiptPath);
  const [fileExists] = await file.exists();
  if (!fileExists) throw new HttpsError("failed-precondition", "No se encontró el recibo cargado.");
  const [fileMetadata] = await file.getMetadata();
  if (Number(fileMetadata.size) <= 0 || Number(fileMetadata.size) > 5 * 1024 * 1024
    || !/^image\/(jpeg|png|webp|heic)$/.test(fileMetadata.contentType ?? "")) {
    await file.delete().catch(() => undefined);
    throw new HttpsError("failed-precondition", "El recibo cargado no cumple el formato permitido.");
  }
  try {
    await v2Db.runTransaction(async transaction => {
      const [parent, payment, summary] = await Promise.all([transaction.get(parentRef), transaction.get(paymentRef), transaction.get(summaryRef)]);
      if (!parent.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
      if (payment.exists) throw new HttpsError("already-exists", "Este pago ya fue registrado.");
      const previous = summary.data() ?? {};
      transaction.create(paymentRef, {
        payment_date: Timestamp.fromDate(paymentDate),
        amount,
        receipt_path: receiptPath,
        receipt_name: receiptName,
        created_at: FieldValue.serverTimestamp(),
        created_by: uid,
      });
      transaction.set(summaryRef, {
        legacy_field_present: true,
        has_payments: true,
        payments_count: Number(previous.payments_count ?? 0) + 1,
        total_paid: Number(previous.total_paid ?? 0) + amount,
        updated_by: uid,
        updated_at: FieldValue.serverTimestamp(),
      }, {merge: true});
      const eventId = `hist_${dateSlug(paymentDate)}_payment_${createHash("sha256").update(paymentId).digest("hex").slice(0, 8)}`;
      transaction.create(parentRef.collection("history").doc(eventId), {
        request_id: requestId,
        retreat_id: parent.get("retreat_id"),
        action: "updated",
        collection_state: "request",
        message: "Pago de pre retiro registrado",
        payment_id: paymentId,
        receipt_path: receiptPath,
        receipt_name: receiptName,
        changes: [{label: "Monto", previous_value: "", next_value: String(amount)}],
        happened_at: FieldValue.serverTimestamp(),
        actor_uid: uid,
      });
    });
  } catch (error) {
    const paymentExists = await paymentRef.get().then(snapshot => snapshot.exists).catch(() => true);
    if (!paymentExists) await file.delete({ignoreNotFound: true}).catch(() => undefined);
    throw error;
  }
  return {paymentId};
});

export const discardPaymentUpload = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const requestId = text(data.requestId, 160);
  const paymentId = text(data.paymentId, 180);
  const receiptPath = text(data.receiptPath, 500);
  await requireCityPermission(request, cityId, "payments", "create");
  const parent = await requestRef(cityId, requestId).get();
  if (!parent.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
  const expectedPrefix = `receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${paymentId}/`;
  if (!paymentId || !receiptPath.startsWith(expectedPrefix) || receiptPath.slice(expectedPrefix.length).includes("/")) {
    throw new HttpsError("invalid-argument", "La ruta del recibo no corresponde con este pago.");
  }
  const payment = await requestRef(cityId, requestId).collection("payments").doc(paymentId).get();
  if (payment.exists) return {deleted: false};
  await paymentBucket().file(receiptPath).delete({ignoreNotFound: true});
  return {deleted: true};
});

export const recoverPendingPaymentDeletions = onSchedule(
  {schedule: "0 * * * *", timeZone: "America/Santo_Domingo"},
  async () => {
    const pendingPayments = await v2Db.collectionGroup("payments").where("deletion_pending", "==", true).limit(100).get();
    for (const payment of pendingPayments.docs) {
      const [citySegment, cityId, requestsSegment, requestId] = payment.ref.path.split("/");
      if (citySegment !== "city" || requestsSegment !== "requests" || !cityId || !requestId) continue;
      const history = await payment.ref.parent.parent!.collection("history")
        .where("payment_id", "==", payment.id)
        .where("deletion_pending", "==", true)
        .limit(1)
        .get();
      if (history.empty) continue;
      const actorUid = text(payment.get("updated_by"), 180) || "system";
      try {
        await finalizePendingPaymentDeletion({cityId, requestId, paymentId: payment.id, eventId: history.docs[0].id, actorUid});
      } catch (error) {
        console.error("No se pudo recuperar la eliminación pendiente del pago:", JSON.stringify(error instanceof Error ? {name: error.name, message: error.message} : error));
      }
    }
  },
);

export const getPaymentReceiptUrl = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const requestId = text(data.requestId, 160);
  const paymentId = text(data.paymentId, 180);
  await requireCityPermission(request, cityId, "payments", "read");
  const payment = await requestRef(cityId, requestId).collection("payments").doc(paymentId).get();
  if (!payment.exists) throw new HttpsError("not-found", "No se encontró el pago.");
  const receiptPath = payment.get("receipt_path");
  if (typeof receiptPath !== "string" || !receiptPath.startsWith(`receipts/${cityId}/`)) {
    throw new HttpsError("failed-precondition", "El pago no tiene un recibo disponible.");
  }
  const [url] = await paymentBucket().file(receiptPath).getSignedUrl({version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000});
  return {url};
});
