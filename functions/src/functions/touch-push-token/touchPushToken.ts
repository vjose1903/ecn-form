import {onRequest} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

const ALLOWED_ORIGINS = new Set(["https://ecn-platform.netlify.app", "http://localhost:4203"]);

interface TouchPushTokenBody {
  token?: string;
  userId?: string;
  reason?: string;
}

const setCorsHeaders = (req: any, res: any): void => {
  const origin = req.get("origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
};

export const touchPushTokenV2 = onRequest(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const {token, userId, reason} = (req.body || {}) as TouchPushTokenBody;
  const cleanToken = token?.trim();
  const cleanUserId = userId?.trim();

  if (!cleanToken || !cleanUserId) {
    res.status(400).json({ok: false, error: "missing-token-or-user"});
    return;
  }

  try {
    const tokenCollection = v2Db.collection(`user/${cleanUserId}/push_tokens`);
    const snapshot = await tokenCollection.where("token", "==", cleanToken).get();

    if (snapshot.empty) {
      res.status(404).json({ok: false, error: "token-not-found"});
      return;
    }

    const batch = v2Db.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        enabled: true,
        lastSeenAt: FieldValue.serverTimestamp(),
        backgroundTouchedAt: FieldValue.serverTimestamp(),
        backgroundTouchReason: reason || "unknown",
      });
    });

    await batch.commit();

    res.status(200).json({ok: true, updated: snapshot.size});
  } catch (error) {
    console.error("Error actualizando metadata de token push:", error);
    res.status(500).json({ok: false, error: "internal-error"});
  }
});
