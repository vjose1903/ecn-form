"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestContext = exports.getRequestPaths = exports.generateCoupleNames = exports.processEmails = void 0;
const concatWords_1 = require("../typescript/concatWords");
const firebaseHelpers_1 = require("../typescript/firebaseHelpers");
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
const getRequestPaths = ({ userId, retreatId }) => ({
    userRefPath: `user/${userId}`,
    retreatRefPath: `user/${userId}/retreat/${retreatId}`,
});
exports.getRequestPaths = getRequestPaths;
const getRequestContext = async ({ userId, retreatId }) => {
    const { userRefPath, retreatRefPath } = (0, exports.getRequestPaths)({ userId, retreatId });
    const [retreatInfo, userInfo] = await Promise.all([(0, firebaseHelpers_1.getRetreatInfo)(retreatRefPath), (0, firebaseHelpers_1.getAdminInfo)(userRefPath)]);
    return {
        userRefPath,
        retreatRefPath,
        retreatInfo,
        userInfo,
    };
};
exports.getRequestContext = getRequestContext;
//# sourceMappingURL=request.js.map