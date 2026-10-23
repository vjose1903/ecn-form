import {HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {v2Db} from "../firebase-admin";

type PermissionMap = Record<string, unknown>;

const resources: Record<string, string[]> = {
  members: ["read", "list", "create", "update", "disable", "delete", "assign_role"],
  roles: ["read", "list", "create", "update", "delete"],
  retreat_homes: ["read", "list", "create", "assign", "update", "unassign"],
  retreats: ["read", "list", "create", "update", "delete"],
  requests: ["read", "list", "update", "delete", "archive", "unarchive", "transfer", "history_read", "history_list", "history_delete"],
  payments: ["read", "list", "create", "update", "delete"],
  audit: ["read", "list"],
  dashboard: ["total_requests", "request_status", "requests_per_retreat", "wedding_date", "inviter", "main_source", "dating_average", "participants_children", "church_marriage", "requests_status_chart", "requests_per_retreat_chart", "acquisition_source_chart", "retreat_evolution_chart", "dating_years_chart", "wedding_date_chart", "inviter_chart", "participant_ages_chart", "declared_religion_chart", "residence_city_chart"],
};

export const isSuperAdmin = (request: CallableRequest<unknown>): boolean => request.auth?.token.super_admin === true;

export const requireAuthenticated = (request: CallableRequest<unknown>): string => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  return uid;
};

export const hasCityPermission = async (
  request: CallableRequest<unknown>,
  cityId: string,
  resource: string,
  action: string,
): Promise<boolean> => {
  if (resource === "requests" && action === "create") return false;
  if (isSuperAdmin(request)) return true;
  const uid = request.auth?.uid;
  if (!uid || !cityId) return false;
  const memberSnapshot = await v2Db.doc(`city/${cityId}/members/${uid}`).get();
  if (!memberSnapshot.exists || memberSnapshot.get("status") !== "active") return false;
  const roleId = memberSnapshot.get("role_id");
  if (typeof roleId !== "string" || !roleId) return false;
  const roleSnapshot = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
  if (!roleSnapshot.exists || roleSnapshot.get("is_active") !== true) return false;
  const permissions = roleSnapshot.get("permissions") as PermissionMap | undefined;
  const resourcePermissions = permissions?.[resource] as PermissionMap | undefined;
  return resourcePermissions?.[action] === true;
};

export const hasCityFieldPermission = async (
  request: CallableRequest<unknown>,
  cityId: string,
  resource: string,
  fieldGroup: string,
  action: string,
): Promise<boolean> => {
  if (isSuperAdmin(request)) return true;
  const uid = request.auth?.uid;
  if (!uid || !cityId) return false;
  const member = await v2Db.doc(`city/${cityId}/members/${uid}`).get();
  if (!member.exists || member.get("status") !== "active") return false;
  const roleId = member.get("role_id");
  if (typeof roleId !== "string" || !roleId) return false;
  const role = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
  if (!role.exists || role.get("is_active") !== true) return false;
  const permissions = role.get("permissions") as PermissionMap | undefined;
  const requestPermissions = permissions?.[resource] as PermissionMap | undefined;
  const fields = requestPermissions?.fields as PermissionMap | undefined;
  const group = fields?.[fieldGroup] as PermissionMap | undefined;
  return action !== "create" && group?.[action] === true;
};

export const requireCityPermission = async (
  request: CallableRequest<unknown>,
  cityId: string,
  resource: string,
  action: string,
): Promise<string> => {
  const uid = requireAuthenticated(request);
  if (!await hasCityPermission(request, cityId, resource, action)) {
    throw new HttpsError("permission-denied", "No tienes permiso para realizar esta acción en la ciudad seleccionada.");
  }
  return uid;
};

export const validateRolePermissions = (value: unknown): PermissionMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "La matriz de permisos no es válida.");
  }
  const input = value as Record<string, unknown>;
  const result: PermissionMap = {};
  for (const [resource, actionsValue] of Object.entries(input)) {
    if (resource === "files" || resource === "city") continue;
    const allowedActions = resources[resource];
    if (!allowedActions || !actionsValue || typeof actionsValue !== "object" || Array.isArray(actionsValue)) {
      throw new HttpsError("invalid-argument", `El recurso ${resource} no está permitido.`);
    }
    const actions = actionsValue as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [action, enabled] of Object.entries(actions)) {
      if (resource === "requests" && action === "create") continue;
      if (action === "fields" && resource === "requests") {
        if (!enabled || typeof enabled !== "object" || Array.isArray(enabled)) {
          throw new HttpsError("invalid-argument", "Los permisos por sección no son válidos.");
        }
        const sections = enabled as Record<string, unknown>;
        const normalizedSections: Record<string, Record<string, boolean>> = {};
        for (const [section, fieldActions] of Object.entries(sections)) {
          if (!/^[a-z][a-z0-9_]{0,39}$/.test(section) || !fieldActions || typeof fieldActions !== "object" || Array.isArray(fieldActions)) {
            throw new HttpsError("invalid-argument", `La sección ${section} no es válida.`);
          }
          const normalizedFieldActions: Record<string, boolean> = {};
          for (const [fieldAction, allowed] of Object.entries(fieldActions as Record<string, unknown>)) {
            if (fieldAction === "create") continue;
            if (!["read", "create", "update"].includes(fieldAction) || typeof allowed !== "boolean") {
              throw new HttpsError("invalid-argument", `La acción ${fieldAction} de ${section} no es válida.`);
            }
            normalizedFieldActions[fieldAction] = allowed;
          }
          normalizedSections[section] = normalizedFieldActions;
        }
        normalized.fields = normalizedSections;
        continue;
      }
      if (!allowedActions.includes(action) || typeof enabled !== "boolean") {
        throw new HttpsError("invalid-argument", `La acción ${resource}.${action} no está permitida.`);
      }
      normalized[action] = enabled;
    }
    result[resource] = normalized;
  }
  return result;
};

export const requirePermissionsWithinActorRole = async (
  request: CallableRequest<unknown>,
  cityId: string,
  proposed: PermissionMap,
): Promise<void> => {
  if (isSuperAdmin(request)) return;
  const uid = requireAuthenticated(request);
  const member = await v2Db.doc(`city/${cityId}/members/${uid}`).get();
  const roleId = member.get("role_id");
  if (typeof roleId !== "string") throw new HttpsError("permission-denied", "No se pudo validar el rol actual.");
  const role = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
  const current = (role.get("permissions") ?? {}) as PermissionMap;
  const assertSubset = (candidate: unknown, allowed: unknown, path: string): void => {
    if (candidate === true && allowed !== true) {
      throw new HttpsError("permission-denied", `No puedes otorgar el permiso ${path} que tu rol no posee.`);
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const candidateRecord = candidate as Record<string, unknown>;
    const allowedRecord = allowed && typeof allowed === "object" && !Array.isArray(allowed) ? allowed as Record<string, unknown> : {};
    for (const [key, value] of Object.entries(candidateRecord)) assertSubset(value, allowedRecord[key], path ? `${path}.${key}` : key);
  };
  assertSubset(proposed, current, "");
};

export const availableRolePermissions = resources;
