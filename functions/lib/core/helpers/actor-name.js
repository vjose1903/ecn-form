"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActorName = void 0;
const firebase_admin_1 = require("../firebase-admin");
const getActorName = async (uid, tokenName) => {
    const profile = await firebase_admin_1.v2Db.doc(`user/${uid}`).get();
    const composedName = [profile.get("first_name"), profile.get("last_name")]
        .filter((part) => typeof part === "string" && Boolean(part.trim()))
        .join(" ")
        .trim();
    const profileName = String(profile.get("display_name") ?? "").trim();
    if (profileName || composedName)
        return profileName || composedName;
    if (typeof tokenName === "string" && tokenName.trim())
        return tokenName.trim();
    try {
        const authUser = await firebase_admin_1.admin.auth().getUser(uid);
        return authUser.displayName || authUser.email || uid;
    }
    catch {
        return uid;
    }
};
exports.getActorName = getActorName;
//# sourceMappingURL=actor-name.js.map