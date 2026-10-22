import {createHash} from "node:crypto";

type Data = Record<string, unknown>;

const coupleGroups: Record<string, string[]> = {
  couple_basic: ["full_name", "nickname"],
  contact: ["city_of_residence", "address", "home_phone", "email", "cell_phone", "work_phone"],
  identity: ["age", "identity_type", "identity_number", "birth_date", "birth_date_display", "religion", "religion_other", "church_name", "are_you_married"],
  family: ["emergency_full_name", "emergency_relationship", "emergency_phone", "have_children", "family_information"],
};

const requestGroups: Record<string, string[]> = {
  relationship: ["how_find_us", "how_find_us_other", "have_wedding_date", "wedding_date", "dating_period_year", "dating_period_month"],
  invitation: ["who_invited_you", "who_invited_you_phone"],
  status: ["status", "action", "is_active", "is_informado", "created_at", "archived_at", "archived_retreat_id"],
};

const dateKey = (value: unknown): string => {
  const date = value instanceof Date ? value : value && typeof (value as {toDate?: unknown}).toDate === "function" ? (value as {toDate: () => Date}).toDate() : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida para generar el ID del documento");
  return date.toISOString().slice(0, 10).replace(/-/g, "");
};

const suffix = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 8);

export const createMigratedRequestId = (args: {
  retreatNumber: number | string;
  createdAt: unknown;
  legacyId: string;
}): string => {
  if (!args.retreatNumber || !args.legacyId) throw new Error("Número del retiro e ID anterior son requeridos");
  return `sol_${args.retreatNumber}_${dateKey(args.createdAt)}_${suffix(args.legacyId)}`;
};

export const createMigratedPaymentId = (payment: Data, legacyId: string, fallbackDate: unknown): string => {
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount < 0 || !legacyId) throw new Error("Monto e ID anterior son requeridos para el ID de pago");
  const amountSlug = amount.toString().replace(".", "_");
  return `pago_${dateKey(payment.payment_date ?? fallbackDate)}_${amountSlug}_${suffix(legacyId)}`;
};

export const splitLegacyRequest = (source: Data): {summary: Data; details: Record<string, Data>; payments: Array<{id: string; data: Data}>} => {
  const she = source.she && typeof source.she === "object" ? source.she as Data : {};
  const he = source.he && typeof source.he === "object" ? source.he as Data : {};
  const details: Record<string, Data> = {};
  const consumedRoot = new Set<string>(["she", "he", "pre_retreat_payments"]);
  const consumedCouple = new Set<string>();

  for (const [group, fields] of Object.entries(coupleGroups)) {
    const coupleData: Data = {};
    for (const person of ["she", "he"] as const) {
      const sourcePerson = person === "she" ? she : he;
      const picked = Object.fromEntries(fields.filter(field => field in sourcePerson).map(field => [field, sourcePerson[field]]));
      if (Object.keys(picked).length) coupleData[person] = picked;
      fields.forEach(field => consumedCouple.add(field));
    }
    if (Object.keys(coupleData).length) details[group] = coupleData;
  }

  for (const [group, fields] of Object.entries(requestGroups)) {
    const picked = Object.fromEntries(fields.filter(field => field in source).map(field => [field, source[field]]));
    fields.forEach(field => consumedRoot.add(field));
    if (Object.keys(picked).length) details[group] = picked;
  }

  const extraShe = Object.fromEntries(Object.entries(she).filter(([field]) => !consumedCouple.has(field)));
  const extraHe = Object.fromEntries(Object.entries(he).filter(([field]) => !consumedCouple.has(field)));
  const extraRoot = Object.fromEntries(Object.entries(source).filter(([field]) => !consumedRoot.has(field)));
  if (Object.keys(extraShe).length || Object.keys(extraHe).length || Object.keys(extraRoot).length
    || ("she" in source && Object.keys(she).length === 0)
    || ("he" in source && Object.keys(he).length === 0)) {
    details.legacy_extra = {
      ...("she" in source ? {she: extraShe} : {}),
      ...("he" in source ? {he: extraHe} : {}),
      ...extraRoot,
    };
  }

  const payments = Array.isArray(source.pre_retreat_payments) ? source.pre_retreat_payments as Data[] : [];
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
      id: createMigratedPaymentId(payment, String(payment.id ?? index), source.created_at),
      data: payment,
    })),
  };
};

export const reconstructLegacyRequest = (split: ReturnType<typeof splitLegacyRequest>): Data => {
  const restored = {...(split.details.legacy_extra ?? {})};
  for (const [group, fields] of Object.entries(coupleGroups)) {
    for (const person of ["she", "he"] as const) {
      const values = (split.details[group]?.[person] ?? {}) as Data;
      if (Object.keys(values).length) restored[person] = {...((restored[person] as Data | undefined) ?? {}), ...values};
      for (const field of fields) {
        const personData = restored[person] as Data | undefined;
        if (personData && field in personData && !(field in values)) {
          const { [field]: _value, ...remaining } = personData;
          restored[person] = remaining;
        }
      }
    }
  }
  for (const [group, fields] of Object.entries(requestGroups)) {
    const values = split.details[group] ?? {};
    for (const field of fields) if (field in values) restored[field] = values[field];
  }
  if (split.details.payments_summary?.legacy_field_present) {
    restored.pre_retreat_payments = split.payments.map(payment => payment.data);
  }
  return restored;
};
