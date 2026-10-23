"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCityRetreatHome = exports.createCityRetreatHome = exports.assignExistingCityRetreatHome = exports.findSimilarCityRetreatHomes = exports.updateOwnProfile = exports.listCityMembers = exports.deleteCityMember = exports.updateCityMember = exports.resendCityMemberInvitation = exports.sendCityMemberInvitation = exports.createCityMember = exports.saveCityRole = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_2 = require("firebase-admin/firestore");
const resend_1 = require("../../core/helpers/resend");
const emailHelpers_1 = require("../../core/typescript/emailHelpers");
const slug = (value) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const normalizeMatch = (value) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const editSimilarity = (left, right) => {
    if (!left || !right)
        return 0;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row++) {
        let diagonal = previous[0];
        previous[0] = row;
        for (let column = 1; column <= right.length; column++) {
            const above = previous[column];
            previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return 1 - previous[right.length] / Math.max(left.length, right.length);
};
const wordSimilarity = (left, right) => {
    const leftWords = new Set(left.split(" ").filter(Boolean));
    const rightWords = new Set(right.split(" ").filter(Boolean));
    if (!leftWords.size || !rightWords.size)
        return 0;
    const common = [...leftWords].filter(word => rightWords.has(word)).length;
    return 2 * common / (leftWords.size + rightWords.size);
};
const textSimilarity = (left, right) => {
    const normalizedLeft = normalizeMatch(left);
    const normalizedRight = normalizeMatch(right);
    if (normalizedLeft === normalizedRight)
        return 1;
    return Math.max(editSimilarity(normalizedLeft, normalizedRight), wordSimilarity(normalizedLeft, normalizedRight));
};
const isSimilarRetreatHome = (left, right) => textSimilarity(left.name, right.name) >= 0.72 && textSimilarity(left.address, right.address) >= 0.82;
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
    const timestamp = firestore_2.FieldValue.serverTimestamp();
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
    let existingAccount = null;
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
    }
    catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (!code.includes("email-already-exists")) {
            console.error("No se pudo crear la cuenta de Auth:", JSON.stringify({ cityId, error }));
            throw new https_1.HttpsError("internal", "No se pudo crear la cuenta del equipo.");
        }
        existingAccount = await firebase_admin_1.admin.auth().getUserByEmail(email).catch(lookupError => {
            const lookupCode = lookupError && typeof lookupError === "object" && "code" in lookupError ? String(lookupError.code) : "";
            if (lookupCode.includes("user-not-found"))
                return null;
            throw lookupError;
        });
    }
    if (existingAccount) {
        if (existingAccount.customClaims?.super_admin === true && !(0, authorization_1.isSuperAdmin)(request)) {
            throw new https_1.HttpsError("permission-denied", "Solo un superadministrador puede reactivar esta cuenta.");
        }
        const memberRef = firebase_admin_1.v2Db.doc(`city/${cityId}/members/${existingAccount.uid}`);
        const [member, profile] = await Promise.all([memberRef.get(), firebase_admin_1.v2Db.doc(`user/${existingAccount.uid}`).get()]);
        if (!member.exists || member.get("status") !== "deleted") {
            throw new https_1.HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
        }
        try {
            await firebase_admin_1.admin.auth().updateUser(existingAccount.uid, { disabled: false, displayName });
            const batch = firebase_admin_1.v2Db.batch();
            batch.set(memberRef, {
                role_id: roleId,
                status: "active",
                deleted_by: firestore_2.FieldValue.delete(),
                deleted_at: firestore_2.FieldValue.delete(),
                reactivated_by: actorUid,
                reactivated_at: firestore_2.FieldValue.serverTimestamp(),
                updated_by: actorUid,
                updated_at: firestore_2.FieldValue.serverTimestamp(),
            }, { merge: true });
            batch.set(firebase_admin_1.v2Db.doc(`user/${existingAccount.uid}`), {
                uid: existingAccount.uid,
                email,
                display_name: displayName,
                phone,
                primary_city_id: profile.get("primary_city_id") || cityId,
                updated_by: actorUid,
                updated_at: firestore_2.FieldValue.serverTimestamp(),
            }, { merge: true });
            await batch.commit();
        }
        catch (error) {
            await firebase_admin_1.admin.auth().updateUser(existingAccount.uid, {
                disabled: existingAccount.disabled,
                displayName: existingAccount.displayName ?? "",
            }).catch(() => undefined);
            console.error("No se pudo reactivar la cuenta existente:", JSON.stringify({ uid: existingAccount.uid, cityId, error }));
            throw new https_1.HttpsError("internal", "No se pudo reactivar la cuenta existente.");
        }
        return { uid: existingAccount.uid, email, reactivated: true };
    }
    if (!createdUid)
        throw new https_1.HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
    try {
        const timestamp = firestore_2.FieldValue.serverTimestamp();
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
            invitation_status: "pending",
            created_by: actorUid,
            created_at: timestamp,
        });
        await batch.commit();
        return { uid: createdUid, email, reactivated: false };
    }
    catch (error) {
        if (createdUid) {
            await Promise.all([
                firebase_admin_1.admin.auth().deleteUser(createdUid).catch(() => undefined),
                firebase_admin_1.v2Db.doc(`user/${createdUid}`).delete().catch(() => undefined),
                firebase_admin_1.v2Db.doc(`city/${cityId}/members/${createdUid}`).delete().catch(() => undefined),
            ]);
        }
        if (error instanceof https_1.HttpsError)
            throw error;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code.includes("email-already-exists"))
            throw new https_1.HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
        throw new https_1.HttpsError("internal", "No se pudo crear la cuenta del equipo.");
    }
});
const sendMemberInvitationEmail = async ({ cityId, email, displayName, idempotencyKey, }) => {
    const apiKey = (0, resend_1.getResendApiKey)();
    if (!apiKey)
        throw new Error("No se pudo preparar el correo de invitación del usuario.");
    const firebaseLink = await firebase_admin_1.admin.auth().generatePasswordResetLink(email);
    const firebaseUrl = new URL(firebaseLink);
    const setupUrl = new URL("https://ecn-platform.netlify.app/auth/crear-contrasena");
    for (const key of ["mode", "oobCode", "apiKey", "lang"]) {
        const value = firebaseUrl.searchParams.get(key);
        if (value)
            setupUrl.searchParams.set(key, value);
    }
    if (setupUrl.searchParams.get("mode") !== "resetPassword" || !setupUrl.searchParams.has("oobCode")) {
        throw new Error("Firebase no generó un enlace válido para crear la contraseña.");
    }
    const safeName = displayName.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
    const safeUrl = setupUrl.toString().replace(/&/g, "&amp;");
    await (0, resend_1.sendResendEmail)({
        apiKey,
        to: email,
        subject: "Activa tu cuenta de Encuentro Católico para Novios",
        html: `
      <div style="max-width:600px;margin:24px auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#344054">
        <div style="background:${emailHelpers_1.EMAIL_CONSTANTS.BRAND_COLOR};padding:24px;text-align:center;color:#fff">
          <img src="${emailHelpers_1.EMAIL_CONSTANTS.ECN_LOGO_URL}" alt="Encuentro Católico para Novios" width="56" height="56" style="display:block;margin:0 auto 12px">
          <strong style="font-size:20px">Encuentro Católico para Novios</strong>
        </div>
        <div style="padding:28px 24px">
          <h1 style="font-size:22px;margin:0 0 16px">Crea tu contraseña</h1>
          <p>Hola ${safeName},</p>
          <p>Se creó una cuenta para ti en la plataforma de Encuentro Católico para Novios. Usa el siguiente botón para crear tu contraseña y activar el acceso.</p>
          <p style="text-align:center;margin:28px 0"><a href="${safeUrl}" style="background:${emailHelpers_1.EMAIL_CONSTANTS.BRAND_COLOR};color:#fff;text-decoration:none;padding:13px 22px;border-radius:7px;display:inline-block;font-weight:bold">Crear contraseña</a></p>
          <p style="font-size:13px;color:#667085">Si no esperabas esta invitación, puedes ignorar este correo.</p>
        </div>
      </div>
    `,
        logLabel: `invitación de nuevo usuario en ${cityId}`,
        idempotencyKey,
    });
};
exports.sendCityMemberInvitation = (0, firestore_1.onDocumentWritten)({ database: "ecn-platform-v2", document: "city/{cityId}/members/{uid}", secrets: [resend_1.resendApiKey], retry: true }, async (event) => {
    const snapshot = event.data?.after;
    const member = snapshot?.data();
    if (!snapshot || !member || member.invitation_status !== "pending")
        return;
    const invitationRequestId = String(member.invitation_request_id ?? "");
    const latestMember = await snapshot.ref.get();
    if (latestMember?.get("invitation_status") !== "pending" ||
        String(latestMember?.get("invitation_request_id") ?? "") !== invitationRequestId)
        return;
    const { cityId, uid } = event.params;
    const profile = await firebase_admin_1.v2Db.doc(`user/${uid}`).get();
    const email = String(profile.get("email") ?? "");
    if (!email)
        throw new Error("No se pudo preparar el correo de invitación del usuario.");
    const displayName = String(profile.get("display_name") ?? "");
    await sendMemberInvitationEmail({
        cityId,
        email,
        displayName,
        idempotencyKey: `city-member-invitation-${uid}-${invitationRequestId || "initial"}`,
    });
    await firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const current = await transaction.get(snapshot.ref);
        if (current.get("invitation_status") === "pending" &&
            String(current.get("invitation_request_id") ?? "") === invitationRequestId) {
            transaction.update(snapshot.ref, {
                invitation_status: "sent",
                invitation_sent_at: firestore_2.FieldValue.serverTimestamp(),
            });
        }
    });
});
exports.resendCityMemberInvitation = (0, https_1.onCall)({ secrets: [resend_1.resendApiKey], invoker: "public" }, async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const uid = requireText(data.uid, "El usuario", 128);
    const email = requireText(data.email, "El correo", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new https_1.HttpsError("invalid-argument", "El correo no es válido.");
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "members", "create");
    const memberRef = firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`);
    const profileRef = firebase_admin_1.v2Db.doc(`user/${uid}`);
    const [member, profile, authUser] = await Promise.all([
        memberRef.get(),
        profileRef.get(),
        firebase_admin_1.admin.auth().getUser(uid).catch(error => {
            const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
            if (code.includes("user-not-found"))
                return null;
            throw error;
        }),
    ]);
    if (!member.exists || member.get("status") === "deleted" || !authUser) {
        throw new https_1.HttpsError("not-found", "No se encontró un usuario activo en esta ciudad.");
    }
    if (authUser.disabled)
        throw new https_1.HttpsError("failed-precondition", "Activa la cuenta antes de reenviar la invitación.");
    if (authUser.metadata.lastSignInTime) {
        throw new https_1.HttpsError("failed-precondition", "Este usuario ya inició sesión y no necesita una invitación para crear su contraseña.");
    }
    if (member.get("status") !== "active")
        throw new https_1.HttpsError("failed-precondition", "Activa la cuenta antes de reenviar la invitación.");
    const originalEmail = authUser.email ?? "";
    const profileEmail = String(profile.get("email") ?? "");
    const emailChanged = email !== originalEmail;
    const profileEmailChanged = email !== profileEmail;
    const actorCanUpdate = emailChanged || profileEmailChanged
        ? await (0, authorization_1.requireCityPermission)(request, cityId, "members", "update")
        : actorUid;
    let authEmailUpdated = false;
    let profileEmailUpdated = false;
    let invitationQueued = false;
    try {
        if (emailChanged) {
            await firebase_admin_1.admin.auth().updateUser(uid, { email, emailVerified: false });
            authEmailUpdated = true;
        }
        if (profileEmailChanged) {
            await profileRef.set({ email, updated_by: actorCanUpdate, updated_at: firestore_2.FieldValue.serverTimestamp() }, { merge: true });
            profileEmailUpdated = true;
        }
        await memberRef.update({
            invitation_status: "pending",
            invitation_request_id: (0, node_crypto_1.randomBytes)(8).toString("hex"),
            invitation_requested_at: firestore_2.FieldValue.serverTimestamp(),
        });
        invitationQueued = true;
        return { uid, email };
    }
    catch (error) {
        if (!invitationQueued) {
            if (profileEmailUpdated)
                await profileRef.set({ email: profileEmail }, { merge: true }).catch(() => undefined);
            if (authEmailUpdated)
                await firebase_admin_1.admin.auth().updateUser(uid, { email: originalEmail, emailVerified: authUser.emailVerified }).catch(() => undefined);
        }
        console.error("No se pudo reenviar la invitación del miembro:", JSON.stringify({ cityId, uid, error }));
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "No se pudo reenviar el correo para crear la contraseña.");
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
    const hasDisplayName = typeof data.displayName === "string";
    const hasEmail = typeof data.email === "string";
    const hasPhone = typeof data.phone === "string";
    const hasSuperAdmin = Object.prototype.hasOwnProperty.call(data, "superAdmin");
    if (hasSuperAdmin && typeof data.superAdmin !== "boolean")
        throw new https_1.HttpsError("invalid-argument", "El estado de superadministrador no es válido.");
    const displayName = hasDisplayName ? requireText(data.displayName, "El nombre", 120) : "";
    const email = hasEmail ? requireText(data.email, "El correo", 254).toLowerCase() : "";
    const phone = hasPhone ? data.phone.trim().slice(0, 40) : "";
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new https_1.HttpsError("invalid-argument", "El correo no es válido.");
    if (status && !["active", "disabled"].includes(status))
        throw new https_1.HttpsError("invalid-argument", "El estado indicado no es válido.");
    if (!roleId && !["active", "disabled"].includes(status) && !hasDisplayName && !hasEmail && !hasPhone && !hasSuperAdmin) {
        throw new https_1.HttpsError("invalid-argument", "Indica un rol nuevo o un estado válido.");
    }
    if (hasDisplayName || hasEmail || hasPhone)
        await (0, authorization_1.requireCityPermission)(request, cityId, "members", "update");
    if (hasSuperAdmin && !(0, authorization_1.isSuperAdmin)(request))
        throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede asignar o retirar este estatus.");
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
    if (!roleId && !status && !hasDisplayName && !hasEmail && !hasPhone && !hasSuperAdmin)
        throw new https_1.HttpsError("invalid-argument", "No hay cambios para guardar.");
    const authUser = await firebase_admin_1.admin.auth().getUser(uid);
    if (authUser.customClaims?.super_admin === true && !(0, authorization_1.isSuperAdmin)(request)) {
        throw new https_1.HttpsError("permission-denied", "Solo un superadmin puede modificar otra cuenta superadmin.");
    }
    const profileRef = firebase_admin_1.v2Db.doc(`user/${uid}`);
    const profile = await profileRef.get();
    const batch = firebase_admin_1.v2Db.batch();
    const memberChanges = {
        ...(roleId ? { role_id: roleId } : {}),
        ...(status ? { status } : {}),
        updated_by: actorUid,
        updated_at: firestore_2.FieldValue.serverTimestamp(),
    };
    batch.update(memberRef, memberChanges);
    if (hasDisplayName || hasEmail || hasPhone) {
        batch.set(profileRef, {
            ...(hasDisplayName ? { display_name: displayName } : {}),
            ...(hasEmail ? { email } : {}),
            ...(hasPhone ? { phone } : {}),
            updated_by: actorUid,
            updated_at: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    if (hasSuperAdmin) {
        const auditId = `aud_${Date.now()}_user_update_${uid.slice(0, 8)}_${(0, node_crypto_1.randomBytes)(3).toString("hex")}`;
        batch.set(firebase_admin_1.v2Db.doc(`global_audit_logs/${auditId}`), {
            audit_id: auditId,
            action: "update",
            actor_uid: actorUid,
            actor_type: "user",
            auth_type: "user",
            resource_path: `user/${uid}`,
            resource_type: "user",
            resource_id: uid,
            occurred_at: firestore_2.FieldValue.serverTimestamp(),
            changes: { super_admin: { before: authUser.customClaims?.super_admin === true, after: data.superAdmin } },
            source: "cloud_function",
        });
    }
    const authChanges = {
        ...(status ? { disabled: status === "disabled" } : {}),
        ...(hasDisplayName ? { displayName } : {}),
        ...(hasEmail ? { email } : {}),
    };
    const restoreAuth = async () => {
        if (hasSuperAdmin)
            await firebase_admin_1.admin.auth().setCustomUserClaims(uid, authUser.customClaims ?? {});
        if (Object.keys(authChanges).length) {
            await firebase_admin_1.admin.auth().updateUser(uid, {
                disabled: authUser.disabled,
                displayName: authUser.displayName ?? "",
                email: authUser.email,
            });
        }
    };
    try {
        if (Object.keys(authChanges).length) {
            await firebase_admin_1.admin.auth().updateUser(uid, authChanges);
        }
        if (hasSuperAdmin) {
            await firebase_admin_1.admin.auth().setCustomUserClaims(uid, {
                ...(authUser.customClaims ?? {}),
                super_admin: data.superAdmin,
            });
        }
        await batch.commit();
    }
    catch (error) {
        await restoreAuth().catch(() => undefined);
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code.includes("email-already-exists"))
            throw new https_1.HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
        throw error;
    }
    return { uid, roleId: roleId || current.get("role_id"), status: status || current.get("status"), superAdmin: hasSuperAdmin ? data.superAdmin : authUser.customClaims?.super_admin === true, email: hasEmail ? email : profile.get("email") ?? "", displayName: hasDisplayName ? displayName : profile.get("display_name") ?? "", phone: hasPhone ? phone : profile.get("phone") ?? "" };
});
exports.deleteCityMember = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const uid = requireText(data.uid, "El usuario", 128);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "members", "delete");
    if (uid === actorUid)
        throw new https_1.HttpsError("failed-precondition", "No puedes eliminar tu propia cuenta.");
    const memberRef = firebase_admin_1.v2Db.doc(`city/${cityId}/members/${uid}`);
    const profileRef = firebase_admin_1.v2Db.doc(`user/${uid}`);
    const [member, profile, authUser] = await Promise.all([
        memberRef.get(),
        profileRef.get(),
        firebase_admin_1.admin.auth().getUser(uid).catch(error => {
            const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
            if (code.includes("user-not-found"))
                return null;
            throw error;
        }),
    ]);
    if (!member.exists)
        throw new https_1.HttpsError("not-found", "El usuario no pertenece a esta ciudad.");
    if (!authUser)
        throw new https_1.HttpsError("not-found", "No se encontró la cuenta de autenticación.");
    if (authUser.customClaims?.super_admin === true) {
        throw new https_1.HttpsError("failed-precondition", "Retira primero el estatus de super administrador para eliminar esta cuenta.");
    }
    const [globalActivity, cityActivity, cities, nestedCollections] = await Promise.all([
        firebase_admin_1.v2Db.collection("global_audit_logs").where("actor_uid", "==", uid).get(),
        firebase_admin_1.v2Db.collectionGroup("audit_logs").where("actor_uid", "==", uid).limit(1).get(),
        firebase_admin_1.v2Db.collection("city").get(),
        profile.exists ? profileRef.listCollections() : Promise.resolve([]),
    ]);
    const hasCityActivity = !cityActivity.empty;
    const hasGlobalActivity = globalActivity.docs.some(event => {
        const path = event.get("resource_path");
        return typeof path !== "string" || !path.startsWith(`user/${uid}/push_tokens/`);
    });
    const hasNonTokenProfileData = nestedCollections.some(collection => collection.id !== "push_tokens");
    const membershipRefs = cities.docs
        .filter(city => city.id !== cityId)
        .map(city => firebase_admin_1.v2Db.doc(`city/${city.id}/members/${uid}`));
    const otherMemberships = (membershipRefs.length ? await firebase_admin_1.v2Db.getAll(...membershipRefs) : [])
        .filter(snapshot => snapshot.exists);
    const activeOtherMemberships = otherMemberships.filter(snapshot => snapshot.get("status") === "active");
    const canHardDelete = !hasCityActivity && !hasGlobalActivity && !hasNonTokenProfileData && otherMemberships.length === 0;
    if (canHardDelete) {
        const profileData = profile.data() ?? {};
        const memberData = member.data() ?? {};
        try {
            await firebase_admin_1.admin.auth().updateUser(uid, { disabled: true });
            await Promise.all([firebase_admin_1.v2Db.recursiveDelete(profileRef), memberRef.delete()]);
            await firebase_admin_1.admin.auth().deleteUser(uid);
        }
        catch (error) {
            await Promise.all([
                profile.exists ? profileRef.set(profileData, { merge: true }).catch(() => undefined) : Promise.resolve(),
                memberRef.set(memberData, { merge: true }).catch(() => undefined),
                firebase_admin_1.admin.auth().updateUser(uid, { disabled: authUser.disabled }).catch(() => undefined),
            ]);
            console.error("No se pudo completar la eliminación definitiva:", JSON.stringify({ uid, cityId, error }));
            throw new https_1.HttpsError("internal", "No se pudo completar la eliminación. Se restauró el acceso cuando fue posible.");
        }
        const auditId = `aud_${Date.now()}_member_hard_delete_${uid.slice(0, 8)}_${(0, node_crypto_1.randomBytes)(3).toString("hex")}`;
        await firebase_admin_1.v2Db.doc(`global_audit_logs/${auditId}`).set({
            audit_id: auditId,
            action: "delete",
            actor_uid: actorUid,
            actor_type: "user",
            auth_type: "user",
            resource_path: `user/${uid}`,
            resource_type: "user",
            resource_id: uid,
            occurred_at: firestore_2.FieldValue.serverTimestamp(),
            changes: { account: { before: "active", after: null }, deletion_mode: { before: null, after: "hard" } },
            source: "cloud_function",
        }).catch(error => console.error("No se pudo guardar la auditoría de eliminación definitiva:", JSON.stringify({ uid, error })));
        return { mode: "hard" };
    }
    const profileData = profile.data() ?? {};
    const nextCityId = activeOtherMemberships[0]?.ref.parent.parent?.id;
    const profileCity = profileData.city;
    const profilePrimaryCityId = profileData.primary_city_id;
    const primaryCityPatch = nextCityId && (profilePrimaryCityId === cityId || profileCity === cityId)
        ? {
            ...(profilePrimaryCityId === cityId ? { primary_city_id: nextCityId } : {}),
            ...(profileCity === cityId ? { city: nextCityId } : {}),
        }
        : {};
    const batch = firebase_admin_1.v2Db.batch();
    batch.update(memberRef, {
        status: "deleted",
        deleted_by: actorUid,
        deleted_at: firestore_2.FieldValue.serverTimestamp(),
        updated_by: actorUid,
        updated_at: firestore_2.FieldValue.serverTimestamp(),
    });
    if (Object.keys(primaryCityPatch).length) {
        batch.set(profileRef, { ...primaryCityPatch, updated_by: actorUid, updated_at: firestore_2.FieldValue.serverTimestamp() }, { merge: true });
    }
    const shouldDisableAuth = activeOtherMemberships.length === 0 && !authUser.disabled;
    if (shouldDisableAuth)
        await firebase_admin_1.admin.auth().updateUser(uid, { disabled: true });
    try {
        await batch.commit();
    }
    catch (error) {
        if (shouldDisableAuth)
            await firebase_admin_1.admin.auth().updateUser(uid, { disabled: authUser.disabled }).catch(() => undefined);
        console.error("No se pudo desactivar el miembro:", JSON.stringify({ uid, cityId, error }));
        throw new https_1.HttpsError("internal", "No se pudo eliminar el usuario de esta ciudad.");
    }
    return { mode: "soft" };
});
exports.listCityMembers = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    await (0, authorization_1.requireCityPermission)(request, cityId, "members", "list");
    const pageSize = typeof data.pageSize === "number" ? data.pageSize : 20;
    if (![10, 20, 50, 100, 200].includes(pageSize))
        throw new https_1.HttpsError("invalid-argument", "El tamaño de página no es válido.");
    const direction = data.direction ?? "first";
    if (!["first", "next", "previous", "last"].includes(String(direction))) {
        throw new https_1.HttpsError("invalid-argument", "La dirección de paginación no es válida.");
    }
    const cursor = data.cursor && typeof data.cursor === "object" ? data.cursor : null;
    if ((direction === "next" || direction === "previous") && (!cursor || typeof cursor.uid !== "string" || typeof cursor.status !== "string")) {
        throw new https_1.HttpsError("invalid-argument", "El cursor de paginación no es válido.");
    }
    const membersRef = firebase_admin_1.v2Db.collection(`city/${cityId}/members`);
    const orderDirection = direction === "previous" || direction === "last" ? "desc" : "asc";
    let pageQuery = membersRef.where("status", "!=", "deleted")
        .orderBy("status", orderDirection)
        .orderBy(firestore_2.FieldPath.documentId(), orderDirection);
    if ((direction === "next" || direction === "previous") && cursor) {
        pageQuery = pageQuery.startAfter(cursor.status, cursor.uid);
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
        pageQuery.limit(pageSize).get(),
        membersRef.where("status", "!=", "deleted").count().get(),
    ]);
    const memberDocs = direction === "previous" || direction === "last" ? [...pageSnapshot.docs].reverse() : pageSnapshot.docs;
    const [profiles, authUsers] = await Promise.all([
        memberDocs.length ? firebase_admin_1.v2Db.getAll(...memberDocs.map(member => firebase_admin_1.v2Db.doc(`user/${member.id}`))) : Promise.resolve([]),
        memberDocs.length ? firebase_admin_1.admin.auth().getUsers(memberDocs.map(member => ({ uid: member.id }))) : Promise.resolve({ users: [], notFound: [] }),
    ]);
    const authByUid = new Map(authUsers.users.map(account => [account.uid, account]));
    const members = memberDocs.map((member, index) => {
        const profile = profiles[index];
        const account = authByUid.get(member.id);
        return {
            uid: member.id,
            ...member.data(),
            email: profile.get("email") ?? "",
            display_name: profile.get("display_name") ?? "",
            phone: profile.get("phone") ?? "",
            super_admin: account?.customClaims?.super_admin === true,
            has_signed_in: account ? Boolean(account.metadata.lastSignInTime) : true,
        };
    });
    const toCursor = (member) => ({
        uid: member.id,
        status: String(member.get("status")),
    });
    return {
        members,
        total: countSnapshot.data().count,
        firstCursor: memberDocs.length ? toCursor(memberDocs[0]) : null,
        lastCursor: memberDocs.length ? toCursor(memberDocs[memberDocs.length - 1]) : null,
    };
});
exports.updateOwnProfile = (0, https_1.onCall)(async (request) => {
    const uid = (0, authorization_1.requireAuthenticated)(request);
    const data = request.data;
    const phone = typeof data.phone === "string" ? data.phone.trim().slice(0, 40) : "";
    if (!phone)
        throw new https_1.HttpsError("invalid-argument", "El teléfono es obligatorio.");
    await firebase_admin_1.v2Db.doc(`user/${uid}`).update({ phone, updated_by: uid, updated_at: firestore_2.FieldValue.serverTimestamp() });
    return { uid };
});
exports.findSimilarCityRetreatHomes = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const name = requireText(data.name, "El nombre de la casa", 120);
    const address = requireText(data.address, "La dirección", 240);
    await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "create");
    const [city, homes] = await Promise.all([
        firebase_admin_1.v2Db.doc(`city/${cityId}`).get(),
        firebase_admin_1.v2Db.collection("retreat_home").select("name", "address", "images").get(),
    ]);
    const candidates = homes.docs.map(home => {
        const candidateName = String(home.get("name") ?? "");
        const candidateAddress = String(home.get("address") ?? "");
        const nameScore = textSimilarity(name, candidateName);
        const addressScore = textSimilarity(address, candidateAddress);
        const rawImages = home.get("images");
        const imageIds = Array.isArray(rawImages) ? rawImages.map(image => typeof image === "string" ? image : image && typeof image === "object" && "id" in image && typeof image.id === "string" ? image.id : "").filter(Boolean).slice(0, 3) : [];
        return {
            id: home.id,
            name: candidateName,
            address: candidateAddress,
            imageIds,
            score: nameScore * 0.6 + addressScore * 0.4,
            isSimilar: nameScore >= 0.72 && addressScore >= 0.82,
        };
    })
        .filter(home => home.isSimilar)
        .sort((left, right) => right.score - left.score)
        .slice(0, 5);
    const assignments = candidates.length ? await firebase_admin_1.v2Db.getAll(...candidates.map(candidate => firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${candidate.id}`))) : [];
    const assignedHomeIds = new Set(assignments.filter(assignment => assignment.exists).map(assignment => assignment.id));
    return {
        cityLabel: String(city.get("label") ?? city.get("name") ?? cityId),
        candidates: candidates.map(({ id, name: candidateName, address: candidateAddress, imageIds }) => ({
            id,
            name: candidateName,
            address: candidateAddress,
            imageIds,
            alreadyAssigned: assignedHomeIds.has(id),
        })),
    };
});
exports.assignExistingCityRetreatHome = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const homeId = requireText(data.homeId, "La casa de retiro", 160);
    const name = requireText(data.name, "El nombre de la casa", 120);
    const address = requireText(data.address, "La dirección", 240);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "assign");
    const homeRef = firebase_admin_1.v2Db.doc(`retreat_home/${homeId}`);
    const assignmentRef = firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`);
    return firebase_admin_1.v2Db.runTransaction(async (transaction) => {
        const [home, assignment] = await Promise.all([transaction.get(homeRef), transaction.get(assignmentRef)]);
        if (!home.exists)
            throw new https_1.HttpsError("not-found", "La casa de retiro seleccionada ya no existe.");
        if (!isSimilarRetreatHome({ name, address }, {
            name: String(home.get("name") ?? ""),
            address: String(home.get("address") ?? ""),
        })) {
            throw new https_1.HttpsError("failed-precondition", "La casa ya no coincide con los datos del formulario. Vuelve a revisar las coincidencias.");
        }
        const homeData = {
            name: String(home.get("name") ?? ""),
            phone: String(home.get("phone") ?? ""),
            address: String(home.get("address") ?? ""),
            location: String(home.get("location") ?? ""),
            images: Array.isArray(home.get("images")) ? home.get("images") : [],
        };
        if (assignment.exists)
            return { homeId, alreadyAssigned: true, home: homeData };
        transaction.create(assignmentRef, {
            home_id: homeId,
            is_active: true,
            created_by: actorUid,
            created_at: firestore_2.FieldValue.serverTimestamp(),
        });
        return { homeId, alreadyAssigned: false, home: homeData };
    });
});
exports.createCityRetreatHome = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const name = requireText(data.name, "El nombre de la casa", 120);
    const address = requireText(data.address, "La dirección", 240);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "create");
    const nameSlug = slug(name).slice(0, 72) || "casa";
    const addressSlug = slug(address).slice(0, 56) || "direccion";
    const addressHash = (0, node_crypto_1.createHash)("sha256").update(normalizeMatch(address)).digest("hex").slice(0, 8);
    const homeId = `${nameSlug}_${addressSlug}_${addressHash}`;
    const homeRef = firebase_admin_1.v2Db.doc(`retreat_home/${homeId}`);
    const assignmentRef = firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`);
    if ((await homeRef.get()).exists)
        throw new https_1.HttpsError("already-exists", "Ya existe una casa con ese nombre.");
    const optionalText = (key, maxLength) => typeof data[key] === "string" ? data[key].trim().slice(0, maxLength) : "";
    const images = Array.isArray(data.images) ? data.images.filter((item) => typeof item === "string").slice(0, 20) : [];
    const homeData = {
        name,
        phone: optionalText("phone", 40),
        address,
        location: optionalText("location", 500),
        images,
    };
    const batch = firebase_admin_1.v2Db.batch();
    batch.create(homeRef, {
        ...homeData,
        created_by: actorUid,
        created_at: firestore_2.FieldValue.serverTimestamp(),
    });
    batch.create(assignmentRef, {
        home_id: homeId,
        is_active: true,
        created_by: actorUid,
        created_at: firestore_2.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { homeId, home: homeData };
});
exports.updateCityRetreatHome = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = requireText(data.cityId, "La ciudad", 100);
    const homeId = requireText(data.homeId, "La casa de retiro", 160);
    const actorUid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "update");
    const assignment = await firebase_admin_1.v2Db.doc(`city/${cityId}/retreat_homes/${homeId}`).get();
    if (!assignment.exists)
        throw new https_1.HttpsError("not-found", "La casa no está asignada a esta ciudad.");
    const patch = { updated_by: actorUid, updated_at: firestore_2.FieldValue.serverTimestamp() };
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