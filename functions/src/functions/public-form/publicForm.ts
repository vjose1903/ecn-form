import {createHash, randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {requestIdentityLock} from "../../core/helpers/request-identity";

const safeText = (value: unknown, max = 300): string => typeof value === "string" ? value.trim().slice(0, max) : "";

const timestampToIso = (value: unknown): string | null => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
};

const invalid = (field: string): never => {
  throw new HttpsError("invalid-argument", `El campo ${field} no tiene un formato válido.`);
};

const publicTextFields = (source: Record<string, unknown>, fields: string[]): Record<string, unknown> =>
  Object.fromEntries(fields.flatMap(field => {
    if (!(field in source)) return [];
    if (typeof source[field] !== "string") invalid(field);
    return [[field, safeText(source[field], field === "address" ? 500 : 240)]];
  }));

const publicDate = (value: unknown, field: string): Timestamp | null => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? Timestamp.fromDate(value) : invalid(field);
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : invalid(field);
  }
  if (typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as {seconds: unknown}).seconds);
    return Number.isFinite(seconds) ? Timestamp.fromMillis(seconds * 1000) : invalid(field);
  }
  return invalid(field);
};

const publicPersonDetails = (person: Record<string, unknown>, label: string) => {
  const identity: Record<string, unknown> = publicTextFields(person, ["identity_type", "identity_number", "birth_date_display", "religion", "religion_other", "church_name"]);
  if ("age" in person) {
    if (typeof person.age !== "number" || !Number.isFinite(person.age) || person.age < 0 || person.age > 120) invalid(`${label}.age`);
    identity.age = person.age;
  }
  if ("birth_date" in person) identity.birth_date = publicDate(person.birth_date, `${label}.birth_date`);
  if ("are_you_married" in person) {
    if (typeof person.are_you_married !== "boolean") invalid(`${label}.are_you_married`);
    identity.are_you_married = person.are_you_married;
  }

  const family = publicTextFields(person, ["emergency_full_name", "emergency_relationship", "emergency_phone"]);
  if ("have_children" in person) {
    if (typeof person.have_children !== "boolean") invalid(`${label}.have_children`);
    family.have_children = person.have_children;
  }
  if ("family_information" in person) {
    const familyInformation = person.family_information;
    if (!Array.isArray(familyInformation) || familyInformation.length > 50) return invalid(`${label}.family_information`);
    const validFamilyInformation = familyInformation as unknown[];
    family.family_information = validFamilyInformation.map((item: unknown, index: number) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`${label}.family_information[${index}]`);
      return publicTextFields(item as Record<string, unknown>, ["familiar_full_name", "familiar_phone", "familiar_relationship"]);
    });
  }
  return {identity, family};
};

export const getPublicFormData = onCall(async (request) => {
  const cityId = safeText((request.data as Record<string, unknown>)?.cityId, 100);
  if (!cityId) throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  const citySnapshot = await v2Db.doc(`city/${cityId}`).get();
  if (!citySnapshot.exists) throw new HttpsError("not-found", "No se encontró la ciudad.");
  const retreatSnapshot = await v2Db.collection(`city/${cityId}/retreat`)
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
        retreat_home: typeof data.retreat_home === "string" ? data.retreat_home : safeText((data.retreat_home as Record<string, unknown> | undefined)?.id, 160),
        modality: data.modality,
        mixedModalityData: data.mixedModalityData,
        amount_per_person: data.amount_per_person,
      };
    }),
  };
});

export const createPublicRequest = onCall(async (request) => {
  const input = request.data as Record<string, unknown>;
  const cityId = safeText(input.cityId, 100);
  const retreatId = safeText(input.retreatId, 160);
  const payload = input.payload;
  if (!cityId || !retreatId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Los datos de ciudad, retiro y solicitud son obligatorios.");
  }
  const retreatRef = v2Db.doc(`city/${cityId}/retreat/${retreatId}`);
  const retreat = await retreatRef.get();
  if (!retreat.exists || retreat.get("is_active") !== true || retreat.get("accept_requests") !== true) {
    throw new HttpsError("failed-precondition", "El retiro no está aceptando solicitudes.");
  }
  const maxRequestDate = retreat.get("max_request_date");
  if (maxRequestDate) {
    const deadline = maxRequestDate instanceof Timestamp ? maxRequestDate.toDate() : new Date(String(maxRequestDate));
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Santo_Domingo"}).format(new Date());
    const deadlineLabel = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Santo_Domingo"}).format(deadline);
    if (!Number.isFinite(deadline.getTime()) || deadlineLabel < today) {
      throw new HttpsError("failed-precondition", "El plazo para registrarse en este retiro ha terminado.");
    }
  }
  const source = payload as Record<string, unknown>;
  const she = source.she as Record<string, unknown> | undefined;
  const he = source.he as Record<string, unknown> | undefined;
  if (!she || !he || !safeText(she.full_name, 160) || !safeText(he.full_name, 160)) {
    throw new HttpsError("invalid-argument", "Faltan los nombres de ambos miembros de la pareja.");
  }
  const normalize = (value: unknown, kind: "email" | "phone" | "identity") => {
    const text = safeText(value, 240);
    return kind === "email" ? text.toLowerCase() : kind === "phone" ? text.replace(/\D/g, "") : text.replace(/[\s-]/g, "").toUpperCase();
  };
  const uniqueCandidates = new Set<string>();
  for (const person of [she, he]) {
    for (const kind of ["email", "phone", "identity"] as const) {
      const field = kind === "email" ? "email" : kind === "phone" ? "cell_phone" : "identity_number";
      const value = normalize(person[field], kind);
      if (value) uniqueCandidates.add(`${kind}:${value}`);
    }
  }
  const personDetails = {she: publicPersonDetails(she, "she"), he: publicPersonDetails(he, "he")};
  const relationship: Record<string, unknown> = publicTextFields(source, ["how_find_us", "how_find_us_other"]);
  if (!relationship.how_find_us) invalid("how_find_us");
  if ("have_wedding_date" in source) {
    if (typeof source.have_wedding_date !== "boolean") invalid("have_wedding_date");
    relationship.have_wedding_date = source.have_wedding_date;
  }
  for (const field of ["dating_period_year", "dating_period_month"] as const) {
    if (typeof source[field] !== "number" || !Number.isInteger(source[field])) invalid(field);
    const max = field === "dating_period_year" ? 80 : 11;
    if ((source[field] as number) < 0 || (source[field] as number) > max) invalid(field);
    relationship[field] = source[field];
  }
  if ("wedding_date" in source) relationship.wedding_date = publicDate(source.wedding_date, "wedding_date");
  if (relationship.have_wedding_date === true && !relationship.wedding_date) invalid("wedding_date");
  const requestId = `sol_${retreat.get("number") || retreatId.split("_")[0]}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 8)}`;
  const requestRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
  const timestamp = FieldValue.serverTimestamp();
  const details: Record<string, Record<string, unknown>> = {
    couple_basic: {
      she: publicTextFields(she, ["full_name", "nickname"]),
      he: publicTextFields(he, ["full_name", "nickname"]),
    },
    contact: {
      she: publicTextFields(she, ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"]),
      he: publicTextFields(he, ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"]),
    },
    identity: {she: personDetails.she.identity, he: personDetails.he.identity},
    family: {she: personDetails.she.family, he: personDetails.he.family},
    relationship,
    invitation: publicTextFields(source, ["who_invited_you", "who_invited_you_phone"]),
    status: {status: "pending", action: "new", is_active: true, is_informado: false, created_at: timestamp},
  };
  const requestsRef = v2Db.collection(`city/${cityId}/requests`);
  if (uniqueCandidates.size) {
    const existing = await requestsRef.where("retreat_id", "==", retreatId).where("is_archived", "==", false).get();
    const refs = existing.docs.flatMap(doc => [
      doc.ref.collection("details").doc("contact"),
      doc.ref.collection("details").doc("identity"),
    ]);
    const snapshots = refs.length ? await v2Db.getAll(...refs) : [];
    for (let index = 0; index < existing.docs.length; index++) {
      const contactData = snapshots[index * 2].data() ?? {};
      const identityData = snapshots[index * 2 + 1].data() ?? {};
      for (const person of ["she", "he"]) {
        for (const kind of ["email", "phone", "identity"] as const) {
          const field = kind === "email" ? "email" : kind === "phone" ? "cell_phone" : "identity_number";
          const source = kind === "identity" ? identityData : contactData;
          const personData = source[person] && typeof source[person] === "object" ? source[person] as Record<string, unknown> : {};
          const value = normalize(personData[field], kind);
          if (value && uniqueCandidates.has(`${kind}:${value}`)) {
            throw new HttpsError("already-exists", `Ya existe una solicitud con este ${kind === "email" ? "correo electrónico" : kind === "phone" ? "teléfono celular" : "número de identificación"}.`);
          }
        }
      }
    }
  }
  const identityLockRefs = [...uniqueCandidates].map(key => requestIdentityLock(cityId, retreatId, key));
  await v2Db.runTransaction(async transaction => {
    const identityLocks = await Promise.all(identityLockRefs.map(ref => transaction.get(ref)));
    if (identityLocks.some(lock => lock.exists)) {
      throw new HttpsError("already-exists", "Ya existe una solicitud con uno de estos datos de contacto o identificación.");
    }
    identityLockRefs.forEach(ref => transaction.create(ref, {request_id: requestId, retreat_id: retreatId, created_at: timestamp}));
    transaction.create(requestRef, {retreat_id: retreatId, is_archived: false, created_at: timestamp, created_by: request.auth?.uid ?? null});
    for (const [section, data] of Object.entries(details)) transaction.create(requestRef.collection("details").doc(section), {...data, created_by: request.auth?.uid ?? null});
    transaction.create(requestRef.collection("details").doc("payments_summary"), {legacy_field_present: true, has_payments: false, payments_count: 0, total_paid: 0, created_by: request.auth?.uid ?? null});
    transaction.create(requestRef.collection("history").doc(`hist_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_created_${requestId.slice(-8)}`), {
      request_id: requestId,
      retreat_id: retreatId,
      action: "new",
      collection_state: "request",
      message: "Solicitud creada",
      happened_at: timestamp,
    });
  });
  return {requestId};
});
