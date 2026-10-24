"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditFileChanges = exports.auditRetreatHomeChanges = exports.auditUserNestedChangesV2 = exports.auditUserProfileChanges = exports.auditCityRootChanges = exports.auditCityDocumentChanges = exports.getAuditActorNames = exports.resolveAuditActor = void 0;
require("../../core/function-options");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const comparable = (value) => JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object") {
        if (typeof item.toDate === "function") {
            return { timestamp: item.toDate().toISOString() };
        }
        if (typeof item.path === "string") {
            return { reference: item.path };
        }
        if (item instanceof Uint8Array) {
            return { bytes: Buffer.from(item).toString("base64") };
        }
    }
    return item;
});
const buildChanges = (before, after) => {
    const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    const changes = {};
    for (const field of fields) {
        const previous = before?.[field];
        const next = after?.[field];
        if (comparable(previous) !== comparable(next)) {
            changes[field] = {
                before: previous === undefined ? null : previous,
                after: next === undefined ? null : next,
            };
        }
    }
    return changes;
};
const resolveAuditActor = (event, before, after) => {
    const recordedActor = [after?.updated_by, after?.created_by, after?.actor_uid, after?.migration_actor_uid, before?.updated_by, before?.created_by, before?.actor_uid, before?.migration_actor_uid]
        .find((candidate) => typeof candidate === "string" && candidate.length > 0);
    if (event.authType === "user" && typeof event.authId === "string")
        return event.authId;
    return recordedActor ?? (typeof event.authId === "string" ? event.authId : null);
};
exports.resolveAuditActor = resolveAuditActor;
const auditDocumentId = (event, resourceType, action) => {
    const timestamp = new Date(event.time).toISOString().replace(/[-:.]/g, "");
    const type = resourceType.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "record";
    const eventId = event.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
    return `aud_${timestamp}_${type}_${action}_${eventId}`;
};
const recordCityChange = async (event, cityId) => {
    const change = event.data;
    if (!change)
        return;
    const documentPath = change.after.exists ? change.after.ref.path : change.before.ref.path;
    if (documentPath.includes("/audit_logs/"))
        return;
    const before = change.before.exists ? change.before.data() ?? null : null;
    const after = change.after.exists ? change.after.data() ?? null : null;
    const changes = buildChanges(before, after);
    if (Object.keys(changes).length === 0)
        return;
    const action = before === null ? "create" : after === null ? "delete" : "update";
    const resourceType = documentPath.split("/").slice(-2, -1)[0] ?? "record";
    const auditId = auditDocumentId(event, resourceType, action);
    let actor = (0, exports.resolveAuditActor)(event, before, after);
    if (!actor) {
        const segments = documentPath.split("/");
        const parentPath = segments.length > 2 ? segments.slice(0, -2).join("/") : "";
        if (parentPath) {
            const parent = await firebase_admin_1.v2Db.doc(parentPath).get();
            const inheritedActor = parent.get("migration_actor_uid");
            if (typeof inheritedActor === "string")
                actor = inheritedActor;
        }
    }
    const auditRef = firebase_admin_1.v2Db.doc(`city/${cityId}/audit_logs/${auditId}`);
    await auditRef.set({
        audit_id: auditId,
        event_id: event.id,
        action,
        actor_uid: actor,
        actor_type: actor ? "user" : event.authType,
        auth_type: event.authType,
        city_id: cityId,
        resource_path: documentPath,
        resource_type: resourceType,
        resource_id: documentPath.split("/").at(-1) ?? "unknown",
        occurred_at: new Date(event.time),
        changes,
        source: "firestore",
    });
};
const recordCityNestedChange = async (event, cityId) => {
    const change = event.data;
    if (!change)
        return;
    const path = change.after.exists ? change.after.ref.path : change.before.ref.path;
    if (path === `city/${cityId}`)
        return;
    return recordCityChange(event, cityId);
};
const recordGlobalChange = async (event) => {
    const change = event.data;
    if (!change)
        return;
    const documentPath = change.after.exists ? change.after.ref.path : change.before.ref.path;
    if (documentPath.split("/").includes("push_tokens"))
        return;
    const before = change.before.exists ? change.before.data() ?? null : null;
    const after = change.after.exists ? change.after.data() ?? null : null;
    const changes = buildChanges(before, after);
    if (Object.keys(changes).length === 0)
        return;
    const action = before === null ? "create" : after === null ? "delete" : "update";
    const resourceType = documentPath.split("/").slice(-2, -1)[0] ?? "record";
    const auditId = auditDocumentId(event, resourceType, action);
    let actor = (0, exports.resolveAuditActor)(event, before, after);
    if (!actor) {
        const segments = documentPath.split("/");
        const parentPath = segments.length > 2 ? segments.slice(0, -2).join("/") : "";
        if (parentPath) {
            const parent = await firebase_admin_1.v2Db.doc(parentPath).get();
            const inheritedActor = parent.get("migration_actor_uid");
            if (typeof inheritedActor === "string")
                actor = inheritedActor;
        }
    }
    await firebase_admin_1.v2Db.doc(`global_audit_logs/${auditId}`).set({
        audit_id: auditId,
        event_id: event.id,
        action,
        actor_uid: actor,
        actor_type: actor ? "user" : event.authType,
        auth_type: event.authType,
        resource_path: documentPath,
        resource_type: resourceType,
        resource_id: documentPath.split("/").at(-1) ?? "unknown",
        occurred_at: new Date(event.time),
        changes,
        source: "firestore",
    });
};
exports.getAuditActorNames = (0, https_1.onCall)(async (request) => {
    (0, authorization_1.requireAuthenticated)(request);
    const data = request.data;
    if (typeof data.cityId !== "string" || !data.cityId.trim()) {
        throw new https_1.HttpsError("invalid-argument", "La ciudad es obligatoria.");
    }
    const cityId = data.cityId.trim();
    if (!Array.isArray(data.auditEvents) || data.auditEvents.length > 50 || data.auditEvents.some(item => !item || typeof item !== "object" || typeof item.id !== "string"
        || !item.id.trim() || item.id.includes('/') || item.id.length > 200
        || typeof item.actorUid !== "string" || !item.actorUid.trim()
        || item.actorUid.length > 128)) {
        throw new https_1.HttpsError("invalid-argument", "La lista de eventos no es válida.");
    }
    if (!(0, authorization_1.isSuperAdmin)(request))
        await (0, authorization_1.requireCityPermission)(request, cityId, "audit", "list");
    const events = data.auditEvents;
    if (!events.length)
        return { names: {} };
    const cityEvents = await firebase_admin_1.v2Db.getAll(...events.map(event => firebase_admin_1.v2Db.doc(`city/${cityId}/audit_logs/${event.id}`)));
    const globalEvents = (0, authorization_1.isSuperAdmin)(request)
        ? await firebase_admin_1.v2Db.getAll(...events.map(event => firebase_admin_1.v2Db.doc(`global_audit_logs/${event.id}`)))
        : [];
    const uids = [...new Set(events.filter((event, index) => (cityEvents[index].get("actor_uid") === event.actorUid || globalEvents[index]?.get("actor_uid") === event.actorUid)).map(event => event.actorUid))];
    if (!uids.length)
        return { names: {} };
    const profiles = await firebase_admin_1.v2Db.getAll(...uids.map(uid => firebase_admin_1.v2Db.doc(`user/${uid}`)));
    const authUsers = await firebase_admin_1.admin.auth().getUsers(uids.map(uid => ({ uid })));
    const authByUid = new Map(authUsers.users.map(user => [user.uid, user]));
    const names = Object.fromEntries(uids.map((uid, index) => {
        const profile = profiles[index];
        const displayName = String(profile.get("display_name") ?? "").trim();
        const composedName = [profile.get("first_name"), profile.get("last_name")]
            .filter((part) => typeof part === "string" && Boolean(part.trim()))
            .join(" ")
            .trim();
        return [uid, displayName || composedName || authByUid.get(uid)?.displayName?.trim() || "Usuario sin nombre"];
    }));
    return { names };
});
exports.auditCityDocumentChanges = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "city/{cityId}/{nestedPath=**}" }, (event) => recordCityNestedChange(event, event.params.cityId));
exports.auditCityRootChanges = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "city/{cityId}" }, (event) => recordCityChange(event, event.params.cityId));
exports.auditUserProfileChanges = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "user/{uid}" }, recordGlobalChange);
exports.auditUserNestedChangesV2 = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "user/{uid}/{nestedPath=**}" }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const path = change.after.exists ? change.after.ref.path : change.before.ref.path;
    if (path === `user/${event.params.uid}`)
        return;
    await recordGlobalChange(event);
});
exports.auditRetreatHomeChanges = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "retreat_home/{homeId}" }, recordGlobalChange);
exports.auditFileChanges = (0, firestore_1.onDocumentWrittenWithAuthContext)({ database: "ecn-platform-v2", document: "files/{fileId}" }, recordGlobalChange);
//# sourceMappingURL=auditChanges.js.map