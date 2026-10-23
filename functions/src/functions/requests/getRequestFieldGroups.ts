import {onCall, HttpsError} from "firebase-functions/v2/https";
import {isSuperAdmin, requireAuthenticated} from "../../core/security/authorization";
import {v2Db} from "../../core/firebase-admin";

const statusFields = ["status", "action", "is_active", "created_at", "archived_at", "archived_retreat_id"];

export const getRequestFieldGroups = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
  const requestIds = Array.isArray(data.requestIds) ? [...new Set(data.requestIds.filter((id): id is string => typeof id === "string" && /^[^/]{1,180}$/.test(id)))] : [];
  if (!cityId || requestIds.length > 200) throw new HttpsError("invalid-argument", "La ciudad o lista de solicitudes no es válida.");
  requireAuthenticated(request);
  let requestPermissions: Record<string, any> = {};
  if (!isSuperAdmin(request)) {
    const member = await v2Db.doc(`city/${cityId}/members/${request.auth!.uid}`).get();
    if (!member.exists || member.get("status") !== "active") {
      throw new HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
    }
    const roleId = member.get("role_id");
    if (typeof roleId !== "string" || !roleId) throw new HttpsError("permission-denied", "No tienes un rol activo en esta ciudad.");
    const role = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    if (!role.exists || role.get("is_active") !== true) {
      throw new HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
    }
    const permissions = role.get("permissions") as Record<string, any> | undefined;
    requestPermissions = permissions?.requests ?? {};
    if (requestPermissions.list !== true && requestPermissions.read !== true) {
      throw new HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
    }
  }

  const canReadStatus = isSuperAdmin(request) || (requestPermissions.read === true && requestPermissions.fields?.status?.read === true);
  const canReadInformed = isSuperAdmin(request) || (requestPermissions.read === true && requestPermissions.fields?.informed?.read === true);
  const canUpdateRequests = isSuperAdmin(request) || requestPermissions.update === true;
  const canUpdateStatus = isSuperAdmin(request) || requestPermissions.fields?.status?.update === true;
  const canUpdateInformed = isSuperAdmin(request) || requestPermissions.fields?.informed?.update === true;

  const readableSections = [
    ...(canReadStatus ? ["status"] : []),
    ...(canReadInformed ? ["informed"] : []),
  ];
  const editableSections = [
    ...(canUpdateRequests && canUpdateStatus ? ["status"] : []),
    ...(canUpdateRequests && canUpdateInformed ? ["informed"] : []),
  ];
  return Object.fromEntries(await Promise.all(requestIds.map(async requestId => {
    const result: Record<string, unknown> = {readableSections, editableSections};
    if (!canReadStatus && !canReadInformed) return [requestId, result];
    const statusSnapshot = await v2Db.doc(`city/${cityId}/requests/${requestId}/details/status`).get();
    if (canReadStatus) {
      result.status = Object.fromEntries(statusFields
        .filter(field => statusSnapshot.get(field) !== undefined)
        .map(field => [field, statusSnapshot.get(field)]));
    }
    if (canReadInformed) {
      const informedSnapshot = await v2Db.doc(`city/${cityId}/requests/${requestId}/details/informed`).get();
      result.is_informado = informedSnapshot.exists ? informedSnapshot.get("is_informado") === true : statusSnapshot.get("is_informado") === true;
    }
    return [requestId, result];
  })));
});
