"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyChanges = exports.historyValuesEqual = void 0;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !("toDate" in value);
const historyValuesEqual = (before, after) => {
    if (isRecord(before) || isRecord(after)) {
        const previous = isRecord(before) ? before : {};
        const next = isRecord(after) ? after : {};
        return [...new Set([...Object.keys(previous), ...Object.keys(next)])].every(key => (0, exports.historyValuesEqual)(previous[key], next[key]));
    }
    if (Array.isArray(before) || Array.isArray(after)) {
        return Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every((value, index) => (0, exports.historyValuesEqual)(value, after[index]));
    }
    return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
};
exports.historyValuesEqual = historyValuesEqual;
const formatValue = (value) => {
    if (value == null || value === "")
        return "Sin valor";
    if (typeof value === "boolean")
        return value ? "Sí" : "No";
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "object")
        return JSON.stringify(value);
    return String(value);
};
const historyChanges = (before, after, label) => {
    if ((0, exports.historyValuesEqual)(before, after))
        return [];
    if (isRecord(before) || isRecord(after)) {
        const previous = isRecord(before) ? before : {};
        const next = isRecord(after) ? after : {};
        return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
            .flatMap(key => (0, exports.historyChanges)(previous[key], next[key], `${label}.${key}`));
    }
    return [{ label, previous_value: formatValue(before), next_value: formatValue(after) }];
};
exports.historyChanges = historyChanges;
//# sourceMappingURL=history-changes.js.map