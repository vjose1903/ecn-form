import {createHash} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {hasCityFieldPermission, requireCityPermission} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";
import {requestIdentityKeys, requestIdentityLock} from "../../core/helpers/request-identity";

const dateInSantoDomingo = (value: unknown): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? value.toDate()
    : value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit"}).format(date);
};

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
  const confirmInformation = data.confirmInformation === true;
  const patch = data.patch;
  if (!cityId || !requestId || !patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new HttpsError("invalid-argument", "La ciudad, solicitud y cambios son obligatorios.");
  }
  const actorUid = await requireCityPermission(request, cityId, "requests", "update");
  const source = patch as Record<string, unknown>;
  const sections: Record<string, Record<string, unknown>> = {};
  const fieldsByGroup = confirmInformation
    ? {couple_basic: ["full_name"], contact: ["cell_phone"]}
    : allowedFields;
  for (const [group, fields] of Object.entries(fieldsByGroup)) {
    const normalized = normalizePersonGroup(source, fields);
    if (normalized) sections[group] = normalized;
  }
  if (confirmInformation) {
    for (const person of ["she", "he"]) {
      const name = (sections.couple_basic?.[person] as Record<string, unknown> | undefined)?.full_name;
      const phone = (sections.contact?.[person] as Record<string, unknown> | undefined)?.cell_phone;
      if (typeof name !== "string" || !name.trim() || name.trim().length > 180 || typeof phone !== "string" || !phone.trim() || phone.trim().length > 40) {
        throw new HttpsError("invalid-argument", "Debes confirmar el nombre y teléfono de ambas personas.");
      }
      (sections.couple_basic[person] as Record<string, unknown>).full_name = name.trim();
      (sections.contact[person] as Record<string, unknown>).cell_phone = phone.trim();
    }
  }
  if (!confirmInformation) {
    const relationshipKeys = ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"];
    const invitationKeys = ["who_invited_you", "who_invited_you_phone"];
    const statusKeys = ["status", "is_active"];
    const informedKeys = ["is_informado"];
    for (const [group, keys] of [["relationship", relationshipKeys], ["invitation", invitationKeys], ["status", statusKeys], ["informed", informedKeys]] as const) {
      const normalized = Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
      if (Object.keys(normalized).length) sections[group] = normalized;
    }
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
    if (confirmInformation) {
      if (root.get("is_archived") === true) throw new HttpsError("failed-precondition", "No se puede confirmar una solicitud archivada.");
      const retreatId = String(root.get("retreat_id") ?? "");
      const retreatSnapshot = retreatId ? await transaction.get(v2Db.doc(`city/${cityId}/retreat/${retreatId}`)) : null;
      const startDate = dateInSantoDomingo(retreatSnapshot?.get("start_date"));
      const today = dateInSantoDomingo(new Date());
      if (!startDate || !today || today > startDate) throw new HttpsError("failed-precondition", "El plazo para confirmar la información ya terminó.");
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
      const mergePeople = (previous: Record<string, unknown>, patch: Record<string, unknown> | undefined) => ({
        ...previous,
        ...Object.fromEntries(["she", "he"].flatMap(person => {
          const patchPerson = patch?.[person];
          if (!patchPerson || typeof patchPerson !== "object") return [];
          const previousPerson = previous[person] && typeof previous[person] === "object" ? previous[person] as Record<string, unknown> : {};
          return [[person, {...previousPerson, ...(patchPerson as Record<string, unknown>)}]];
        })),
      });
      const nextContact = mergePeople(previousContact, sections.contact);
      const nextIdentity = mergePeople(previousIdentity, sections.identity);
      const retreatId = String(root.get("retreat_id") ?? "");
      const active = root.get("is_archived") !== true;
      const previousKeys = requestIdentityKeys(previousContact, previousIdentity);
      const nextKeys = active ? requestIdentityKeys(nextContact, nextIdentity) : [];
      const lockRefs = [...new Set([...previousKeys, ...nextKeys])].map(key => requestIdentityLock(cityId, retreatId, key));
      const locks = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
      const locksByPath = new Map(lockRefs.map((ref, index) => [ref.path, locks[index]]));
      const nextRefs = nextKeys.map(key => requestIdentityLock(cityId, retreatId, key));
      for (const ref of nextRefs) {
        const lock = locksByPath.get(ref.path);
        if (lock?.exists && lock.get("request_id") !== requestId) {
          throw new HttpsError("already-exists", "Ya existe otra solicitud activa con uno de estos datos de contacto o identificación.");
        }
      }
      for (const key of previousKeys) {
        if (nextKeys.includes(key)) continue;
        const ref = requestIdentityLock(cityId, retreatId, key);
        if (locksByPath.get(ref.path)?.get("request_id") === requestId) transaction.delete(ref);
      }
      for (const ref of nextRefs) {
        if (locksByPath.get(ref.path)?.get("request_id") !== requestId) {
          transaction.create(ref, {request_id: requestId, retreat_id: retreatId, created_at: FieldValue.serverTimestamp()});
        }
      }
    }
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
    if (confirmInformation && root.get("isConfirmed") !== true) {
      transaction.update(rootRef, {isConfirmed: true});
    }
    if (Object.keys(changed).length && !confirmInformation) {
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
