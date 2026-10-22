import {randomBytes} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, v2Db} from "../../core/firebase-admin";
import {requireCityPermission} from "../../core/security/authorization";
import {FieldValue} from "firebase-admin/firestore";

const text = (value: unknown, max = 180): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "archivo";
const bucket = () => admin.storage().bucket("ecn-platform.firebasestorage.app");

export const createCityFileUploadUrl = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const name = text(data.name);
  const contentType = text(data.contentType, 80);
  const size = Number(data.size);
  if (!cityId || !name || !/^image\/(jpeg|png|webp|heic)$/.test(contentType) || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "Selecciona una imagen válida de hasta 5 MB.");
  }
  await requireCityPermission(request, cityId, "files", "create");
  const fileId = `${slug(name)}_${randomBytes(4).toString("hex")}`;
  const path = `retreat_homes/${cityId}/${fileId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const [uploadUrl] = await bucket().file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 5 * 60 * 1000,
    contentType,
  });
  return {fileId, path, uploadUrl};
});

export const recordCityFileUpload = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const fileId = text(data.fileId, 180);
  const path = text(data.path, 500);
  const name = text(data.name);
  if (!cityId || !fileId || !name || path.split("/").length !== 3 || !path.startsWith(`retreat_homes/${cityId}/${fileId}-`)) {
    throw new HttpsError("invalid-argument", "La referencia del archivo no es válida.");
  }
  const uid = await requireCityPermission(request, cityId, "files", "create");
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "No se encontró la imagen cargada.");
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) <= 0 || Number(metadata.size) > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|heic)$/.test(metadata.contentType ?? "")) {
    await file.delete({ignoreNotFound: true}).catch(() => undefined);
    throw new HttpsError("failed-precondition", "La imagen no cumple con el formato permitido.");
  }
  const token = randomBytes(24).toString("hex");
  await file.setMetadata({metadata: {firebaseStorageDownloadTokens: token}});
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  await v2Db.doc(`files/${fileId}`).create({
    id: fileId,
    name,
    url,
    city_id: cityId,
    storage_path: path,
    created_by: uid,
    created_at: FieldValue.serverTimestamp(),
  });
  return {fileId, url, path};
});

export const deleteCityFile = onCall(async request => {
  const data = request.data as Record<string, unknown>;
  const cityId = text(data.cityId, 100);
  const fileId = text(data.fileId, 180);
  if (!cityId || !fileId) throw new HttpsError("invalid-argument", "La ciudad y el archivo son obligatorios.");
  const uid = await requireCityPermission(request, cityId, "files", "delete");
  const fileRef = v2Db.doc(`files/${fileId}`);
  const snapshot = await fileRef.get();
  if (!snapshot.exists || snapshot.get("city_id") !== cityId) throw new HttpsError("not-found", "No se encontró el archivo en esta ciudad.");
  const path = text(snapshot.get("storage_path"), 500);
  if (!path.startsWith(`retreat_homes/${cityId}/`)) throw new HttpsError("failed-precondition", "La ruta del archivo no coincide con la ciudad.");
  const references = await v2Db.collection("retreat_home").where("images", "array-contains", fileId).limit(1).get();
  if (!references.empty) throw new HttpsError("failed-precondition", "La imagen todavía está asociada a una casa de retiro.");
  await bucket().file(path).delete({ignoreNotFound: true});
  await fileRef.delete();
  console.log(JSON.stringify({event: "city_file_deleted", cityId, fileId, actorUid: uid}));
  return {deleted: true};
});
