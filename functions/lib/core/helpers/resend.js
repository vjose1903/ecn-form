"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendResendEmail = exports.getResendApiKey = exports.resendApiKey = void 0;
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const emailHelpers_1 = require("../typescript/emailHelpers");
const runtime_1 = require("./runtime");
exports.resendApiKey = (0, params_1.defineSecret)("RESEND_API_KEY");
const getResendApiKey = () => {
    const apiKey = runtime_1.isEmulator ? process.env.RESEND_API_KEY : exports.resendApiKey.value();
    if (!apiKey) {
        console.error("No se pudo obtener la API key de Resend");
        return null;
    }
    return apiKey;
};
exports.getResendApiKey = getResendApiKey;
const sendResendEmail = async ({ apiKey, to, subject, html, from = emailHelpers_1.EMAIL_CONSTANTS.FROM_EMAIL, logLabel, suppressError = false, }) => {
    const resend = new resend_1.Resend(apiKey);
    try {
        await resend.emails.send({ from, to, subject, html });
        if (logLabel) {
            console.log(`Correo de ${logLabel} enviado exitosamente`);
        }
    }
    catch (error) {
        const errorLabel = logLabel ? ` de ${logLabel}` : ` (${subject})`;
        console.error(`Error enviando correo${errorLabel}:`, error);
        if (!suppressError) {
            throw error;
        }
    }
};
exports.sendResendEmail = sendResendEmail;
//# sourceMappingURL=resend.js.map