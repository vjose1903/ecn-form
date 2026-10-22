import {RetreatI} from "../interfaces/retreat.interface";
import {UserI} from "../interfaces/user.interface";
import {concatWords} from "../typescript/concatWords";
import {getAdminInfo, getRetreatInfo} from "../typescript/firebaseHelpers";

const DEFAULT_NAMES = {
  SHE: "Ella",
  HE: "Él",
} as const;

type CoupleEmailInfo = {
  email?: string;
};

type CoupleNameInfo = {
  full_name?: string;
};

interface RequestPathParams {
  userId: string;
  retreatId: string;
}

interface RequestPaths {
  userRefPath: string;
  retreatRefPath: string;
}

interface RequestContext extends RequestPaths {
  retreatInfo: RetreatI | null;
  userInfo: UserI | null;
}

export const processEmails = (she?: CoupleEmailInfo, he?: CoupleEmailInfo): string[] => {
  const emails = [she?.email, he?.email]
    .filter((email): email is string => Boolean(email))
    .map((email) => email.trim().toLowerCase());

  return [...new Set(emails)];
};

export const generateCoupleNames = (she?: CoupleNameInfo, he?: CoupleNameInfo): string => {
  const sheName = she?.full_name || DEFAULT_NAMES.SHE;
  const heName = he?.full_name || DEFAULT_NAMES.HE;

  return concatWords([sheName, heName]);
};

export const getRequestPaths = ({userId, retreatId}: RequestPathParams): RequestPaths => ({
  userRefPath: `user/${userId}`,
  retreatRefPath: `user/${userId}/retreat/${retreatId}`,
});

export const getRequestContext = async ({userId, retreatId}: RequestPathParams): Promise<RequestContext> => {
  const {userRefPath, retreatRefPath} = getRequestPaths({userId, retreatId});

  const [retreatInfo, userInfo] = await Promise.all([getRetreatInfo(retreatRefPath), getAdminInfo(userRefPath)]);

  return {
    userRefPath,
    retreatRefPath,
    retreatInfo,
    userInfo,
  };
};
