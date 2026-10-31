import {onCall, HttpsError} from "firebase-functions/v2/https";
import {v2Db} from "../../core/firebase-admin";
import {requireCityPermission} from "../../core/security/authorization";
import {getActorName} from "../../core/helpers/actor-name";

export const getRequestHistoryActorNames = onCall(async request => {
  const {cityId, requestId} = request.data ?? {};
  if (typeof cityId !== "string" || !/^[^/]{1,180}$/.test(cityId) || typeof requestId !== "string" || !/^[^/]{1,180}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "Ciudad o solicitud no válida.");
  }
  await requireCityPermission(request, cityId, "requests", "history_read");
  await requireCityPermission(request, cityId, "requests", "history_list");
  const history = await v2Db.collection(`city/${cityId}/requests/${requestId}/history`).get();
  const uids = [...new Set(history.docs.map(event => event.get("actor_uid")).filter((uid): uid is string => typeof uid === "string" && !!uid))];
  const names = await Promise.all(uids.map(async uid => {
    const name = await getActorName(uid);
    return [uid, name === uid ? "Usuario sin nombre" : name];
  }));
  return {names: Object.fromEntries(names)};
});
