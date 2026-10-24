import "../../core/function-options";
import {
  FirestoreAuthEvent,
  onDocumentWrittenWithAuthContext,
  Change,
  DocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, v2Db} from "../../core/firebase-admin";
import {isSuperAdmin, requireAuthenticated, requireCityPermission} from "../../core/security/authorization";

type ChangeEvent = FirestoreAuthEvent<Change<DocumentSnapshot> | undefined>;

const comparable = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (item && typeof item === "object") {
    if (typeof (item as {toDate?: unknown}).toDate === "function") {
      return {timestamp: (item as {toDate: () => Date}).toDate().toISOString()};
    }
    if (typeof (item as {path?: unknown}).path === "string") {
      return {reference: (item as {path: string}).path};
    }
    if (item instanceof Uint8Array) {
      return {bytes: Buffer.from(item).toString("base64")};
    }
  }
  return item;
});

const buildChanges = (before: Record<string, unknown> | null, after: Record<string, unknown> | null) => {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, {before: unknown; after: unknown}> = {};

  for (const field of fields) {
    const previous = before?.[field];
    const next = after?.[field];
    if (comparable(previous) !== comparable(next)) {
      changes[field] = {
        before: previous === undefined ? null : previous,
        after: next === undefined ? null : next,
      };
    }
  }

  return changes;
};

export const resolveAuditActor = (event: Pick<ChangeEvent, "authId" | "authType">, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string | null => {
  const recordedActor = [after?.updated_by, after?.created_by, after?.actor_uid, after?.migration_actor_uid, before?.updated_by, before?.created_by, before?.actor_uid, before?.migration_actor_uid]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
  if ((event.authType as string) === "user" && typeof event.authId === "string") return event.authId;
  return recordedActor ?? (typeof event.authId === "string" ? event.authId : null);
};

const auditDocumentId = (event: ChangeEvent, resourceType: string, action: string): string => {
  const timestamp = new Date(event.time).toISOString().replace(/[-:.]/g, "");
  const type = resourceType.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "record";
  const eventId = event.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `aud_${timestamp}_${type}_${action}_${eventId}`;
};

const recordCityChange = async (event: ChangeEvent, cityId: string): Promise<void> => {
  const change = event.data;
  if (!change) return;

  const documentPath = change.after.exists ? change.after.ref.path : change.before.ref.path;
  if (documentPath.includes("/audit_logs/")) return;

  const before = change.before.exists ? change.before.data() ?? null : null;
  const after = change.after.exists ? change.after.data() ?? null : null;
  const changes = buildChanges(before, after);
  if (Object.keys(changes).length === 0) return;

  const action = before === null ? "create" : after === null ? "delete" : "update";
  const resourceType = documentPath.split("/").slice(-2, -1)[0] ?? "record";
  const auditId = auditDocumentId(event, resourceType, action);
  let actor = resolveAuditActor(event, before, after);
  if (!actor) {
    const segments = documentPath.split("/");
    const parentPath = segments.length > 2 ? segments.slice(0, -2).join("/") : "";
    if (parentPath) {
      const parent = await v2Db.doc(parentPath).get();
      const inheritedActor = parent.get("migration_actor_uid");
      if (typeof inheritedActor === "string") actor = inheritedActor;
    }
  }
  const auditRef = v2Db.doc(`city/${cityId}/audit_logs/${auditId}`);
  await auditRef.set({
    audit_id: auditId,
    event_id: event.id,
    action,
    actor_uid: actor,
    actor_type: actor ? "user" : event.authType,
    auth_type: event.authType,
    city_id: cityId,
    resource_path: documentPath,
    resource_type: resourceType,
    resource_id: documentPath.split("/").at(-1) ?? "unknown",
    occurred_at: new Date(event.time),
    changes,
    source: "firestore",
  });
};

const recordCityNestedChange = async (event: ChangeEvent, cityId: string): Promise<void> => {
  const change = event.data;
  if (!change) return;
  const path = change.after.exists ? change.after.ref.path : change.before.ref.path;
  if (path === `city/${cityId}`) return;
  return recordCityChange(event, cityId);
};

const recordGlobalChange = async (event: ChangeEvent): Promise<void> => {
  const change = event.data;
  if (!change) return;

  const documentPath = change.after.exists ? change.after.ref.path : change.before.ref.path;
  if (documentPath.split("/").includes("push_tokens")) return;
  const before = change.before.exists ? change.before.data() ?? null : null;
  const after = change.after.exists ? change.after.data() ?? null : null;
  const changes = buildChanges(before, after);
  if (Object.keys(changes).length === 0) return;

  const action = before === null ? "create" : after === null ? "delete" : "update";
  const resourceType = documentPath.split("/").slice(-2, -1)[0] ?? "record";
  const auditId = auditDocumentId(event, resourceType, action);
  let actor = resolveAuditActor(event, before, after);
  if (!actor) {
    const segments = documentPath.split("/");
    const parentPath = segments.length > 2 ? segments.slice(0, -2).join("/") : "";
    if (parentPath) {
      const parent = await v2Db.doc(parentPath).get();
      const inheritedActor = parent.get("migration_actor_uid");
      if (typeof inheritedActor === "string") actor = inheritedActor;
    }
  }
  await v2Db.doc(`global_audit_logs/${auditId}`).set({
    audit_id: auditId,
    event_id: event.id,
    action,
    actor_uid: actor,
    actor_type: actor ? "user" : event.authType,
    auth_type: event.authType,
    resource_path: documentPath,
    resource_type: resourceType,
    resource_id: documentPath.split("/").at(-1) ?? "unknown",
    occurred_at: new Date(event.time),
    changes,
    source: "firestore",
  });
};

export const getAuditActorNames = onCall(async (request) => {
  requireAuthenticated(request);
  const data = request.data as {cityId?: unknown; auditEvents?: unknown};
  if (typeof data.cityId !== "string" || !data.cityId.trim()) {
    throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  }
  const cityId = data.cityId.trim();
  if (!Array.isArray(data.auditEvents) || data.auditEvents.length > 50 || data.auditEvents.some(item =>
    !item || typeof item !== "object" || typeof (item as {id?: unknown}).id !== "string"
      || !(item as {id: string}).id.trim() || (item as {id: string}).id.includes('/') || (item as {id: string}).id.length > 200
      || typeof (item as {actorUid?: unknown}).actorUid !== "string" || !(item as {actorUid: string}).actorUid.trim()
      || (item as {actorUid: string}).actorUid.length > 128
  )) {
    throw new HttpsError("invalid-argument", "La lista de eventos no es válida.");
  }
  if (!isSuperAdmin(request)) await requireCityPermission(request, cityId, "audit", "list");
  const events = data.auditEvents as Array<{id: string; actorUid: string}>;
  if (!events.length) return {names: {}};
  const cityEvents = await v2Db.getAll(...events.map(event => v2Db.doc(`city/${cityId}/audit_logs/${event.id}`)));
  const globalEvents = isSuperAdmin(request)
    ? await v2Db.getAll(...events.map(event => v2Db.doc(`global_audit_logs/${event.id}`)))
    : [];
  const uids = [...new Set(events.filter((event, index) =>
    (cityEvents[index].get("actor_uid") === event.actorUid || globalEvents[index]?.get("actor_uid") === event.actorUid)
  ).map(event => event.actorUid))];
  if (!uids.length) return {names: {}};

  const profiles = await v2Db.getAll(...uids.map(uid => v2Db.doc(`user/${uid}`)));
  const authUsers = await admin.auth().getUsers(uids.map(uid => ({uid})));
  const authByUid = new Map(authUsers.users.map(user => [user.uid, user]));
  const names = Object.fromEntries(uids.map((uid, index) => {
    const profile = profiles[index];
    const displayName = String(profile.get("display_name") ?? "").trim();
    const composedName = [profile.get("first_name"), profile.get("last_name")]
      .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
      .join(" ")
      .trim();
    return [uid, displayName || composedName || authByUid.get(uid)?.displayName?.trim() || "Usuario sin nombre"];
  }));
  return {names};
});

export const auditCityDocumentChanges = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "city/{cityId}/{nestedPath=**}"},
  (event) => recordCityNestedChange(event, event.params.cityId)
);

export const auditCityRootChanges = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "city/{cityId}"},
  (event) => recordCityChange(event, event.params.cityId)
);

export const auditUserProfileChanges = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "user/{uid}"},
  recordGlobalChange
);

export const auditUserNestedChangesV2 = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "user/{uid}/{nestedPath=**}"},
  async (event) => {
    const change = event.data;
    if (!change) return;
    const path = change.after.exists ? change.after.ref.path : change.before.ref.path;
    if (path === `user/${event.params.uid}`) return;
    await recordGlobalChange(event);
  }
);

export const auditRetreatHomeChanges = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "retreat_home/{homeId}"},
  recordGlobalChange
);

export const auditFileChanges = onDocumentWrittenWithAuthContext(
  {database: "ecn-platform-v2", document: "files/{fileId}"},
  recordGlobalChange
);
