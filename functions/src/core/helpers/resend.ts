import {defineSecret} from "firebase-functions/params";
import {Resend} from "resend";
import {EMAIL_CONSTANTS} from "../typescript/emailHelpers";
import {isEmulator} from "./runtime";

export const resendApiKey = defineSecret("RESEND_API_KEY");

interface SendResendEmailArgs {
  apiKey: string;
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  logLabel?: string;
  suppressError?: boolean;
  idempotencyKey?: string;
}

export const getResendApiKey = (): string | null => {
  const apiKey = isEmulator ? process.env.RESEND_API_KEY : resendApiKey.value();

  if (!apiKey) {
    console.error("No se pudo obtener la API key de Resend");
    return null;
  }

  return apiKey;
};

export const sendResendEmail = async ({
  apiKey,
  to,
  subject,
  html,
  from = EMAIL_CONSTANTS.FROM_EMAIL,
  logLabel,
  suppressError = false,
  idempotencyKey,
}: SendResendEmailArgs): Promise<void> => {
  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({from, to, subject, html}, idempotencyKey ? {idempotencyKey} : undefined);
    if (result.error) throw result.error;

    if (logLabel) {
      console.log(`Correo de ${logLabel} enviado exitosamente`);
    }
  } catch (error) {
    const errorLabel = logLabel ? ` de ${logLabel}` : ` (${subject})`;
    console.error(`Error enviando correo${errorLabel}:`, error);

    if (!suppressError) {
      throw error;
    }
  }
};
