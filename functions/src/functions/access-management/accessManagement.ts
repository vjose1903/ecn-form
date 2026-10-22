import {randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, v2Db} from "../../core/firebase-admin";
import {
  isSuperAdmin,
  requireAuthenticated,
  requireCityPermission,
  requirePermissionsWithinActorRole,
  validateRolePermissions,
} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";

const slug = (value: string): string => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const requireText = (value: unknown, name: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new HttpsError("invalid-argument", `${name} es obligatorio y debe tener hasta ${maxLength} caracteres.`);
  }
  return value.trim();
};

export const saveCityRole = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  const name = requireText(data.name, "El nombre del rol", 80);
  const roleId = typeof data.roleId === "string" && data.roleId.trim() ? slug(data.roleId) : slug(name);
  if (!roleId || roleId.length > 60) throw new HttpsError("invalid-argument", "El identificador del rol no es válido.");
  const isActive = data.isActive !== false;
  const description = typeof data.description === "string" ? data.description.trim().slice(0, 240) : "";
  const permissions = validateRolePermissions(data.permissions);
  await requirePermissionsWithinActorRole(request, cityId, permissions);
  const roleRef = v2Db.doc(`city/${cityId}/roles/${roleId}`);
  const existing = await roleRef.get();
  const actorUid = await requireCityPermission(request, cityId, "roles", existing.exists ? "update" : "create");
  if (roleId === "city_admin" && !isSuperAdmin(request)) {
    throw new HttpsError("permission-denied", "Solo un superadmin puede cambiar el rol administrador de ciudad.");
  }
  const timestamp = FieldValue.serverTimestamp();
  const existingData = existing.data() ?? {};
  await roleRef.set({
    role_id: roleId,
    name,
    description,
    is_active: isActive,
    permissions,
    ...(existing.exists
      ? {created_by: existingData.created_by ?? actorUid, created_at: existingData.created_at ?? timestamp, updated_by: actorUid, updated_at: timestamp}
      : {created_by: actorUid, created_at: timestamp}),
  }, {merge: false});
  return {roleId};
});

export const createCityMember = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  const email = requireText(data.email, "El correo", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "El correo no es válido.");
  const displayName = requireText(data.displayName, "El nombre", 120);
  const phone = typeof data.phone === "string" ? data.phone.trim().slice(0, 40) : "";
  const roleId = requireText(data.roleId, "El rol", 60);
  const actorUid = await requireCityPermission(request, cityId, "members", "create");
  await requireCityPermission(request, cityId, "members", "assign_role");
  if (roleId === "city_admin" && !isSuperAdmin(request)) throw new HttpsError("permission-denied", "Solo un superadmin puede asignar el rol administrador de ciudad.");
  const role = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
  if (!role.exists || role.get("is_active") !== true) throw new HttpsError("failed-precondition", "El rol seleccionado no existe o está inactivo.");
  await requirePermissionsWithinActorRole(request, cityId, (role.get("permissions") ?? {}) as Record<string, unknown>);

  let createdUid = "";
  try {
    const account = await admin.auth().createUser({
      email,
      displayName,
      password: randomBytes(32).toString("base64url"),
      emailVerified: false,
      disabled: false,
    });
    createdUid = account.uid;
    const timestamp = FieldValue.serverTimestamp();
    const batch = v2Db.batch();
    batch.set(v2Db.doc(`user/${createdUid}`), {
      uid: createdUid,
      email,
      display_name: displayName,
      phone,
      primary_city_id: cityId,
      created_by: actorUid,
      created_at: timestamp,
    });
    batch.set(v2Db.doc(`city/${cityId}/members/${createdUid}`), {
      uid: createdUid,
      role_id: roleId,
      status: "active",
      created_by: actorUid,
      created_at: timestamp,
    });
    await batch.commit();
    return {uid: createdUid, email};
  } catch (error) {
    if (createdUid) await admin.auth().deleteUser(createdUid).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.includes("email-already-exists")) throw new HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
    throw new HttpsError("internal", "No se pudo crear la cuenta del equipo.");
  }
});

export const updateCityMember = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  const uid = requireText(data.uid, "El usuario", 128);
  const memberRef = v2Db.doc(`city/${cityId}/members/${uid}`);
  const current = await memberRef.get();
  if (!current.exists) throw new HttpsError("not-found", "El usuario no pertenece a esta ciudad.");

  const roleId = typeof data.roleId === "string" ? data.roleId.trim() : "";
  const status = typeof data.status === "string" ? data.status : "";
  if (!roleId && !["active", "disabled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Indica un rol nuevo o un estado válido.");
  }
  const actorUid = requireAuthenticated(request);
  if (roleId) {
    await requireCityPermission(request, cityId, "members", "assign_role");
    if (roleId === "city_admin" && !isSuperAdmin(request)) throw new HttpsError("permission-denied", "Solo un superadmin puede asignar el rol administrador de ciudad.");
    const role = await v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    if (!role.exists || role.get("is_active") !== true) throw new HttpsError("failed-precondition", "El rol seleccionado no existe o está inactivo.");
    await requirePermissionsWithinActorRole(request, cityId, (role.get("permissions") ?? {}) as Record<string, unknown>);
  }
  if (status) await requireCityPermission(request, cityId, "members", "disable");
  if (!roleId && !status) throw new HttpsError("invalid-argument", "No hay cambios para guardar.");

  const authUser = await admin.auth().getUser(uid);
  if (authUser.customClaims?.super_admin === true && !isSuperAdmin(request)) {
    throw new HttpsError("permission-denied", "Solo un superadmin puede modificar otra cuenta superadmin.");
  }
  const batch = v2Db.batch();
  batch.update(memberRef, {
    ...(roleId ? {role_id: roleId} : {}),
    ...(status ? {status} : {}),
    updated_by: actorUid,
    updated_at: FieldValue.serverTimestamp(),
  });
  if (status) await admin.auth().updateUser(uid, {disabled: status === "disabled"});
  try {
    await batch.commit();
  } catch (error) {
    if (status) await admin.auth().updateUser(uid, {disabled: authUser.disabled}).catch(() => undefined);
    throw error;
  }
  return {uid, roleId: roleId || current.get("role_id"), status: status || current.get("status")};
});

export const listCityMembers = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  await requireCityPermission(request, cityId, "members", "list");
  const members = await v2Db.collection(`city/${cityId}/members`).get();
  return {
    members: await Promise.all(members.docs.map(async member => {
      const profile = await v2Db.doc(`user/${member.id}`).get();
      return {uid: member.id, ...member.data(), email: profile.get("email") ?? "", display_name: profile.get("display_name") ?? "", phone: profile.get("phone") ?? ""};
    })),
  };
});

export const updateOwnProfile = onCall(async (request) => {
  const uid = requireAuthenticated(request);
  const data = request.data as Record<string, unknown>;
  const phone = typeof data.phone === "string" ? data.phone.trim().slice(0, 40) : "";
  if (!phone) throw new HttpsError("invalid-argument", "El teléfono es obligatorio.");
  await v2Db.doc(`user/${uid}`).update({phone, updated_by: uid, updated_at: FieldValue.serverTimestamp()});
  return {uid};
});

export const createCityRetreatHome = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  const name = requireText(data.name, "El nombre de la casa", 120);
  const actorUid = await requireCityPermission(request, cityId, "retreat_homes", "create");
  const homeId = slug(name);
  if (!homeId) throw new HttpsError("invalid-argument", "El nombre no permite generar un identificador válido.");
  const homeRef = v2Db.doc(`retreat_home/${homeId}`);
  const assignmentRef = v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`);
  if ((await homeRef.get()).exists) throw new HttpsError("already-exists", "Ya existe una casa con ese nombre.");
  const optionalText = (key: string, maxLength: number) => typeof data[key] === "string" ? (data[key] as string).trim().slice(0, maxLength) : "";
  const images = Array.isArray(data.images) ? data.images.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const batch = v2Db.batch();
  batch.create(homeRef, {
    name,
    phone: optionalText("phone", 40),
    address: optionalText("address", 240),
    location: optionalText("location", 500),
    images,
    created_by: actorUid,
    created_at: FieldValue.serverTimestamp(),
  });
  batch.create(assignmentRef, {
    home_id: homeId,
    is_active: true,
    created_by: actorUid,
    created_at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return {homeId};
});

export const updateCityRetreatHome = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const cityId = requireText(data.cityId, "La ciudad", 100);
  const homeId = requireText(data.homeId, "La casa de retiro", 160);
  const actorUid = await requireCityPermission(request, cityId, "retreat_homes", "update");
  const assignment = await v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`).get();
  if (!assignment.exists) throw new HttpsError("not-found", "La casa no está asignada a esta ciudad.");
  const patch: Record<string, unknown> = {updated_by: actorUid, updated_at: FieldValue.serverTimestamp()};
  for (const [key, maxLength] of [["name", 120], ["phone", 40], ["address", 240], ["location", 500]] as const) {
    if (typeof data[key] === "string") patch[key] = (data[key] as string).trim().slice(0, maxLength);
  }
  if (Array.isArray(data.images)) patch.images = data.images.filter((item): item is string => typeof item === "string").slice(0, 20);
  await v2Db.doc(`retreat_home/${homeId}`).update(patch);
  return {homeId};
});
