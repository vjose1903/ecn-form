"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestFieldGroups = void 0;
const https_1 = require("firebase-functions/v2/https");
const authorization_1 = require("../../core/security/authorization");
const firebase_admin_1 = require("../../core/firebase-admin");
const statusFields = ["status", "action", "is_active", "created_at", "archived_at", "archived_retreat_id"];
exports.getRequestFieldGroups = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
    const requestIds = Array.isArray(data.requestIds) ? [...new Set(data.requestIds.filter((id) => typeof id === "string" && /^[^/]{1,180}$/.test(id)))] : [];
    if (!cityId || requestIds.length > 200)
        throw new https_1.HttpsError("invalid-argument", "La ciudad o lista de solicitudes no es válida.");
    (0, authorization_1.requireAuthenticated)(request);
    let requestPermissions = {};
    if (!(0, authorization_1.isSuperAdmin)(request)) {
        const member = await firebase_admin_1.v2Db.doc(`city/${cityId}/members/${request.auth.uid}`).get();
        if (!member.exists || member.get("status") !== "active") {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
        const roleId = member.get("role_id");
        if (typeof roleId !== "string" || !roleId)
            throw new https_1.HttpsError("permission-denied", "No tienes un rol activo en esta ciudad.");
        const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
        if (!role.exists || role.get("is_active") !== true) {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
        const permissions = role.get("permissions");
        requestPermissions = permissions?.requests ?? {};
        if (requestPermissions.list !== true && requestPermissions.read !== true) {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
    }
    const canReadStatus = (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.status?.read === true);
    const canReadInformed = (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.informed?.read === true);
    const canUpdateRequests = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.update === true;
    const canUpdateStatus = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.fields?.status?.update === true;
    const canUpdateInformed = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.fields?.informed?.update === true;
    const readableSections = [
        ...(canReadStatus ? ["status"] : []),
        ...(canReadInformed ? ["informed"] : []),
    ];
    const editableSections = [
        ...(canUpdateRequests && canUpdateStatus ? ["status"] : []),
        ...(canUpdateRequests && canUpdateInformed ? ["informed"] : []),
    ];
    return Object.fromEntries(await Promise.all(requestIds.map(async (requestId) => {
        const result = { readableSections, editableSections };
        if (!canReadStatus && !canReadInformed)
            return [requestId, result];
        const statusSnapshot = await firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}/details/status`).get();
        if (canReadStatus) {
            result.status = Object.fromEntries(statusFields
                .filter(field => statusSnapshot.get(field) !== undefined)
                .map(field => [field, statusSnapshot.get(field)]));
        }
        if (canReadInformed) {
            const informedSnapshot = await firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}/details/informed`).get();
            result.is_informado = informedSnapshot.exists ? informedSnapshot.get("is_informado") === true : statusSnapshot.get("is_informado") === true;
        }
        return [requestId, result];
    })));
});
//# sourceMappingURL=getRequestFieldGroups.js.map