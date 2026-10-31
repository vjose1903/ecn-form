"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefundReceiptUrl = exports.discardRefundUpload = exports.recordRefund = exports.createRefundUploadUrl = exports.getPaymentReceiptUrl = exports.recoverPendingPaymentDeletions = exports.discardPaymentUpload = exports.recordPayment = exports.createPaymentUploadUrl = exports.finalizePendingPaymentDeletion = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const actor_name_1 = require("../../core/helpers/actor-name");
const text = (value, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
const dateSlug = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const requestRef = (cityId, requestId) => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
const paymentBucket = () => firebase_admin_1.admin.storage().bucket("ecn-platform.firebasestorage.app");
const finalizePendingPaymentDeletion = async (args) => {
    const { cityId, requestId, paymentId, eventId, actorUid } = args;
    const rootRef = requestRef(cityId, requestId);
    const paymentRef = rootRef.collection("payments").doc(paymentId);
    const historyRef = rootRef.collection("history").doc(eventId);
    const payment = await paymentRef.get();
    if (!payment.exists)
        return true;
    const receiptPath = text(payment.get("receipt_path"), 500);
    if (receiptPath) {
        try {
            await paymentBucket().file(receiptPath).delete({ ignoreNotFound: true });
        }
        catch (error) {
            console.error("No se pudo borrar el recibo:", JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
            return false;
        }
    }
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const summaryRef = rootRef.collection("details").doc("payments_summary");
        const [currentEvent, currentPayment, summary] = await Promise.all([
            transaction.get(historyRef), transaction.get(paymentRef), transaction.get(summaryRef),
        ]);
        if (!currentPayment.exists)
            return;
        if (!currentEvent.exists || currentEvent.get("deletion_pending") !== true || currentPayment.get("deletion_pending") !== true) {
            throw new https_1.HttpsError("failed-precondition", "El pago cambió durante su eliminación.");
        }
        const summaryData = summary.data() ?? {};
        const amount = Number(currentPayment.get("amount") ?? 0);
        transaction.set(summaryRef, {
            has_payments: Number(summaryData.payments_count ?? 0) > 1,
            payments_count: Math.max(0, Number(summaryData.payments_count ?? 1) - 1),
            total_paid: Math.max(0, Number(summaryData.total_paid ?? amount) - amount),
            updated_by: actorUid,
            updated_at: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.delete(paymentRef);
        transaction.delete(historyRef);
    });
    return true;
};
exports.finalizePendingPaymentDeletion = finalizePendingPaymentDeletion;
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
    const actorName = await (0, actor_name_1.getActorName)(uid, request.auth?.token.name);
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
    try {
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
                actor_name: actorName,
            });
        });
    }
    catch (error) {
        const paymentExists = await paymentRef.get().then(snapshot => snapshot.exists).catch(() => true);
        if (!paymentExists)
            await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
    }
    return { paymentId };
});
exports.discardPaymentUpload = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const paymentId = text(data.paymentId, 180);
    const receiptPath = text(data.receiptPath, 500);
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    const parent = await requestRef(cityId, requestId).get();
    if (!parent.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
    const expectedPrefix = `receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${paymentId}/`;
    if (!paymentId || !receiptPath.startsWith(expectedPrefix) || receiptPath.slice(expectedPrefix.length).includes("/")) {
        throw new https_1.HttpsError("invalid-argument", "La ruta del recibo no corresponde con este pago.");
    }
    const payment = await requestRef(cityId, requestId).collection("payments").doc(paymentId).get();
    if (payment.exists)
        return { deleted: false };
    await paymentBucket().file(receiptPath).delete({ ignoreNotFound: true });
    return { deleted: true };
});
exports.recoverPendingPaymentDeletions = (0, scheduler_1.onSchedule)({ schedule: "0 * * * *", timeZone: "America/Santo_Domingo" }, async () => {
    const pendingPayments = await firebase_admin_1.v2Db.collectionGroup("payments").where("deletion_pending", "==", true).limit(100).get();
    for (const payment of pendingPayments.docs) {
        const [citySegment, cityId, requestsSegment, requestId] = payment.ref.path.split("/");
        if (citySegment !== "city" || requestsSegment !== "requests" || !cityId || !requestId)
            continue;
        const history = await payment.ref.parent.parent.collection("history")
            .where("payment_id", "==", payment.id)
            .where("deletion_pending", "==", true)
            .limit(1)
            .get();
        if (history.empty)
            continue;
        const actorUid = text(payment.get("updated_by"), 180) || "system";
        try {
            await (0, exports.finalizePendingPaymentDeletion)({ cityId, requestId, paymentId: payment.id, eventId: history.docs[0].id, actorUid });
        }
        catch (error) {
            console.error("No se pudo recuperar la eliminación pendiente del pago:", JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
        }
    }
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
exports.createRefundUploadUrl = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const refundId = text(data.refundId, 180);
    const contentType = text(data.contentType, 80);
    const safeName = text(data.fileName, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileSize = Number(data.fileSize);
    if (!cityId || !requestId || !/^devolucion_[a-zA-Z0-9_-]{1,80}$/.test(refundId) || !/^image\/(jpeg|png|webp|heic)$/.test(contentType) || !safeName || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
        throw new https_1.HttpsError("invalid-argument", "El recibo de devolución debe ser una imagen de hasta 5 MB.");
    }
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    const parent = await requestRef(cityId, requestId).get();
    if (!parent.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
    if (parent.get("is_archived") !== true)
        throw new https_1.HttpsError("failed-precondition", "Solo se pueden cargar recibos de solicitudes archivadas.");
    const extension = safeName.includes(".") ? safeName.split(".").at(-1).toLowerCase() : "jpg";
    const receiptPath = `refund-receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${refundId}/receipt.${extension}`;
    const [uploadUrl] = await paymentBucket().file(receiptPath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 2 * 60 * 1000, contentType });
    return { uploadUrl, receiptPath, refundId };
});
exports.recordRefund = (0, https_1.onCall)(async (request) => {
    const uid = (0, authorization_1.requireAuthenticated)(request);
    const actorName = await (0, actor_name_1.getActorName)(uid, request.auth?.token.name);
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const refundId = text(data.refundId, 180);
    const receiptPath = text(data.receiptPath, 500);
    const receiptName = text(data.receiptName, 180);
    const amount = Number(data.amount);
    const refundDate = new Date(text(data.refundDate, 40));
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    if (!cityId || !requestId || !/^devolucion_[a-zA-Z0-9_-]{1,80}$/.test(refundId) || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(refundDate.getTime()) || refundDate.getTime() > Date.now()) {
        throw new https_1.HttpsError("invalid-argument", "El monto o la fecha de devolución no son válidos.");
    }
    const rootRef = requestRef(cityId, requestId);
    const root = await rootRef.get();
    if (!root.exists || root.get("is_archived") !== true)
        throw new https_1.HttpsError("failed-precondition", "Solo se pueden devolver pagos de solicitudes archivadas.");
    const summaryRef = rootRef.collection("details").doc("payments_summary");
    const refundRef = rootRef.collection("refunds").doc(refundId);
    const eventId = `hist_${dateSlug(new Date())}_refund_${(0, node_crypto_1.randomBytes)(4).toString("hex")}`;
    const eventRef = rootRef.collection("history").doc(eventId);
    let receipt;
    if (receiptPath) {
        const prefix = `refund-receipts/${cityId}/${root.get("retreat_id")}/${requestId}/${refundId}/`;
        if (!receiptPath.startsWith(prefix) || receiptPath.slice(prefix.length).includes("/"))
            throw new https_1.HttpsError("invalid-argument", "La ruta del recibo no corresponde con esta devolución.");
        const file = paymentBucket().file(receiptPath);
        const [exists] = await file.exists();
        if (!exists)
            throw new https_1.HttpsError("failed-precondition", "No se encontró el recibo cargado.");
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) <= 0 || Number(metadata.size) > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|heic)$/.test(metadata.contentType ?? "")) {
            throw new https_1.HttpsError("failed-precondition", "El recibo no cumple el formato permitido.");
        }
        receipt = { path: receiptPath, name: receiptName };
    }
    try {
        await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
            const [currentParent, summary, existing] = await Promise.all([transaction.get(rootRef), transaction.get(summaryRef), transaction.get(refundRef)]);
            if (!currentParent.exists || currentParent.get("is_archived") !== true)
                throw new https_1.HttpsError("failed-precondition", "La solicitud dejó de estar archivada.");
            if (existing.exists)
                throw new https_1.HttpsError("already-exists", "La devolución ya fue registrada.");
            const summaryData = summary.data() ?? {};
            const due = Math.max(0, Number(summaryData.refund_due_amount ?? 0));
            const recorded = Math.max(0, Number(summaryData.refund_recorded_total ?? 0));
            if (amount > due - recorded + 0.001)
                throw new https_1.HttpsError("failed-precondition", "El monto supera el saldo pendiente de devolución.");
            const nextRecorded = Math.round((recorded + amount) * 100) / 100;
            const status = nextRecorded + 0.001 >= due ? "completed" : "partial";
            transaction.create(refundRef, { amount, refund_date: firestore_1.Timestamp.fromDate(refundDate), actor_uid: uid, actor_name: actorName, created_at: firestore_1.FieldValue.serverTimestamp(), ...(receipt ? { receipt_path: receipt.path, receipt_name: receipt.name } : {}) });
            transaction.set(summaryRef, { refund_recorded_total: nextRecorded, refund_status: status, refund_updated_at: firestore_1.FieldValue.serverTimestamp(), refund_updated_by: uid }, { merge: true });
            transaction.create(eventRef, { request_id: requestId, retreat_id: root.get("retreat_id"), action: "refund_recorded", collection_state: "requests-archived", message: "Devolución registrada", refund_id: refundId, refund_amount: amount, refund_date: firestore_1.Timestamp.fromDate(refundDate), ...(receipt ? { receipt_path: receipt.path, receipt_name: receipt.name } : {}), happened_at: firestore_1.FieldValue.serverTimestamp(), actor_uid: uid, actor_name: actorName });
        });
    }
    catch (error) {
        if (receipt)
            await paymentBucket().file(receipt.path).delete({ ignoreNotFound: true }).catch(cleanupError => {
                console.error("No se pudo limpiar el recibo de una devolución no registrada:", JSON.stringify(cleanupError instanceof Error ? { name: cleanupError.name, message: cleanupError.message } : cleanupError));
            });
        throw error;
    }
    return { refundId, amount };
});
exports.discardRefundUpload = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const refundId = text(data.refundId, 180);
    const receiptPath = text(data.receiptPath, 500);
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "create");
    const parent = await requestRef(cityId, requestId).get();
    if (!parent.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
    const prefix = `refund-receipts/${cityId}/${parent.get("retreat_id")}/${requestId}/${refundId}/`;
    if (!/^devolucion_[a-zA-Z0-9_-]{1,80}$/.test(refundId) || !receiptPath.startsWith(prefix) || receiptPath.slice(prefix.length).includes("/"))
        throw new https_1.HttpsError("invalid-argument", "La ruta del recibo no es válida.");
    if ((await requestRef(cityId, requestId).collection("refunds").doc(refundId).get()).exists)
        return { deleted: false };
    await paymentBucket().file(receiptPath).delete({ ignoreNotFound: true });
    return { deleted: true };
});
exports.getRefundReceiptUrl = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId, 160);
    const refundId = text(data.refundId, 180);
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "read");
    const refund = await requestRef(cityId, requestId).collection("refunds").doc(refundId).get();
    const receiptPath = refund.get("receipt_path");
    if (!refund.exists || typeof receiptPath !== "string" || !receiptPath.startsWith(`refund-receipts/${cityId}/`))
        throw new https_1.HttpsError("not-found", "No se encontró el recibo de devolución.");
    const [url] = await paymentBucket().file(receiptPath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000 });
    return { url };
});
//# sourceMappingURL=payments.js.map