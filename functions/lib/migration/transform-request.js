"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconstructLegacyRequest = exports.splitLegacyRequest = exports.createMigratedPaymentId = exports.createMigratedRequestId = void 0;
const node_crypto_1 = require("node:crypto");
const coupleGroups = {
    couple_basic: ["full_name", "nickname"],
    contact: ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"],
    identity: ["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"],
    family: ["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"],
};
const requestGroups = {
    relationship: ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"],
    invitation: ["who_invited_you", "who_invited_you_phone"],
    status: ["status", "action", "is_active", "is_informado", "created_at", "archived_at", "archived_retreat_id"],
};
const dateKey = (value) => {
    const date = value instanceof Date ? value : value && typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new Error("Fecha inválida para generar el ID del documento");
    return date.toISOString().slice(0, 10).replace(/-/g, "");
};
const suffix = (value) => (0, node_crypto_1.createHash)("sha256").update(value).digest("hex").slice(0, 8);
const createMigratedRequestId = (args) => {
    if (!args.retreatNumber || !args.legacyId)
        throw new Error("Número del retiro e ID anterior son requeridos");
    return `sol_${args.retreatNumber}_${dateKey(args.createdAt)}_${suffix(args.legacyId)}`;
};
exports.createMigratedRequestId = createMigratedRequestId;
const createMigratedPaymentId = (payment, legacyId, fallbackDate) => {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount < 0 || !legacyId)
        throw new Error("Monto e ID anterior son requeridos para el ID de pago");
    const amountSlug = amount.toString().replace(".", "_");
    return `pago_${dateKey(payment.payment_date ?? fallbackDate)}_${amountSlug}_${suffix(legacyId)}`;
};
exports.createMigratedPaymentId = createMigratedPaymentId;
const splitLegacyRequest = (source) => {
    const she = source.she && typeof source.she === "object" ? source.she : {};
    const he = source.he && typeof source.he === "object" ? source.he : {};
    const details = {};
    const consumedRoot = new Set(["she", "he", "pre_retreat_payments"]);
    const consumedCouple = new Set();
    for (const [group, fields] of Object.entries(coupleGroups)) {
        const coupleData = {};
        for (const person of ["she", "he"]) {
            const sourcePerson = person === "she" ? she : he;
            const picked = Object.fromEntries(fields.filter(field => field in sourcePerson).map(field => [field, sourcePerson[field]]));
            if (Object.keys(picked).length)
                coupleData[person] = picked;
            fields.forEach(field => consumedCouple.add(field));
        }
        if (Object.keys(coupleData).length)
            details[group] = coupleData;
    }
    for (const [group, fields] of Object.entries(requestGroups)) {
        const picked = Object.fromEntries(fields.filter(field => field in source).map(field => [field, source[field]]));
        fields.forEach(field => consumedRoot.add(field));
        if (Object.keys(picked).length)
            details[group] = picked;
    }
    const extraShe = Object.fromEntries(Object.entries(she).filter(([field]) => !consumedCouple.has(field)));
    const extraHe = Object.fromEntries(Object.entries(he).filter(([field]) => !consumedCouple.has(field)));
    const extraRoot = Object.fromEntries(Object.entries(source).filter(([field]) => !consumedRoot.has(field)));
    if (Object.keys(extraShe).length || Object.keys(extraHe).length || Object.keys(extraRoot).length
        || ("she" in source && Object.keys(she).length === 0)
        || ("he" in source && Object.keys(he).length === 0)) {
        details.legacy_extra = {
            ...("she" in source ? { she: extraShe } : {}),
            ...("he" in source ? { he: extraHe } : {}),
            ...extraRoot,
        };
    }
    const payments = Array.isArray(source.pre_retreat_payments) ? source.pre_retreat_payments : [];
    const totalPaid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    if ("pre_retreat_payments" in source) {
        details.payments_summary = {
            legacy_field_present: true,
            has_payments: payments.length > 0,
            payments_count: payments.length,
            total_paid: totalPaid,
        };
    }
    return {
        summary: {},
        details,
        payments: payments.map((payment, index) => ({
            id: (0, exports.createMigratedPaymentId)(payment, String(payment.id ?? index), source.created_at),
            data: payment,
        })),
    };
};
exports.splitLegacyRequest = splitLegacyRequest;
const reconstructLegacyRequest = (split) => {
    const restored = { ...(split.details.legacy_extra ?? {}) };
    for (const [group, fields] of Object.entries(coupleGroups)) {
        for (const person of ["she", "he"]) {
            const values = (split.details[group]?.[person] ?? {});
            if (Object.keys(values).length)
                restored[person] = { ...(restored[person] ?? {}), ...values };
            for (const field of fields) {
                const personData = restored[person];
                if (personData && field in personData && !(field in values)) {
                    const { [field]: _value, ...remaining } = personData;
                    restored[person] = remaining;
                }
            }
        }
    }
    for (const [group, fields] of Object.entries(requestGroups)) {
        const values = split.details[group] ?? {};
        for (const field of fields)
            if (field in values)
                restored[field] = values[field];
    }
    if (split.details.payments_summary?.legacy_field_present) {
        restored.pre_retreat_payments = split.payments.map(payment => payment.data);
    }
    return restored;
};
exports.reconstructLegacyRequest = reconstructLegacyRequest;
//# sourceMappingURL=transform-request.js.map