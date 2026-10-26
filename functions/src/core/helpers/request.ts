import {concatWords} from "../typescript/concatWords";

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
