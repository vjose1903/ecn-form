"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdentityKeys = exports.requestIdentityLock = void 0;
const node_crypto_1 = require("node:crypto");
const firebase_admin_1 = require("../firebase-admin");
const requestIdentityLock = (cityId, retreatId, identityKey) => {
    const id = (0, node_crypto_1.createHash)("sha256").update(`${retreatId}:${identityKey}`).digest("hex");
    return firebase_admin_1.v2Db.doc(`city/${cityId}/request_identity_keys/${id}`);
};
exports.requestIdentityLock = requestIdentityLock;
const requestIdentityKeys = (contact, identity) => {
    const candidates = new Set();
    for (const person of ["she", "he"]) {
        const contactData = contact[person] && typeof contact[person] === "object" ? contact[person] : {};
        const identityData = identity[person] && typeof identity[person] === "object" ? identity[person] : {};
        for (const [kind, rawValue] of [
            ["email", contactData.email],
            ["phone", contactData.cell_phone],
            ["identity", identityData.identity_number],
        ]) {
            const value = typeof rawValue === "string" ? rawValue.trim() : "";
            const normalized = kind === "email" ? value.toLowerCase() : kind === "phone" ? value.replace(/\D/g, "") : value.replace(/[\s-]/g, "").toUpperCase();
            if (normalized)
                candidates.add(`${kind}:${normalized}`);
        }
    }
    return [...candidates];
};
exports.requestIdentityKeys = requestIdentityKeys;
//# sourceMappingURL=request-identity.js.map