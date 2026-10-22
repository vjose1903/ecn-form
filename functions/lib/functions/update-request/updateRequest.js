"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUpdateRetreatRequest = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const emailHelpers_1 = require("../../core/typescript/emailHelpers");
const firebaseHelpers_1 = require("../../core/typescript/firebaseHelpers");
const request_interface_1 = require("../../core/interfaces/request.interface");
const request_1 = require("../../core/helpers/request");
const resend_1 = require("../../core/helpers/resend");
// Función helper para detectar el tipo de dato y formatearlo apropiadamente
const formatValue = (value) => {
    if (!value)
        return "No especificado";
    // Si es un timestamp de Firestore o Date, convertirlo a fecha legible
    if (typeof value === "object" && (value.seconds || value._seconds || value instanceof Date)) {
        return (0, firebaseHelpers_1.convertFirestoreTimestamp)(value).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    }
    // Si es un boolean, convertirlo a texto legible
    if (typeof value === "boolean") {
        return value ? "Sí" : "No";
    }
    // Si es un string o número, devolverlo tal como está
    return String(value);
};
// Función helper para comparar valores (incluyendo fechas)
const compareValues = (beforeVal, afterVal) => {
    // Si ambos son fechas o timestamps, convertirlos y comparar
    if (beforeVal && afterVal && (typeof beforeVal === "object" || typeof afterVal === "object")) {
        const beforeDate = (0, firebaseHelpers_1.convertFirestoreTimestamp)(beforeVal);
        const afterDate = (0, firebaseHelpers_1.convertFirestoreTimestamp)(afterVal);
        return beforeDate.getTime() === afterDate.getTime();
    }
    return beforeVal === afterVal;
};
// Función helper para detectar campos cambiados
const detectChangedFields = (before, after) => {
    const changedFields = [];
    const coupleFields = [
        "full_name",
        "age",
        "city_of_residence",
        "are_you_married",
        "religion",
        "emergency_full_name",
        "have_children",
        "identity_type",
        "birth_date",
        "church_name",
        "home_phone",
        "email",
        "nickname",
        "address",
        "emergency_relationship",
        "cell_phone",
        "identity_number",
        "work_phone",
        "emergency_phone",
    ];
    // Detectar cambios para novia y novio
    [request_interface_1.coupleFieldsE.she, request_interface_1.coupleFieldsE.he].forEach((couple) => {
        if (!before[couple] || !after[couple])
            return;
        const person = couple === request_interface_1.coupleFieldsE.she ? "Novia" : "Novio";
        // Campos básicos
        coupleFields.forEach((field) => {
            if (!compareValues(before[couple][field], after[couple][field])) {
                const fieldKey = field;
                changedFields.push(`${person} - ${request_interface_1.fieldsLabelE[fieldKey]}: ${formatValue(after[couple][field])}`);
            }
        });
        // Family information
        const beforeF = before[couple].family_information;
        const afterF = after[couple].family_information;
        if (beforeF?.length !== afterF?.length) {
            changedFields.push(`${person} - ${request_interface_1.fieldsLabelE.family_information}: Se ${beforeF?.length < afterF?.length ? "agregó" : "eliminó"} un familiar`);
        }
        else if (beforeF && afterF) {
            beforeF.forEach((beforeMember, i) => {
                const afterMember = afterF[i];
                if (afterMember) {
                    if (beforeMember.familiar_full_name !== afterMember.familiar_full_name) {
                        changedFields.push(`${person} - ${request_interface_1.fieldsLabelE.family_information} - Nombre: ${afterMember.familiar_full_name}`);
                    }
                    if (beforeMember.familiar_relationship !== afterMember.familiar_relationship) {
                        changedFields.push(`${person} - ${request_interface_1.fieldsLabelE.family_information} - Relación: ${afterMember.familiar_relationship}`);
                    }
                    if (beforeMember.familiar_phone !== afterMember.familiar_phone) {
                        changedFields.push(`${person} - ${request_interface_1.fieldsLabelE.family_information} - Teléfono: ${afterMember.familiar_phone}`);
                    }
                }
            });
        }
    });
    // Comparar campos del request principal
    const requestFields = [
        "how_find_us",
        "have_wedding_date",
        "who_invited_you",
        "who_invited_you_phone",
        "wedding_date",
        "dating_period_year",
        "dating_period_month",
        "how_find_us_other",
    ];
    requestFields.forEach((field) => {
        if (!compareValues(before[field], after[field])) {
            const fieldKey = field;
            changedFields.push(`${request_interface_1.fieldsLabelE[fieldKey]}: ${formatValue(after[field])}`);
        }
    });
    return changedFields;
};
// Función para enviar correo de notificación de actualización a la pareja
const sendUpdateNotificationEmail = async (data) => {
    const { coupleNames, retreatNumber, apiKey, uniqueEmails, retreatInfo, userInfo, changedFields } = data;
    const subject = "Tu solicitud ha sido actualizada";
    const html = `
    ${await (0, emailHelpers_1.generateEmailHeader)(userInfo)}
    <div style="padding: 10px;">
      <p>Hola ${coupleNames},</p>
      <p>Tu solicitud para participar en el retiro ${retreatInfo ? `<strong>#${retreatNumber}</strong>` : ""} de <strong>Encuentro Católico para Novios</strong> ha sido actualizada.</p>

      <div style="background-color: #f8f9fa; border-left: 4px solid #a83044; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #a83044; margin: 0 0 15px 0; font-size: 18px;">Campos actualizados:</h3>
        <ul style="margin: 0; padding-left: 20px;">
          ${changedFields.map((field) => `<li style="margin-bottom: 5px;">${field}</li>`).join("")}
        </ul>
      </div>

      <p>Si tienes alguna pregunta sobre estos cambios, no dudes en contactarnos.</p>
      <br>
      <p>Saludos,</p>
      <p>Encuentro Católico para Novios</p>
    </div>
  `;
    await (0, resend_1.sendResendEmail)({ apiKey, to: uniqueEmails, subject, html });
};
// Función principal que maneja las actualizaciones de solicitudes
exports.onUpdateRetreatRequest = (0, firestore_1.onDocumentUpdated)({ document: "user/{userId}/retreat/{retreatId}/request/{requestId}", secrets: [resend_1.resendApiKey] }, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const docTrace = event.params;
    console.log(" ");
    console.log(" ");
    console.log("docTrace ", docTrace);
    console.log(" ");
    console.log(" ");
    if (!beforeData || !afterData) {
        console.error("No se encontraron datos del documento antes o después de la actualización");
        return;
    }
    if (afterData.action !== "updated") {
        console.log(`Skipping updateRequest flow for action: ${afterData.action || "undefined"}`);
        return;
    }
    const { she, he } = afterData;
    // Detectar campos cambiados
    const changedFields = detectChangedFields(beforeData, afterData);
    // Solo enviar notificación si hay cambios
    if (changedFields.length === 0) {
        console.log("No se detectaron cambios en el documento");
        return;
    }
    // Procesar emails
    const uniqueEmails = (0, request_1.processEmails)(she, he);
    if (uniqueEmails.length === 0) {
        console.error("No hay correos electrónicos válidos disponibles");
        return;
    }
    // Obtener información del documento de retiro y usuario admin
    const { retreatInfo, userInfo } = await (0, request_1.getRequestContext)({
        userId: docTrace.userId,
        retreatId: docTrace.retreatId,
    });
    const retreatNumber = retreatInfo?.number || "desconocido";
    // Obtener API key
    const apiKey = (0, resend_1.getResendApiKey)();
    if (!apiKey) {
        return;
    }
    // Generar nombres de la pareja
    const coupleNames = (0, request_1.generateCoupleNames)(she, he);
    // Enviar correo de notificación
    try {
        await sendUpdateNotificationEmail({
            coupleNames,
            retreatNumber,
            apiKey,
            uniqueEmails,
            retreatInfo,
            userInfo,
            changedFields,
        });
        console.log(`Notificación de actualización enviada a la pareja. Campos cambiados: ${changedFields.join(", ")}`);
    }
    catch (error) {
        console.error("Error enviando notificación de actualización:", error);
    }
});
//# sourceMappingURL=updateRequest.js.map