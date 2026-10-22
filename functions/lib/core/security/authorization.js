"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableRolePermissions = exports.requirePermissionsWithinActorRole = exports.validateRolePermissions = exports.requireCityPermission = exports.hasCityFieldPermission = exports.hasCityPermission = exports.requireAuthenticated = exports.isSuperAdmin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../firebase-admin");
const resources = {
    city: ["read", "manage"],
    members: ["read", "list", "create", "update", "disable", "delete", "assign_role"],
    roles: ["read", "list", "create", "update", "delete"],
    retreat_homes: ["read", "list", "create", "assign", "update", "unassign"],
    retreats: ["read", "list", "create", "update", "delete"],
    requests: ["read", "list", "create", "update", "delete", "archive", "unarchive", "transfer", "history_read", "history_list", "history_delete"],
    payments: ["read", "list", "create", "update", "delete"],
    audit: ["read", "list"],
    files: ["read", "create", "update", "delete"],
};
const isSuperAdmin = (request) => request.auth?.token.super_admin === true;
exports.isSuperAdmin = isSuperAdmin;
const requireAuthenticated = (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Debes iniciar sesión.");
    return uid;
};
exports.requireAuthenticated = requireAuthenticated;
const hasCityPermission = async (request, cityId, resource, action) => {
    if ((0, exports.isSuperAdmin)(request))
        return true;
    const uid = request.auth?.uid;
    if (!uid || !cityId)
        return false;
    const memberSnapshot = await firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`).get();
    if (!memberSnapshot.exists || memberSnapshot.get("status") !== "active")
        return false;
    const roleId = memberSnapshot.get("role_id");
    if (typeof roleId !== "string" || !roleId)
        return false;
    const roleSnapshot = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    if (!roleSnapshot.exists || roleSnapshot.get("is_active") !== true)
        return false;
    const permissions = roleSnapshot.get("permissions");
    const resourcePermissions = permissions?.[resource];
    return resourcePermissions?.[action] === true;
};
exports.hasCityPermission = hasCityPermission;
const hasCityFieldPermission = async (request, cityId, resource, fieldGroup, action) => {
    if ((0, exports.isSuperAdmin)(request))
        return true;
    const uid = request.auth?.uid;
    if (!uid || !cityId)
        return false;
    const member = await firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`).get();
    if (!member.exists || member.get("status") !== "active")
        return false;
    const roleId = member.get("role_id");
    if (typeof roleId !== "string" || !roleId)
        return false;
    const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    if (!role.exists || role.get("is_active") !== true)
        return false;
    const permissions = role.get("permissions");
    const requestPermissions = permissions?.[resource];
    const fields = requestPermissions?.fields;
    const group = fields?.[fieldGroup];
    return group?.[action] === true;
};
exports.hasCityFieldPermission = hasCityFieldPermission;
const requireCityPermission = async (request, cityId, resource, action) => {
    const uid = (0, exports.requireAuthenticated)(request);
    if (!await (0, exports.hasCityPermission)(request, cityId, resource, action)) {
        throw new https_1.HttpsError("permission-denied", "No tienes permiso para realizar esta acción en la ciudad seleccionada.");
    }
    return uid;
};
exports.requireCityPermission = requireCityPermission;
const validateRolePermissions = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new https_1.HttpsError("invalid-argument", "La matriz de permisos no es válida.");
    }
    const input = value;
    const result = {};
    for (const [resource, actionsValue] of Object.entries(input)) {
        const allowedActions = resources[resource];
        if (!allowedActions || !actionsValue || typeof actionsValue !== "object" || Array.isArray(actionsValue)) {
            throw new https_1.HttpsError("invalid-argument", `El recurso ${resource} no está permitido.`);
        }
        const actions = actionsValue;
        const normalized = {};
        for (const [action, enabled] of Object.entries(actions)) {
            if (action === "fields" && resource === "requests") {
                if (!enabled || typeof enabled !== "object" || Array.isArray(enabled)) {
                    throw new https_1.HttpsError("invalid-argument", "Los permisos por sección no son válidos.");
                }
                const sections = enabled;
                const normalizedSections = {};
                for (const [section, fieldActions] of Object.entries(sections)) {
                    if (!/^[a-z][a-z0-9_]{0,39}$/.test(section) || !fieldActions || typeof fieldActions !== "object" || Array.isArray(fieldActions)) {
                        throw new https_1.HttpsError("invalid-argument", `La sección ${section} no es válida.`);
                    }
                    const normalizedFieldActions = {};
                    for (const [fieldAction, allowed] of Object.entries(fieldActions)) {
                        if (!["read", "create", "update"].includes(fieldAction) || typeof allowed !== "boolean") {
                            throw new https_1.HttpsError("invalid-argument", `La acción ${fieldAction} de ${section} no es válida.`);
                        }
                        normalizedFieldActions[fieldAction] = allowed;
                    }
                    normalizedSections[section] = normalizedFieldActions;
                }
                normalized.fields = normalizedSections;
                continue;
            }
            if (!allowedActions.includes(action) || typeof enabled !== "boolean") {
                throw new https_1.HttpsError("invalid-argument", `La acción ${resource}.${action} no está permitida.`);
            }
            normalized[action] = enabled;
        }
        result[resource] = normalized;
    }
    return result;
};
exports.validateRolePermissions = validateRolePermissions;
const requirePermissionsWithinActorRole = async (request, cityId, proposed) => {
    if ((0, exports.isSuperAdmin)(request))
        return;
    const uid = (0, exports.requireAuthenticated)(request);
    const member = await firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`).get();
    const roleId = member.get("role_id");
    if (typeof roleId !== "string")
        throw new https_1.HttpsError("permission-denied", "No se pudo validar el rol actual.");
    const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    const current = (role.get("permissions") ?? {});
    const assertSubset = (candidate, allowed, path) => {
        if (candidate === true && allowed !== true) {
            throw new https_1.HttpsError("permission-denied", `No puedes otorgar el permiso ${path} que tu rol no posee.`);
        }
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
            return;
        const candidateRecord = candidate;
        const allowedRecord = allowed && typeof allowed === "object" && !Array.isArray(allowed) ? allowed : {};
        for (const [key, value] of Object.entries(candidateRecord))
            assertSubset(value, allowedRecord[key], path ? `${path}.${key}` : key);
    };
    assertSubset(proposed, current, "");
};
exports.requirePermissionsWithinActorRole = requirePermissionsWithinActorRole;
exports.availableRolePermissions = resources;
//# sourceMappingURL=authorization.js.map