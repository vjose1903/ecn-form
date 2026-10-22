"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCityRetreatHome = exports.createCityRetreatHome = exports.updateOwnProfile = exports.listCityMembers = exports.updateCityMember = exports.createCityMember = exports.saveCityRole = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const slug = (value) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const requireText = (value, name, maxLength) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
        throw new https_1.HttpsError("invalid-argument", `${name} es obligatorio y debe tener hasta ${maxLength} caracteres.`);
    }
    return value.trim();
};
exports.saveCityRole = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const name = requireText(data.name, "El nombre del rol", 80);
    const roleId = typeof data.roleId === "string" && data.roleId.trim() ? slug(data.roleId) : slug(name);
    if (!roleId || roleId.length > 60)
        throw new https_1.HttpsError("invalid-argument", "El identificador del rol no es válido.");
    const isActive = data.isActive !== false;
    const description = typeof data.description === "string" ? data.description.trim().slice(0, 240) : "";
    const permissions = (0, authorization_1.validateRolePermissions)(data.permissions);
    await (0, authorization_1.requirePermissionsWithinActorRole)(request, cityId, permissions);
    const roleRef = firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`);
    const existing = await roleRef.get();
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "roles", existing.exists ? "update" : "create");
    if (roleId === "city_admin" && !(0, authorization_1.isSuperAdmin)(request)) {
        throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede cambiar el rol administrador de ciudad.");
    }
    const timestamp = firestore_1.FieldValue.serverTimestamp();
    const existingData = existing.data() ?? {};
    await roleRef.set({
        role_id: roleId,
        name,
        description,
        is_active: isActive,
        permissions,
        ...(existing.exists
            ? { created_by: existingData.created_by ?? actorUid, created_at: existingData.created_at ?? timestamp, updated_by: actorUid, updated_at: timestamp }
            : { created_by: actorUid, created_at: timestamp }),
    }, { merge: false });
    return { roleId };
});
exports.createCityMember = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const email = requireText(data.email, "El correo", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new https_1.HttpsError("invalid-argument", "El correo no es válido.");
    const displayName = requireText(data.displayName, "El nombre", 120);
    const phone = typeof data.phone === "string" ? data.phone.trim().slice(0, 40) : "";
    const roleId = requireText(data.roleId, "El rol", 60);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "members", "create");
    await (0, authorization_1.requireCityPermission)(request, cityId, "members", "assign_role");
    if (roleId === "city_admin" && !(0, authorization_1.isSuperAdmin)(request))
        throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede asignar el rol administrador de ciudad.");
    const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
    if (!role.exists || role.get("is_active") !== true)
        throw new https_1.HttpsError("failed-precondition", "El rol seleccionado no existe o está inactivo.");
    await (0, authorization_1.requirePermissionsWithinActorRole)(request, cityId, (role.get("permissions") ?? {}));
    let createdUid = "";
    try {
        const account = await firebase_admin_1.admin.auth().createUser({
            email,
            displayName,
            password: (0, node_crypto_1.randomBytes)(32).toString("base64url"),
            emailVerified: false,
            disabled: false,
        });
        createdUid = account.uid;
        const timestamp = firestore_1.FieldValue.serverTimestamp();
        const batch = firebase_admin_1.v2Db.batch();
        batch.set(firebase_admin_1.v2Db.doc(`user/${createdUid}`), {
            uid: createdUid,
            email,
            display_name: displayName,
            phone,
            primary_city_id: cityId,
            created_by: actorUid,
            created_at: timestamp,
        });
        batch.set(firebase_admin_1.v2Db.doc(`city/${cityId}/members/${createdUid}`), {
            uid: createdUid,
            role_id: roleId,
            status: "active",
            created_by: actorUid,
            created_at: timestamp,
        });
        await batch.commit();
        return { uid: createdUid, email };
    }
    catch (error) {
        if (createdUid)
            await firebase_admin_1.admin.auth().deleteUser(createdUid).catch(() => undefined);
        if (error instanceof https_1.HttpsError)
            throw error;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code.includes("email-already-exists"))
            throw new https_1.HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
        throw new https_1.HttpsError("internal", "No se pudo crear la cuenta del equipo.");
    }
});
exports.updateCityMember = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const uid = requireText(data.uid, "El usuario", 128);
    const memberRef = firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`);
    const current = await memberRef.get();
    if (!current.exists)
        throw new https_1.HttpsError("not-found", "El usuario no pertenece a esta ciudad.");
    const roleId = typeof data.roleId === "string" ? data.roleId.trim() : "";
    const status = typeof data.status === "string" ? data.status : "";
    if (!roleId && !["active", "disabled"].includes(status)) {
        throw new https_1.HttpsError("invalid-argument", "Indica un rol nuevo o un estado válido.");
    }
    const actorUid = (0, authorization_1.requireAuthenticated)(request);
    if (roleId) {
        await (0, authorization_1.requireCityPermission)(request, cityId, "members", "assign_role");
        if (roleId === "city_admin" && !(0, authorization_1.isSuperAdmin)(request))
            throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede asignar el rol administrador de ciudad.");
        const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
        if (!role.exists || role.get("is_active") !== true)
            throw new https_1.HttpsError("failed-precondition", "El rol seleccionado no existe o está inactivo.");
        await (0, authorization_1.requirePermissionsWithinActorRole)(request, cityId, (role.get("permissions") ?? {}));
    }
    if (status)
        await (0, authorization_1.requireCityPermission)(request, cityId, "members", "disable");
    if (!roleId && !status)
        throw new https_1.HttpsError("invalid-argument", "No hay cambios para guardar.");
    const authUser = await firebase_admin_1.admin.auth().getUser(uid);
    if (authUser.customClaims?.super_admin === true && !(0, authorization_1.isSuperAdmin)(request)) {
        throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede modificar otra cuenta superadmin.");
    }
    const batch = firebase_admin_1.v2Db.batch();
    batch.update(memberRef, {
        ...(roleId ? { role_id: roleId } : {}),
        ...(status ? { status } : {}),
        updated_by: actorUid,
        updated_at: firestore_1.FieldValue.serverTimestamp(),
    });
    if (status)
        await firebase_admin_1.admin.auth().updateUser(uid, { disabled: status === "disabled" });
    try {
        await batch.commit();
    }
    catch (error) {
        if (status)
            await firebase_admin_1.admin.auth().updateUser(uid, { disabled: authUser.disabled }).catch(() => undefined);
        throw error;
    }
    return { uid, roleId: roleId || current.get("role_id"), status: status || current.get("status") };
});
exports.listCityMembers = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    await (0, authorization_1.requireCityPermission)(request, cityId, "members", "list");
    const members = await firebase_admin_1.v2Db.collection(`city/${cityId}/members`).get();
    return {
        members: await Promise.all(members.docs.map(async (member) => {
            const profile = await firebase_admin_1.v2Db.doc(`user/${member.id}`).get();
            return { uid: member.id, ...member.data(), email: profile.get("email") ?? "", display_name: profile.get("display_name") ?? "", phone: profile.get("phone") ?? "" };
        })),
    };
});
exports.updateOwnProfile = (0, https_1.onCall)(async (request) => {
    const uid = (0, authorization_1.requireAuthenticated)(request);
    const data = request.data;
    const phone = typeof data.phone === "string" ? data.phone.trim().slice(0, 40) : "";
    if (!phone)
        throw new https_1.HttpsError("invalid-argument", "El teléfono es obligatorio.");
    await firebase_admin_1.v2Db.doc(`user/${uid}`).update({ phone, updated_by: uid, updated_at: firestore_1.FieldValue.serverTimestamp() });
    return { uid };
});
exports.createCityRetreatHome = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const name = requireText(data.name, "El nombre de la casa", 120);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "create");
    const homeId = slug(name);
    if (!homeId)
        throw new https_1.HttpsError("invalid-argument", "El nombre no permite generar un identificador válido.");
    const homeRef = firebase_admin_1.v2Db.doc(`retreat_home/${homeId}`);
    const assignmentRef = firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`);
    if ((await homeRef.get()).exists)
        throw new https_1.HttpsError("already-exists", "Ya existe una casa con ese nombre.");
    const optionalText = (key, maxLength) => typeof data[key] === "string" ? data[key].trim().slice(0, maxLength) : "";
    const images = Array.isArray(data.images) ? data.images.filter((item) => typeof item === "string").slice(0, 20) : [];
    const batch = firebase_admin_1.v2Db.batch();
    batch.create(homeRef, {
        name,
        phone: optionalText("phone", 40),
        address: optionalText("address", 240),
        location: optionalText("location", 500),
        images,
        created_by: actorUid,
        created_at: firestore_1.FieldValue.serverTimestamp(),
    });
    batch.create(assignmentRef, {
        home_id: homeId,
        is_active: true,
        created_by: actorUid,
        created_at: firestore_1.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { homeId };
});
exports.updateCityRetreatHome = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const homeId = requireText(data.homeId, "La casa de retiro", 160);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "update");
    const assignment = await firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`).get();
    if (!assignment.exists)
        throw new https_1.HttpsError("not-found", "La casa no está asignada a esta ciudad.");
    const patch = { updated_by: actorUid, updated_at: firestore_1.FieldValue.serverTimestamp() };
    for (const [key, maxLength] of [["name", 120], ["phone", 40], ["address", 240], ["location", 500]]) {
        if (typeof data[key] === "string")
            patch[key] = data[key].trim().slice(0, maxLength);
    }
    if (Array.isArray(data.images))
        patch.images = data.images.filter((item) => typeof item === "string").slice(0, 20);
    await firebase_admin_1.v2Db.doc(`retreat_home/${homeId}`).update(patch);
    return { homeId };
});
//# sourceMappingURL=accessManagement.js.map