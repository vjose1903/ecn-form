"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRequestDetails = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const allowedFields = {
    couple_basic: ["full_name", "nickname"],
    contact: ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"],
    identity: ["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"],
    family: ["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"],
};
const normalizePersonGroup = (value, keys) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const result = {};
    for (const person of ["she", "he"]) {
        const source = value[person];
        if (!source || typeof source !== "object" || Array.isArray(source))
            continue;
        const record = source;
        const fields = keys.filter(key => key in record);
        if (fields.length)
            result[person] = Object.fromEntries(fields.map(key => [key, record[key]]));
    }
    return Object.keys(result).length ? result : null;
};
exports.updateRequestDetails = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
    const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
    const patch = data.patch;
    if (!cityId || !requestId || !patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new https_1.HttpsError("invalid-argument", "La ciudad, solicitud y cambios son obligatorios.");
    }
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "update");
    const source = patch;
    const sections = {};
    for (const [group, fields] of Object.entries(allowedFields)) {
        const normalized = normalizePersonGroup(source, fields);
        if (normalized)
            sections[group] = normalized;
    }
    const relationshipKeys = ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"];
    const invitationKeys = ["who_invited_you", "who_invited_you_phone"];
    const statusKeys = ["status", "is_active"];
    const informedKeys = ["is_informado"];
    for (const [group, keys] of [["relationship", relationshipKeys], ["invitation", invitationKeys], ["status", statusKeys], ["informed", informedKeys]]) {
        const normalized = Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
        if (Object.keys(normalized).length)
            sections[group] = normalized;
    }
    if (!Object.keys(sections).length)
        throw new https_1.HttpsError("invalid-argument", "No hay campos editables en la solicitud.");
    for (const group of Object.keys(sections)) {
        if (!await (0, authorization_1.hasCityFieldPermission)(request, cityId, "requests", group, "update")) {
            throw new https_1.HttpsError("permission-denied", `No tienes permiso para modificar la sección ${group}.`);
        }
    }
    const rootRef = firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
    const uid = request.auth?.uid ?? actorUid;
    const changed = {};
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const root = await transaction.get(rootRef);
        if (!root.exists)
            throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
        const entries = Object.entries(sections);
        const informedIndex = entries.findIndex(([group]) => group === "informed");
        const statusIndex = entries.findIndex(([group]) => group === "status");
        const [snapshots, legacyStatusSnapshot] = await Promise.all([
            Promise.all(entries.map(([group]) => transaction.get(rootRef.collection("details").doc(group)))),
            informedIndex !== -1 && statusIndex === -1
                ? transaction.get(rootRef.collection("details").doc("status"))
                : Promise.resolve(null),
        ]);
        const eventAt = firestore_1.FieldValue.serverTimestamp();
        for (let index = 0; index < entries.length; index++) {
            const [group, next] = entries[index];
            const previous = snapshots[index].data() ?? (group === "informed" && legacyStatusSnapshot?.exists
                ? { is_informado: legacyStatusSnapshot.get("is_informado") }
                : {});
            for (const [field, value] of Object.entries(next)) {
                if (JSON.stringify(previous[field] ?? null) !== JSON.stringify(value ?? null)) {
                    changed[`${group}.${field}`] = { before: previous[field] ?? null, after: value ?? null };
                }
            }
            transaction.set(rootRef.collection("details").doc(group), {
                ...next,
                updated_by: uid,
                updated_at: eventAt,
            }, { merge: true });
        }
        if (Object.keys(changed).length) {
            const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_updated_${(0, node_crypto_1.createHash)("sha256").update(`${requestId}:${Date.now()}`).digest("hex").slice(0, 8)}`;
            transaction.create(rootRef.collection("history").doc(eventId), {
                request_id: requestId,
                retreat_id: root.get("retreat_id"),
                action: "updated",
                collection_state: root.get("is_archived") ? "requests-archived" : "request",
                message: "Solicitud actualizada",
                happened_at: eventAt,
                actor_uid: uid,
                changes: Object.entries(changed).map(([label, values]) => ({
                    label,
                    previous_value: values.before == null ? "" : String(values.before),
                    next_value: values.after == null ? "" : String(values.after),
                })),
            });
        }
    });
    return { updated: Object.keys(changed), actorUid: uid };
});
//# sourceMappingURL=updateRequestDetails.js.map