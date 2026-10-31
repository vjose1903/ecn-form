const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !("toDate" in value);

export const historyValuesEqual = (before: unknown, after: unknown): boolean => {
  if (isRecord(before) || isRecord(after)) {
    const previous = isRecord(before) ? before : {};
    const next = isRecord(after) ? after : {};
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])].every(key => historyValuesEqual(previous[key], next[key]));
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    return Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every((value, index) => historyValuesEqual(value, after[index]));
  }
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
};

const formatValue = (value: unknown): string => {
  if (value == null || value === "") return "Sin valor";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const historyChanges = (before: unknown, after: unknown, label: string): Array<{label: string; previous_value: string; next_value: string}> => {
  if (historyValuesEqual(before, after)) return [];
  if (isRecord(before) || isRecord(after)) {
    const previous = isRecord(before) ? before : {};
    const next = isRecord(after) ? after : {};
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .flatMap(key => historyChanges(previous[key], next[key], `${label}.${key}`));
  }
  return [{label, previous_value: formatValue(before), next_value: formatValue(after)}];
};
