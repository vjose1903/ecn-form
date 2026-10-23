"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCityFile = exports.recordCityFileUpload = exports.createCityFileUploadUrl = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = require("../../core/firebase-admin");
const authorization_1 = require("../../core/security/authorization");
const firestore_1 = require("firebase-admin/firestore");
const text = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const slug = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "archivo";
const bucket = () => firebase_admin_1.admin.storage().bucket("ecn-platform.firebasestorage.app");
const requireRetreatHomeImagePermission = async (request, cityId) => {
    const uid = (0, authorization_1.requireAuthenticated)(request);
    const canCreate = await (0, authorization_1.hasCityPermission)(request, cityId, "retreat_homes", "create");
    const canUpdate = canCreate || await (0, authorization_1.hasCityPermission)(request, cityId, "retreat_homes", "update");
    if (!canUpdate)
        throw new https_1.HttpsError("permission-denied", "No tienes permiso para modificar las imágenes de casas de retiro.");
    return uid;
};
exports.createCityFileUploadUrl = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const name = text(data.name);
    const contentType = text(data.contentType, 80);
    const size = Number(data.size);
    if (!cityId || !name || !/^image\/(jpeg|png|webp|heic)$/.test(contentType) || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
        throw new https_1.HttpsError("invalid-argument", "Selecciona una imagen válida de hasta 5 MB.");
    }
    await requireRetreatHomeImagePermission(request, cityId);
    const fileId = `${slug(name)}_${(0, node_crypto_1.randomBytes)(4).toString("hex")}`;
    const path = `retreat_homes/${cityId}/${fileId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const [uploadUrl] = await bucket().file(path).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 5 * 60 * 1000,
        contentType,
    });
    return { fileId, path, uploadUrl };
});
exports.recordCityFileUpload = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const fileId = text(data.fileId, 180);
    const path = text(data.path, 500);
    const name = text(data.name);
    if (!cityId || !fileId || !name || path.split("/").length !== 3 || !path.startsWith(`retreat_homes/${cityId}/${fileId}-`)) {
        throw new https_1.HttpsError("invalid-argument", "La referencia del archivo no es válida.");
    }
    const uid = await requireRetreatHomeImagePermission(request, cityId);
    const file = bucket().file(path);
    const [exists] = await file.exists();
    if (!exists)
        throw new https_1.HttpsError("failed-precondition", "No se encontró la imagen cargada.");
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) <= 0 || Number(metadata.size) > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|heic)$/.test(metadata.contentType ?? "")) {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw new https_1.HttpsError("failed-precondition", "La imagen no cumple con el formato permitido.");
    }
    const token = (0, node_crypto_1.randomBytes)(24).toString("hex");
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    await firebase_admin_1.v2Db.doc(`files/${fileId}`).create({
        id: fileId,
        name,
        url,
        city_id: cityId,
        storage_path: path,
        created_by: uid,
        created_at: firestore_1.FieldValue.serverTimestamp(),
    });
    return { fileId, url, path };
});
exports.deleteCityFile = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = text(data.cityId, 100);
    const fileId = text(data.fileId, 180);
    if (!cityId || !fileId)
        throw new https_1.HttpsError("invalid-argument", "La ciudad y el archivo son obligatorios.");
    const uid = await (0, authorization_1.requireCityPermission)(request, cityId, "retreat_homes", "update");
    const fileRef = firebase_admin_1.v2Db.doc(`files/${fileId}`);
    const snapshot = await fileRef.get();
    if (!snapshot.exists || snapshot.get("city_id") !== cityId)
        throw new https_1.HttpsError("not-found", "No se encontró el archivo en esta ciudad.");
    const path = text(snapshot.get("storage_path"), 500);
    if (!path.startsWith(`retreat_homes/${cityId}/`))
        throw new https_1.HttpsError("failed-precondition", "La ruta del archivo no coincide con la ciudad.");
    const references = await firebase_admin_1.v2Db.collection("retreat_home").where("images", "array-contains", fileId).limit(1).get();
    if (!references.empty)
        throw new https_1.HttpsError("failed-precondition", "La imagen todavía está asociada a una casa de retiro.");
    await bucket().file(path).delete({ ignoreNotFound: true });
    await fileRef.delete();
    console.log(JSON.stringify({ event: "city_file_deleted", cityId, fileId, actorUid: uid }));
    return { deleted: true };
});
//# sourceMappingURL=files.js.map