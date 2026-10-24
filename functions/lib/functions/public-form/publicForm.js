"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicRequest = exports.getPublicFormData = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const safeText = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
const timestampToIso = (value) => {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate().toISOString();
    if (value instanceof Date)
        return value.toISOString();
    return typeof value === "string" ? value : null;
};
exports.getPublicFormData = (0, https_1.onCall)(async (request) => {
    const cityId = safeText(request.data?.cityId, 100);
    if (!cityId)
        throw new https_1.HttpsError("invalid-argument", "La ciudad es obligatoria.");
    const citySnapshot = await firebase_admin_1.v2Db.doc(`city/${cityId}`).get();
    if (!citySnapshot.exists)
        throw new https_1.HttpsError("not-found", "No se encontró la ciudad.");
    const retreatSnapshot = await firebase_admin_1.v2Db.collection(`city/${cityId}/retreat`)
        .where("is_active", "==", true)
        .where("accept_requests", "==", true)
        .get();
    const cityData = citySnapshot.data() ?? {};
    return {
        city: {
            id: cityId,
            key: cityData.key,
            label: cityData.label,
            large_label: cityData.large_label,
            definite_article: cityData.definite_article,
        },
        retreats: retreatSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                number: data.number,
                community_name: data.community_name,
                start_date: timestampToIso(data.start_date),
                end_date: timestampToIso(data.end_date),
                max_request_date: timestampToIso(data.max_request_date),
                retreat_home: typeof data.retreat_home === "string" ? data.retreat_home : safeText(data.retreat_home?.id, 160),
                modality: data.modality,
                mixedModalityData: data.mixedModalityData,
                amount_per_person: data.amount_per_person,
            };
        }),
    };
});
exports.createPublicRequest = (0, https_1.onCall)(async (request) => {
    const input = request.data;
    const cityId = safeText(input.cityId, 100);
    const retreatId = safeText(input.retreatId, 160);
    const payload = input.payload;
    if (!cityId || !retreatId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new https_1.HttpsError("invalid-argument", "Los datos de ciudad, retiro y solicitud son obligatorios.");
    }
    const retreatRef = firebase_admin_1.v2Db.doc(`city/${cityId}/retreat/${retreatId}`);
    const retreat = await retreatRef.get();
    if (!retreat.exists || retreat.get("is_active") !== true || retreat.get("accept_requests") !== true) {
        throw new https_1.HttpsError("failed-precondition", "El retiro no está aceptando solicitudes.");
    }
    const maxRequestDate = retreat.get("max_request_date");
    if (maxRequestDate) {
        const deadline = maxRequestDate instanceof firestore_1.Timestamp ? maxRequestDate.toDate() : new Date(String(maxRequestDate));
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
        const deadlineLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(deadline);
        if (!Number.isFinite(deadline.getTime()) || deadlineLabel < today) {
            throw new https_1.HttpsError("failed-precondition", "El plazo para registrarse en este retiro ha terminado.");
        }
    }
    const source = payload;
    const she = source.she;
    const he = source.he;
    if (!she || !he || !safeText(she.full_name, 160) || !safeText(he.full_name, 160)) {
        throw new https_1.HttpsError("invalid-argument", "Faltan los nombres de ambos miembros de la pareja.");
    }
    const normalize = (value, kind) => {
        const text = safeText(value, 240);
        return kind === "email" ? text.toLowerCase() : kind === "phone" ? text.replace(/\D/g, "") : text.replace(/[\s-]/g, "").toUpperCase();
    };
    const uniqueCandidates = new Set();
    for (const person of [she, he]) {
        for (const kind of ["email", "phone", "identity"]) {
            const field = kind === "email" ? "email" : kind === "phone" ? "cell_phone" : "identity_number";
            const value = normalize(person[field], kind);
            if (value)
                uniqueCandidates.add(`${kind}:${value}`);
        }
    }
    if (uniqueCandidates.size) {
        const existingRequests = await firebase_admin_1.v2Db.collection(`city/${cityId}/requests`)
            .where("retreat_id", "==", retreatId)
            .where("is_archived", "==", false)
            .get();
        for (const existing of existingRequests.docs) {
            const [contact, identity] = await Promise.all([
                existing.ref.collection("details").doc("contact").get(),
                existing.ref.collection("details").doc("identity").get(),
            ]);
            for (const person of ["she", "he"]) {
                const contactData = contact.get(person) ?? {};
                const identityData = identity.get(person) ?? {};
                for (const kind of ["email", "phone", "identity"]) {
                    const field = kind === "email" ? "email" : kind === "phone" ? "cell_phone" : "identity_number";
                    const value = normalize(kind === "identity" ? identityData[field] : contactData[field], kind);
                    if (value && uniqueCandidates.has(`${kind}:${value}`)) {
                        throw new https_1.HttpsError("already-exists", `Ya existe una solicitud con este ${kind === "email" ? "correo electrónico" : kind === "phone" ? "teléfono celular" : "número de identificación"}.`);
                    }
                }
            }
        }
    }
    const requestId = `sol_${retreat.get("number") || retreatId.split("_")[0]}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${(0, node_crypto_1.createHash)("sha256").update((0, node_crypto_1.randomBytes)(16)).digest("hex").slice(0, 8)}`;
    const requestRef = firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${requestId}`);
    const timestamp = firestore_1.FieldValue.serverTimestamp();
    const dateFields = (value) => value && typeof value === "object" && "seconds" in value
        ? firestore_1.Timestamp.fromMillis(Number(value.seconds) * 1000)
        : value;
    const details = {
        couple_basic: {
            she: { full_name: safeText(she.full_name, 160), nickname: safeText(she.nickname, 80) },
            he: { full_name: safeText(he.full_name, 160), nickname: safeText(he.nickname, 80) },
        },
        contact: {
            she: Object.fromEntries(["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"].map(key => [key, safeText(she[key], 240)])),
            he: Object.fromEntries(["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"].map(key => [key, safeText(he[key], 240)])),
        },
        identity: {
            she: Object.fromEntries(["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"].filter(key => key in she).map(key => [key, key === "birth_date" ? dateFields(she[key]) : she[key]])),
            he: Object.fromEntries(["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"].filter(key => key in he).map(key => [key, key === "birth_date" ? dateFields(he[key]) : he[key]])),
        },
        family: {
            she: Object.fromEntries(["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"].filter(key => key in she).map(key => [key, she[key]])),
            he: Object.fromEntries(["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"].filter(key => key in he).map(key => [key, he[key]])),
        },
        relationship: Object.fromEntries(["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"].filter(key => key in source).map(key => [key, key === "wedding_date" ? dateFields(source[key]) : source[key]])),
        invitation: Object.fromEntries(["who_invited_you", "who_invited_you_phone"].filter(key => key in source).map(key => [key, safeText(source[key], 240)])),
        status: { status: "pending", action: "new", is_active: true, is_informado: false, created_at: timestamp },
    };
    const batch = firebase_admin_1.v2Db.batch();
    batch.create(requestRef, { retreat_id: retreatId, is_archived: false, created_at: timestamp, created_by: request.auth?.uid ?? null });
    for (const [section, data] of Object.entries(details))
        batch.create(requestRef.collection("details").doc(section), { ...data, created_by: request.auth?.uid ?? null });
    batch.create(requestRef.collection("details").doc("payments_summary"), { legacy_field_present: true, has_payments: false, payments_count: 0, total_paid: 0, created_by: request.auth?.uid ?? null });
    batch.create(requestRef.collection("history").doc(`hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_created_${requestId.slice(-8)}`), {
        request_id: requestId,
        retreat_id: retreatId,
        action: "new",
        collection_state: "request",
        message: "Solicitud creada",
        happened_at: timestamp,
        actor_uid: request.auth?.uid ?? null,
    });
    await batch.commit();
    return { requestId };
});
//# sourceMappingURL=publicForm.js.map