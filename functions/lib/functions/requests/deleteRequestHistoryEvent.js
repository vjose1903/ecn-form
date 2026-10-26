"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRequestHistoryEvent = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const payments_1 = require("../payments/payments");
const text = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
exports.deleteRequestHistoryEvent = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const requestId = text(data.requestId);
    const eventId = text(data.eventId);
    if (!cityId || !requestId || !eventId)
        throw new https_1.HttpsError("invalid-argument", "Faltan la ciudad, solicitud o movimiento.");
    const uid = await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "history_delete");
    const rootRef = firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
    const historyRef = rootRef.collection("history").doc(eventId);
    const [root, event] = await Promise.all([rootRef.get(), historyRef.get()]);
    if (!root.exists || !event.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la solicitud o el movimiento.");
    const eventData = event.data() ?? {};
    if (eventData.request_id !== requestId)
        throw new https_1.HttpsError("failed-precondition", "El movimiento no pertenece a esta solicitud.");
    if (eventData.message === "Pareja marcada como informada") {
        if (!await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "update")
            || !await (0, authorization_1.hasCityFieldPermission)(request, cityId, "requests", "informed", "update")) {
            throw new https_1.HttpsError("permission-denied", "No tienes permiso para revertir el estado de información.");
        }
        await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
            const [rootSnapshot, statusSnapshot, informedSnapshot, historySnapshot] = await Promise.all([
                transaction.get(rootRef),
                transaction.get(rootRef.collection("details").doc("status")),
                transaction.get(rootRef.collection("details").doc("informed")),
                transaction.get(rootRef.collection("history")),
            ]);
            if (!rootSnapshot.exists || !historySnapshot.docs.some(item => item.id === eventId))
                throw new https_1.HttpsError("not-found", "El movimiento ya no está disponible.");
            const latest = historySnapshot.docs
                .filter(item => ["Pareja marcada como informada", "Pareja marcada como no informada"].includes(String(item.get("message"))))
                .sort((left, right) => (right.get("happened_at")?.toMillis?.() ?? 0) - (left.get("happened_at")?.toMillis?.() ?? 0))[0];
            if (latest?.id !== eventId || (informedSnapshot.exists ? informedSnapshot.get("is_informado") : statusSnapshot.get("is_informado")) !== true) {
                throw new https_1.HttpsError("failed-precondition", "Solo se puede revertir el movimiento de información más reciente.");
            }
            transaction.set(rootRef.collection("details").doc("informed"), {
                is_informado: false,
                updated_by: uid,
                updated_at: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.delete(historyRef);
        });
        return { deleted: true, kind: "information" };
    }
    if (eventData.message !== "Pago de pre retiro registrado")
        throw new https_1.HttpsError("failed-precondition", "Este movimiento no se puede revertir.");
    await (0, authorization_1.requireCityPermission)(request, cityId, "payments", "delete");
    const paymentId = text(eventData.payment_id);
    if (!paymentId)
        throw new https_1.HttpsError("failed-precondition", "El movimiento no identifica el pago.");
    const paymentRef = rootRef.collection("payments").doc(paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists)
        throw new https_1.HttpsError("not-found", "No se encontró el pago.");
    const receiptPath = text(paymentSnapshot.get("receipt_path"), 500);
    if (receiptPath && !receiptPath.startsWith(`receipts/${cityId}/`)) {
        throw new https_1.HttpsError("failed-precondition", "La ruta del recibo no coincide con la ciudad.");
    }
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const [currentEvent, currentPayment] = await Promise.all([transaction.get(historyRef), transaction.get(paymentRef)]);
        if (!currentEvent.exists || !currentPayment.exists)
            throw new https_1.HttpsError("not-found", "El pago o movimiento ya no está disponible.");
        transaction.update(historyRef, { deletion_pending: true, updated_by: uid });
        transaction.update(paymentRef, { deletion_pending: true, updated_by: uid });
    });
    const deleted = await (0, payments_1.finalizePendingPaymentDeletion)({ cityId, requestId, paymentId, eventId, actorUid: uid });
    return { deleted, kind: "payment", paymentId };
});
//# sourceMappingURL=deleteRequestHistoryEvent.js.map