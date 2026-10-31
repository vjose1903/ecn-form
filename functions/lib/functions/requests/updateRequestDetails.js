"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRequestDetails = void 0;
const history_changes_1 = require("../../core/helpers/history-changes");
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const request_identity_1 = require("../../core/helpers/request-identity");
const actor_name_1 = require("../../core/helpers/actor-name");
const dateInSantoDomingo = (value) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return value;
    const date = value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
        ? value.toDate()
        : value instanceof Date ? value : new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime()))
        return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};
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
    const confirmInformation = data.confirmInformation === true;
    const patch = data.patch;
    if (!cityId || !requestId || !patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new https_1.HttpsError("invalid-argument", "La ciudad, solicitud y cambios son obligatorios.");
    }
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "update");
    const source = patch;
    const sections = {};
    const fieldsByGroup = confirmInformation
        ? { couple_basic: ["full_name"], contact: ["cell_phone"], family: ["family_information", "emergency_full_name", "emergency_relationship", "emergency_phone"] }
        : allowedFields;
    for (const [group, fields] of Object.entries(fieldsByGroup)) {
        const normalized = normalizePersonGroup(source, fields);
        if (normalized)
            sections[group] = normalized;
    }
    if (confirmInformation) {
        for (const person of ["she", "he"]) {
            const name = sections.couple_basic?.[person]?.full_name;
            const phone = sections.contact?.[person]?.cell_phone;
            if (typeof name !== "string" || !name.trim() || name.trim().length > 180 || typeof phone !== "string" || !phone.trim() || phone.trim().length > 40) {
                throw new https_1.HttpsError("invalid-argument", "Debes confirmar el nombre y teléfono de ambas personas.");
            }
            sections.couple_basic[person].full_name = name.trim();
            sections.contact[person].cell_phone = phone.trim();
            const family = sections.family?.[person];
            if (family) {
                const validateText = (value, max, required = false) => {
                    if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) {
                        throw new https_1.HttpsError("invalid-argument", "Revisa los nombres y parentescos de familiares y contactos de emergencia.");
                    }
                    return value.trim();
                };
                const validatePhone = (value) => {
                    const phone = validateText(value, 40);
                    if (phone && phone.replace(/\D/g, "").length !== 10)
                        throw new https_1.HttpsError("invalid-argument", "El teléfono debe tener diez dígitos.");
                    return phone;
                };
                for (const [key, max] of [["emergency_full_name", 180], ["emergency_relationship", 100]]) {
                    if (key in family)
                        family[key] = validateText(family[key], max);
                }
                if ("emergency_phone" in family)
                    family.emergency_phone = validatePhone(family.emergency_phone);
                if ("family_information" in family) {
                    if (!Array.isArray(family.family_information) || family.family_information.length > 10)
                        throw new https_1.HttpsError("invalid-argument", "La lista de familiares no es válida.");
                    family.family_information = family.family_information.map(member => {
                        if (!member || typeof member !== "object" || Array.isArray(member))
                            throw new https_1.HttpsError("invalid-argument", "El familiar no es válido.");
                        return {
                            familiar_full_name: validateText(member.familiar_full_name, 180, true),
                            familiar_relationship: validateText(member.familiar_relationship, 100, true),
                            familiar_phone: validatePhone(member.familiar_phone),
                        };
                    });
                }
            }
        }
    }
    if (!confirmInformation) {
        const relationshipKeys = ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"];
        const invitationKeys = ["who_invited_you", "who_invited_you_phone"];
        const statusKeys = ["status", "is_active"];
        const informedKeys = ["is_informado"];
        for (const [group, keys] of [["relationship", relationshipKeys], ["invitation", invitationKeys], ["status", statusKeys], ["informed", informedKeys]]) {
            const normalized = Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
            if (Object.keys(normalized).length)
                sections[group] = normalized;
        }
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
    const actorName = await (0, actor_name_1.getActorName)(uid, request.auth?.token.name);
    const changed = {};
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const root = await transaction.get(rootRef);
        if (!root.exists)
            throw new https_1.HttpsError("not-found", "No se encontró la solicitud.");
        if (confirmInformation) {
            if (root.get("is_archived") === true)
                throw new https_1.HttpsError("failed-precondition", "No se puede confirmar una solicitud archivada.");
            const retreatId = String(root.get("retreat_id") ?? "");
            const retreatSnapshot = retreatId ? await transaction.get(firebase_admin_1.v2Db.doc(`city/${cityId}/retreat/${retreatId}`)) : null;
            const startDate = dateInSantoDomingo(retreatSnapshot?.get("start_date"));
            const today = dateInSantoDomingo(new Date());
            const endDate = dateInSantoDomingo(retreatSnapshot?.get("end_date"));
            if (!startDate || !endDate || endDate < startDate || !today)
                throw new https_1.HttpsError("failed-precondition", "Las fechas del retiro no son válidas para confirmar la información.");
            const deadline = new Date(`${endDate}T00:00:00Z`);
            deadline.setUTCDate(deadline.getUTCDate() + 7);
            if (today < startDate || today > deadline.toISOString().slice(0, 10))
                throw new https_1.HttpsError("failed-precondition", "Solo puedes confirmar desde el inicio del retiro hasta siete días después de su finalización.");
        }
        const entries = Object.entries(sections);
        const informedIndex = entries.findIndex(([group]) => group === "informed");
        const statusIndex = entries.findIndex(([group]) => group === "status");
        const [snapshots, legacyStatusSnapshot] = await Promise.all([
            Promise.all(entries.map(([group]) => transaction.get(rootRef.collection("details").doc(group)))),
            informedIndex !== -1 && statusIndex === -1
                ? transaction.get(rootRef.collection("details").doc("status"))
                : Promise.resolve(null),
        ]);
        if (sections.contact || sections.identity) {
            const contactIndex = entries.findIndex(([group]) => group === "contact");
            const identityIndex = entries.findIndex(([group]) => group === "identity");
            const [contactSnapshot, identitySnapshot] = await Promise.all([
                contactIndex >= 0 ? Promise.resolve(snapshots[contactIndex]) : transaction.get(rootRef.collection("details").doc("contact")),
                identityIndex >= 0 ? Promise.resolve(snapshots[identityIndex]) : transaction.get(rootRef.collection("details").doc("identity")),
            ]);
            const previousContact = contactSnapshot.data() ?? {};
            const previousIdentity = identitySnapshot.data() ?? {};
            const mergePeople = (previous, patch) => ({
                ...previous,
                ...Object.fromEntries(["she", "he"].flatMap(person => {
                    const patchPerson = patch?.[person];
                    if (!patchPerson || typeof patchPerson !== "object")
                        return [];
                    const previousPerson = previous[person] && typeof previous[person] === "object" ? previous[person] : {};
                    return [[person, { ...previousPerson, ...patchPerson }]];
                })),
            });
            const nextContact = mergePeople(previousContact, sections.contact);
            const nextIdentity = mergePeople(previousIdentity, sections.identity);
            const retreatId = String(root.get("retreat_id") ?? "");
            const active = root.get("is_archived") !== true;
            const previousKeys = (0, request_identity_1.requestIdentityKeys)(previousContact, previousIdentity);
            const nextKeys = active ? (0, request_identity_1.requestIdentityKeys)(nextContact, nextIdentity) : [];
            const lockRefs = [...new Set([...previousKeys, ...nextKeys])].map(key => (0, request_identity_1.requestIdentityLock)(cityId, retreatId, key));
            const locks = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
            const locksByPath = new Map(lockRefs.map((ref, index) => [ref.path, locks[index]]));
            const nextRefs = nextKeys.map(key => (0, request_identity_1.requestIdentityLock)(cityId, retreatId, key));
            for (const ref of nextRefs) {
                const lock = locksByPath.get(ref.path);
                if (lock?.exists && lock.get("request_id") !== requestId) {
                    throw new https_1.HttpsError("already-exists", "Ya existe otra solicitud activa con uno de estos datos de contacto o identificación.");
                }
            }
            for (const key of previousKeys) {
                if (nextKeys.includes(key))
                    continue;
                const ref = (0, request_identity_1.requestIdentityLock)(cityId, retreatId, key);
                if (locksByPath.get(ref.path)?.get("request_id") === requestId)
                    transaction.delete(ref);
            }
            for (const ref of nextRefs) {
                if (locksByPath.get(ref.path)?.get("request_id") !== requestId) {
                    transaction.create(ref, { request_id: requestId, retreat_id: retreatId, created_at: firestore_1.FieldValue.serverTimestamp() });
                }
            }
        }
        const eventAt = firestore_1.FieldValue.serverTimestamp();
        for (let index = 0; index < entries.length; index++) {
            const [group, next] = entries[index];
            const previous = snapshots[index].data() ?? (group === "informed" && legacyStatusSnapshot?.exists
                ? { is_informado: legacyStatusSnapshot.get("is_informado") }
                : {});
            for (const [field, value] of Object.entries(next)) {
                if (!(0, history_changes_1.historyValuesEqual)(previous[field], value)) {
                    changed[`${group}.${field}`] = { before: previous[field] ?? null, after: value ?? null };
                }
            }
            transaction.set(rootRef.collection("details").doc(group), {
                ...next,
                updated_by: uid,
                updated_at: eventAt,
            }, { merge: true });
        }
        if (confirmInformation) {
            const wasConfirmed = root.get("isConfirmed") === true;
            transaction.update(rootRef, { isConfirmed: true, updated_by: uid, updated_at: eventAt });
            const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_information_confirmed_${(0, node_crypto_1.createHash)("sha256").update(`${requestId}:${Date.now()}`).digest("hex").slice(0, 8)}`;
            transaction.create(rootRef.collection("history").doc(eventId), {
                request_id: requestId,
                retreat_id: root.get("retreat_id"),
                action: "information_confirmed",
                collection_state: root.get("is_archived") ? "requests-archived" : "request",
                message: wasConfirmed ? "Información confirmada nuevamente" : "Información de la pareja confirmada",
                changes: Object.entries(changed).flatMap(([label, values]) => (0, history_changes_1.historyChanges)(values.before, values.after, label)),
                happened_at: eventAt,
                actor_uid: uid,
                actor_name: actorName,
            });
        }
        if (Object.keys(changed).length && !confirmInformation) {
            const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_updated_${(0, node_crypto_1.createHash)("sha256").update(`${requestId}:${Date.now()}`).digest("hex").slice(0, 8)}`;
            transaction.create(rootRef.collection("history").doc(eventId), {
                request_id: requestId,
                retreat_id: root.get("retreat_id"),
                action: "updated",
                collection_state: root.get("is_archived") ? "requests-archived" : "request",
                message: "Solicitud actualizada",
                happened_at: eventAt,
                actor_uid: uid,
                actor_name: actorName,
                changes: Object.entries(changed).flatMap(([label, values]) => (0, history_changes_1.historyChanges)(values.before, values.after, label)),
            });
        }
    });
    return { updated: Object.keys(changed), actorUid: uid };
});
//# sourceMappingURL=updateRequestDetails.js.map