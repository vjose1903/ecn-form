"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDateOnlyString = exports.formatDate = void 0;
const firebaseHelpers_1 = require("../typescript/firebaseHelpers");
const formatDate = (date) => {
    if (!date)
        return "No especificada";
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime()))
        return "No especificada";
    return dateObj.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
};
exports.formatDate = formatDate;
const toDateOnlyString = (date) => {
    const dateObj = (0, firebaseHelpers_1.convertFirestoreTimestamp)(date);
    if (isNaN(dateObj.getTime())) {
        return "";
    }
    return dateObj.toISOString().split("T")[0];
};
exports.toDateOnlyString = toDateOnlyString;
//# sourceMappingURL=date.js.map