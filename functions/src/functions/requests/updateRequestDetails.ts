import {createHash} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {hasCityFieldPermission, requireCityPermission} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";

const allowedFields: Record<string, string[]> = {
  couple_basic: ["full_name", "nickname"],
  contact: ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"],
  identity: ["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"],
  family: ["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"],
};

const normalizePersonGroup = (value: unknown, keys: string[]): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const person of ["she", "he"]) {
    const source = (value as Record<string, unknown>)[person];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const record = source as Record<string, unknown>;
    const fields = keys.filter(key => key in record);
    if (fields.length) result[person] = Object.fromEntries(fields.map(key => [key, record[key]]));
  }
  return Object.keys(result).length ? result : null;
};

export const updateRequestDetails = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
  const requestId = typeof data.requestId === "string" ? data.requestId.trim() : "";
  const patch = data.patch;
  if (!cityId || !requestId || !patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new HttpsError("invalid-argument", "La ciudad, solicitud y cambios son obligatorios.");
  }
  const actorUid = await requireCityPermission(request, cityId, "requests", "update");
  const source = patch as Record<string, unknown>;
  const sections: Record<string, Record<string, unknown>> = {};
  for (const [group, fields] of Object.entries(allowedFields)) {
    const normalized = normalizePersonGroup(source, fields);
    if (normalized) sections[group] = normalized;
  }
  const relationshipKeys = ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"];
  const invitationKeys = ["who_invited_you", "who_invited_you_phone"];
  const statusKeys = ["status", "is_active"];
  const informedKeys = ["is_informado"];
  for (const [group, keys] of [["relationship", relationshipKeys], ["invitation", invitationKeys], ["status", statusKeys], ["informed", informedKeys]] as const) {
    const normalized = Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
    if (Object.keys(normalized).length) sections[group] = normalized;
  }
  if (!Object.keys(sections).length) throw new HttpsError("invalid-argument", "No hay campos editables en la solicitud.");
  for (const group of Object.keys(sections)) {
    if (!await hasCityFieldPermission(request, cityId, "requests", group, "update")) {
      throw new HttpsError("permission-denied", `No tienes permiso para modificar la sección ${group}.`);
    }
  }
  const rootRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
  const uid = request.auth?.uid ?? actorUid;
  const changed: Record<string, {before: unknown; after: unknown}> = {};
  await v2Db.runTransaction(async transaction => {
    const root = await transaction.get(rootRef);
    if (!root.exists) throw new HttpsError("not-found", "No se encontró la solicitud.");
    const entries = Object.entries(sections);
    const informedIndex = entries.findIndex(([group]) => group === "informed");
    const statusIndex = entries.findIndex(([group]) => group === "status");
    const [snapshots, legacyStatusSnapshot] = await Promise.all([
      Promise.all(entries.map(([group]) => transaction.get(rootRef.collection("details").doc(group)))),
      informedIndex !== -1 && statusIndex === -1
        ? transaction.get(rootRef.collection("details").doc("status"))
        : Promise.resolve(null),
    ]);
    const eventAt = FieldValue.serverTimestamp();
    for (let index = 0; index < entries.length; index++) {
      const [group, next] = entries[index];
      const previous = snapshots[index].data() ?? (group === "informed" && legacyStatusSnapshot?.exists
        ? {is_informado: legacyStatusSnapshot.get("is_informado")}
        : {});
      for (const [field, value] of Object.entries(next)) {
        if (JSON.stringify(previous[field] ?? null) !== JSON.stringify(value ?? null)) {
          changed[`${group}.${field}`] = {before: previous[field] ?? null, after: value ?? null};
        }
      }
      transaction.set(rootRef.collection("details").doc(group), {
        ...next,
        updated_by: uid,
        updated_at: eventAt,
      }, {merge: true});
    }
    if (Object.keys(changed).length) {
      const eventId = `hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_updated_${createHash("sha256").update(`${requestId}:${Date.now()}`).digest("hex").slice(0, 8)}`;
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
  return {updated: Object.keys(changed), actorUid: uid};
});
