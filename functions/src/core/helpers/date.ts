import {convertFirestoreTimestamp} from "../typescript/firebaseHelpers";

export const formatDate = (date: Date | string | null): string => {
  if (!date) return "No especificada";

  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return "No especificada";

  return dateObj.toLocaleDateString("es-ES", {day: "2-digit", month: "2-digit", year: "numeric"});
};

export const toDateOnlyString = (date: unknown): string => {
  const dateObj = convertFirestoreTimestamp(date);

  if (isNaN(dateObj.getTime())) {
    return "";
  }

  return dateObj.toISOString().split("T")[0];
};
