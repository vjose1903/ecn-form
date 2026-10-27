import {admin, v2Db} from "../firebase-admin";

export const getActorName = async (uid: string, tokenName?: unknown): Promise<string> => {
  const profile = await v2Db.doc(`user/${uid}`).get();
  const composedName = [profile.get("first_name"), profile.get("last_name")]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .join(" ")
    .trim();
  const profileName = String(profile.get("display_name") ?? "").trim();
  if (profileName || composedName) return profileName || composedName;
  if (typeof tokenName === "string" && tokenName.trim()) return tokenName.trim();
  try {
    const authUser = await admin.auth().getUser(uid);
    return authUser.displayName || authUser.email || uid;
  } catch {
    return uid;
  }
};
