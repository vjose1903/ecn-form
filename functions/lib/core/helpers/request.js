"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCoupleNames = exports.processEmails = void 0;
const concatWords_1 = require("../typescript/concatWords");
const DEFAULT_NAMES = {
    SHE: "Ella",
    HE: "Él",
};
const processEmails = (she, he) => {
    const emails = [she?.email, he?.email]
        .filter((email) => Boolean(email))
        .map((email) => email.trim().toLowerCase());
    return [...new Set(emails)];
};
exports.processEmails = processEmails;
const generateCoupleNames = (she, he) => {
    const sheName = she?.full_name || DEFAULT_NAMES.SHE;
    const heName = he?.full_name || DEFAULT_NAMES.HE;
    return (0, concatWords_1.concatWords)([sheName, heName]);
};
exports.generateCoupleNames = generateCoupleNames;
//# sourceMappingURL=request.js.map