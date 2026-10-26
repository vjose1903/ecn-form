"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeRequestLocation = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const request_identity_1 = require("../../core/helpers/request-identity");
exports.changeRequestLocation = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
    const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
    const action = data.action;
    const sourceRetreatId = typeof data.sourceRetreatId === "string" ? data.sourceRetreatId.trim() : "";
    const targetRetreatId = typeof data.targetRetreatId === "string" ? data.targetRetreatId.trim() : sourceRetreatId;
    if (!cityId || !requestId || !sourceRetreatId || !["archive", "unarchive", "transfer"].includes(String(action))) {
        throw new https_1.HttpsError("invalid-argument", "La acción o las referencias de ciudad, solicitud y retiro no son válidas.");
    }
    const permissionAction = action === "archive" ? "archive" : action === "unarchive" ? "unarchive" : "transfer";
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "requests", permissionAction);
    if (!await (0, authorization_1.hasCityFieldPermission)(request, cityId, "requests", "status", "update")) {
        throw new https_1.HttpsError("permission-denied", "No tienes permiso para modificar el estado de la solicitud.");
    }
    const rootRef = firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
    const targetRef = firebase_admin_1.v2Db.doc(`city/${cityId}/retreat/${targetRetreatId}`);
    if (targetRetreatId !== sourceRetreatId && !(await targetRef.get()).exists) {
        throw new https_1.HttpsError("not-found", "No se encontró el retiro de destino.");
    }
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const [root, statusRef, contactRef, identityRef] = await Promise.all([
            transaction.get(rootRef),
            transaction.get(rootRef.collection("details").doc("status")),
            transaction.get(rootRef.collection("details").doc("contact")),
            transaction.get(rootRef.collection("details").doc("identity")),
        ]);
        if (!root.exists)
            throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
        if (root.get("retreat_id") !== sourceRetreatId)
            throw new https_1.HttpsError("failed-precondition", "La solicitud ya fue trasladada a otro retiro.");
        const currentlyArchived = root.get("is_archived") === true;
        if (action === "archive" && currentlyArchived)
            throw new https_1.HttpsError("failed-precondition", "La solicitud ya está archivada.");
        if (action === "unarchive" && !currentlyArchived)
            throw new https_1.HttpsError("failed-precondition", "La solicitud ya está activa.");
        if (action === "transfer" && currentlyArchived !== (data.isArchived === true)) {
            throw new https_1.HttpsError("failed-precondition", "El estado de la solicitud cambió.");
        }
        const nextArchived = action === "archive" ? true : action === "unarchive" ? false : currentlyArchived;
        const identityKeys = (0, request_identity_1.requestIdentityKeys)(contactRef.data() ?? {}, identityRef.data() ?? {});
        const sourceLocks = identityKeys.map(key => (0, request_identity_1.requestIdentityLock)(cityId, sourceRetreatId, key));
        const targetLocks = nextArchived ? [] : identityKeys.map(key => (0, request_identity_1.requestIdentityLock)(cityId, targetRetreatId, key));
        const allLockRefs = [...new Map([...sourceLocks, ...targetLocks].map(ref => [ref.path, ref])).values()];
        const lockSnapshots = await Promise.all(allLockRefs.map(ref => transaction.get(ref)));
        const locksByPath = new Map(allLockRefs.map((ref, index) => [ref.path, lockSnapshots[index]]));
        for (const ref of targetLocks) {
            const targetLock = locksByPath.get(ref.path);
            if (targetLock?.exists && targetLock.get("request_id") !== requestId) {
                throw new https_1.HttpsError("already-exists", "No se puede restaurar o transferir la solicitud porque ya existe otra activa con los mismos datos.");
            }
        }
        if (nextArchived || sourceRetreatId !== targetRetreatId) {
            for (const ref of sourceLocks) {
                if (locksByPath.get(ref.path)?.get("request_id") === requestId)
                    transaction.delete(ref);
            }
        }
        for (const ref of targetLocks) {
            transaction.set(ref, { request_id: requestId, retreat_id: targetRetreatId, created_at: firestore_1.FieldValue.serverTimestamp() });
        }
        const eventAction = action === "archive" ? "archived" : action === "unarchive" ? "desarchived" : "transferred";
        transaction.update(rootRef, { retreat_id: targetRetreatId, is_archived: nextArchived, updated_by: actorUid });
        const statusPatch = {
            action: eventAction,
            ...(action === "archive" ? { archived_at: firestore_1.FieldValue.serverTimestamp(), archived_retreat_id: targetRetreatId } : {}),
            ...(action === "unarchive" ? { archived_at: null, archived_retreat_id: null } : {}),
            ...(action === "transfer" && currentlyArchived ? { archived_retreat_id: targetRetreatId } : {}),
            updated_by: actorUid,
            updated_at: firestore_1.FieldValue.serverTimestamp(),
        };
        transaction.set(rootRef.collection("details").doc("status"), { ...(statusRef.data() ?? {}), ...statusPatch }, { merge: true });
        const suffix = (0, node_crypto_1.createHash)("sha256").update(`${requestId}:${action}:${Date.now()}`).digest("hex").slice(0, 8);
        const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${eventAction}_${suffix}`;
        transaction.create(rootRef.collection("history").doc(eventId), {
            request_id: requestId,
            retreat_id: targetRetreatId,
            source_retreat_id: sourceRetreatId,
            target_retreat_id: targetRetreatId,
            action: eventAction,
            collection_state: nextArchived ? "requests-archived" : "request",
            message: action === "archive" ? "Solicitud archivada" : action === "unarchive" ? "Solicitud desarchivada" : "Solicitud transferida a otro retiro",
            happened_at: firestore_1.FieldValue.serverTimestamp(),
            actor_uid: actorUid,
        });
    });
    return { requestId, retreatId: targetRetreatId, isArchived: action === "archive" ? true : action === "unarchive" ? false : data.isArchived === true };
});
//# sourceMappingURL=changeRequestLocation.js.map