"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.touchPushTokenV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const ALLOWED_ORIGINS = new Set(["https://ecn-platform.netlify.app", "http://localhost:4203"]);
const setCorsHeaders = (req, res) => {
    const origin = req.get("origin");
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
};
exports.touchPushTokenV2 = (0, https_1.onRequest)(async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "method-not-allowed" });
        return;
    }
    const { token, userId, reason } = (req.body || {});
    const cleanToken = token?.trim();
    const cleanUserId = userId?.trim();
    if (!cleanToken || !cleanUserId) {
        res.status(400).json({ ok: false, error: "missing-token-or-user" });
        return;
    }
    try {
        const tokenCollection = firebase_admin_1.v2Db.collection(`user/${cleanUserId}/push_tokens`);
        const snapshot = await tokenCollection.where("token", "==", cleanToken).get();
        if (snapshot.empty) {
            res.status(404).json({ ok: false, error: "token-not-found" });
            return;
        }
        const batch = firebase_admin_1.v2Db.batch();
        snapshot.docs.forEach((doc) => {
            batch.update(doc.ref, {
                enabled: true,
                lastSeenAt: firestore_1.FieldValue.serverTimestamp(),
                backgroundTouchedAt: firestore_1.FieldValue.serverTimestamp(),
                backgroundTouchReason: reason || "unknown",
            });
        });
        await batch.commit();
        res.status(200).json({ ok: true, updated: snapshot.size });
    }
    catch (error) {
        console.error("Error actualizando metadata de token push:", error);
        res.status(500).json({ ok: false, error: "internal-error" });
    }
});
//# sourceMappingURL=touchPushToken.js.map