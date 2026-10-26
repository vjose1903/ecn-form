import {createHash} from "node:crypto";
import {v2Db} from "../firebase-admin";

export const requestIdentityLock = (cityId: string, retreatId: string, identityKey: string) => {
  const id = createHash("sha256").update(`${retreatId}:${identityKey}`).digest("hex");
  return v2Db.doc(`city/${cityId}/request_identity_keys/${id}`);
};

export const requestIdentityKeys = (contact: Record<string, unknown>, identity: Record<string, unknown>): string[] => {
  const candidates = new Set<string>();
  for (const person of ["she", "he"]) {
    const contactData = contact[person] && typeof contact[person] === "object" ? contact[person] as Record<string, unknown> : {};
    const identityData = identity[person] && typeof identity[person] === "object" ? identity[person] as Record<string, unknown> : {};
    for (const [kind, rawValue] of [
      ["email", contactData.email],
      ["phone", contactData.cell_phone],
      ["identity", identityData.identity_number],
    ] as const) {
      const value = typeof rawValue === "string" ? rawValue.trim() : "";
      const normalized = kind === "email" ? value.toLowerCase() : kind === "phone" ? value.replace(/\D/g, "") : value.replace(/[\s-]/g, "").toUpperCase();
      if (normalized) candidates.add(`${kind}:${normalized}`);
    }
  }
  return [...candidates];
};
