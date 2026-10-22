"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentReceiptUrl = exports.recordPayment = exports.createPaymentUploadUrl = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const text = (value, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
const dateSlug = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const requestRef = (cityId, requestId) => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
const paymentBucket = () => firebase_admin_1.admin.storage().bucket("ecn-platform.firebasestorage.app");
exports.createPaymentUploadUrl = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const amount = Number(data.amount);
    const paymentDate = new Date(text(data.paymentDate, 40));
    const contentType = text(data.contentType, 80);
    const safeName = text(data.fileName, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!cityId || !requestId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paymentDate.getTime()) || !/^image\/(jpeg|png|webp|heic)$/.test(contentType) || !safeName) {
        throw new https_1.HttpsError("invalid-argument", "Los datos del pago o del recibo no son válidos.");
    }
    if (paymentDate.getTime() > Date.now())
        throw new https_1.HttpsError("invalid-argument", "La fecha del pago no puede ser futura.");
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    const parent = await requestRef(cityId, requestId).get();
    if (!parent.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
    if (!Number.isFinite(Number(data.fileSize)) || Number(data.fileSize) <= 0 || Number(data.fileSize) > 5 * 1024 * 1024) {
        throw new https_1.HttpsError("invalid-argument", "El recibo debe ser una imagen de hasta 5 MB.");
    }
    const paymentId = `pago_${dateSlug(paymentDate)}_${amount.toString().replace(".", "_")}_${(0, node_crypto_1.randomBytes)(4).toString("hex")}`;
    const extension = safeName.includes(".") ? safeName.split(".").at(-1).toLowerCase() : "jpg";
    const receiptPath = `receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${paymentId}/receipt.${extension}`;
    const [uploadUrl] = await paymentBucket().file(receiptPath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 2 * 60 * 1000,
        contentType,
    });
    return { uploadUrl, receiptPath, paymentId };
});
exports.recordPayment = (0, https_1.onCall)(async (request) => {
    const uid = (0, authorization_1.requireAuthenticated)(request);
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const paymentId = text(data.paymentId, 180);
    const receiptPath = text(data.receiptPath, 500);
    const receiptName = text(data.receiptName, 180);
    const amount = Number(data.amount);
    const paymentDate = new Date(text(data.paymentDate, 40));
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    if (!receiptPath.startsWith(`receipts/${cityId}/`) || !paymentId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paymentDate.getTime())) {
        throw new https_1.HttpsError("invalid-argument", "Los datos del pago no son válidos.");
    }
    if (paymentDate.getTime() > Date.now())
        throw new https_1.HttpsError("invalid-argument", "La fecha del pago no puede ser futura.");
    const parentRef = requestRef(cityId, requestId);
    const parentSnapshot = await parentRef.get();
    if (!parentSnapshot.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
    const expectedReceiptPrefix = `receipts/${cityId}/${parentSnapshot.get("retreat_id")}/${requestId}/${paymentId}/`;
    if (!receiptPath.startsWith(expectedReceiptPrefix) || receiptPath.slice(expectedReceiptPrefix.length).includes("/")) {
        throw new https_1.HttpsError("invalid-argument", "La ruta del recibo no corresponde con este pago.");
    }
    const paymentRef = parentRef.collection("payments").doc(paymentId);
    const summaryRef = parentRef.collection("details").doc("payments_summary");
    const file = paymentBucket().file(receiptPath);
    const [fileExists] = await file.exists();
    if (!fileExists)
        throw new https_1.HttpsError("failed-precondition", "No se encontró el recibo cargado.");
    const [fileMetadata] = await file.getMetadata();
    if (Number(fileMetadata.size) <= 0 || Number(fileMetadata.size) > 5 * 1024 * 1024
        || !/^image\/(jpeg|png|webp|heic)$/.test(fileMetadata.contentType ?? "")) {
        await file.delete().catch(() => undefined);
        throw new https_1.HttpsError("failed-precondition", "El recibo cargado no cumple el formato permitido.");
    }
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const [parent, payment, summary] = await Promise.all([transaction.get(parentRef), transaction.get(paymentRef), transaction.get(summaryRef)]);
        if (!parent.exists)
            throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
        if (payment.exists)
            throw new https_1.HttpsError("already-exists", "Este pago ya fue registrado.");
        const previous = summary.data() ?? {};
        transaction.create(paymentRef, {
            payment_date: firestore_1.Timestamp.fromDate(paymentDate),
            amount,
            receipt_path: receiptPath,
            receipt_name: receiptName,
            created_at: firestore_1.FieldValue.serverTimestamp(),
            created_by: uid,
        });
        transaction.set(summaryRef, {
            legacy_field_present: true,
            has_payments: true,
            payments_count: Number(previous.payments_count ?? 0) + 1,
            total_paid: Number(previous.total_paid ?? 0) + amount,
            updated_by: uid,
            updated_at: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        const eventId = `hist_${dateSlug(paymentDate)}_payment_${(0, node_crypto_1.createHash)("sha256").update(paymentId).digest("hex").slice(0, 8)}`;
        transaction.create(parentRef.collection("history").doc(eventId), {
            request_id: requestId,
            retreat_id: parent.get("retreat_id"),
            action: "updated",
            collection_state: "request",
            message: "Pago de pre retiro registrado",
            payment_id: paymentId,
            receipt_path: receiptPath,
            receipt_name: receiptName,
            changes: [{ label: "Monto", previous_value: "", next_value: String(amount) }],
            happened_at: firestore_1.FieldValue.serverTimestamp(),
            actor_uid: uid,
        });
    });
    return { paymentId };
});
exports.getPaymentReceiptUrl = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const paymentId = text(data.paymentId, 180);
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "read");
    const payment = await requestRef(cityId, requestId).collection("payments").doc(paymentId).get();
    if (!payment.exists)
        throw new https_1.HttpsError("not-found", "No se encontró el pago.");
    const receiptPath = payment.get("receipt_path");
    if (typeof receiptPath !== "string" || !receiptPath.startsWith(`receipts/${cityId}/`)) {
        throw new https_1.HttpsError("failed-precondition", "El pago no tiene un recibo disponible.");
    }
    const [url] = await paymentBucket().file(receiptPath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000 });
    return { url };
});
//# sourceMappingURL=payments.js.map