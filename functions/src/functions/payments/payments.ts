import {createHash, randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, v2Db} from "../../core/firebase-admin";
import {requireAuthenticated, requireCityPermission} from "../../core/security/authorization";
import {FieldValue, Timestamp} from "firebase-admin/firestore";

const text = (value: unknown, max = 200): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const dateSlug = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");
const requestRef = (cityId: string, requestId: string) => v2Db.doc(`city/${cityId}/requests/${requestId}`);
const paymentBucket = () => admin.storage().bucket("ecn-platform.firebasestorage.app");

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
  return {paymentId};
});

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
