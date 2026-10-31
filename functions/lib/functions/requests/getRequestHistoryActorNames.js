"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestHistoryActorNames = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const actor_name_1 = require("../../core/helpers/actor-name");
exports.getRequestHistoryActorNames = (0, https_1.onCall)(async (request) => {
    const { cityId, requestId } = request.data ?? {};
    if (typeof cityId !== "string" || !/^[^/]{1,180}$/.test(cityId) || typeof requestId !== "string" || !/^[^/]{1,180}$/.test(requestId)) {
        throw new https_1.HttpsError("invalid-argument", "Ciudad o solicitud no válida.");
    }
    await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "history_read");
    await (0, authorization_1.requireCityPermission)(request, cityId, "requests", "history_list");
    const history = await firebase_admin_1.v2Db.collection(`city/${cityId}/requests/${requestId}/history`).get();
    const uids = [...new Set(history.docs.map(event => event.get("actor_uid")).filter((uid) => typeof uid === "string" && !!uid))];
    const names = await Promise.all(uids.map(async (uid) => {
        const name = await (0, actor_name_1.getActorName)(uid);
        return [uid, name === uid ? "Usuario sin nombre" : name];
    }));
    return { names: Object.fromEntries(names) };
});
//# sourceMappingURL=getRequestHistoryActorNames.js.map