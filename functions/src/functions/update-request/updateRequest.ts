import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {RetreatI} from "../../core/interfaces/retreat.interface";
import {generateEmailHeader} from "../../core/typescript/emailHelpers";
import {convertFirestoreTimestamp} from "../../core/typescript/firebaseHelpers";
import {UserI} from "../../core/interfaces/user.interface";
import {coupleFieldsE, FamilyMemberI, fieldsLabelE} from "../../core/interfaces/request.interface";
import {generateCoupleNames, getRequestContext, processEmails} from "../../core/helpers/request";
import {getResendApiKey, resendApiKey, sendResendEmail} from "../../core/helpers/resend";

// Tipos mejorados
interface EmailData {
  coupleNames: string;
  retreatNumber: number | string;
  apiKey: string;
  uniqueEmails: string[];
  retreatInfo: RetreatI | null;
  userInfo: UserI | null;
  changedFields: string[];
}

// Función helper para detectar el tipo de dato y formatearlo apropiadamente
const formatValue = (value: any): string => {
  if (!value) return "No especificado";

  // Si es un timestamp de Firestore o Date, convertirlo a fecha legible
  if (typeof value === "object" && (value.seconds || value._seconds || value instanceof Date)) {
    return convertFirestoreTimestamp(value).toLocaleDateString("es-ES", {
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
const compareValues = (beforeVal: any, afterVal: any): boolean => {
  // Si ambos son fechas o timestamps, convertirlos y comparar
  if (beforeVal && afterVal && (typeof beforeVal === "object" || typeof afterVal === "object")) {
    const beforeDate = convertFirestoreTimestamp(beforeVal);
    const afterDate = convertFirestoreTimestamp(afterVal);
    return beforeDate.getTime() === afterDate.getTime();
  }
  return beforeVal === afterVal;
};

// Función helper para detectar campos cambiados
const detectChangedFields = (before: any, after: any): string[] => {
  const changedFields: string[] = [];

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
  [coupleFieldsE.she, coupleFieldsE.he].forEach((couple) => {
    if (!before[couple] || !after[couple]) return;

    const person = couple === coupleFieldsE.she ? "Novia" : "Novio";

    // Campos básicos
    coupleFields.forEach((field) => {
      if (!compareValues(before[couple][field], after[couple][field])) {
        const fieldKey = field as keyof typeof fieldsLabelE;
        changedFields.push(`${person} - ${fieldsLabelE[fieldKey]}: ${formatValue(after[couple][field])}`);
      }
    });

    // Family information
    const beforeF = before[couple].family_information;
    const afterF = after[couple].family_information;
    if (beforeF?.length !== afterF?.length) {
      changedFields.push(
        `${person} - ${fieldsLabelE.family_information}: Se ${beforeF?.length < afterF?.length ? "agregó" : "eliminó"} un familiar`
      );
    } else if (beforeF && afterF) {
      beforeF.forEach((beforeMember: FamilyMemberI, i: number) => {
        const afterMember = afterF[i];
        if (afterMember) {
          if (beforeMember.familiar_full_name !== afterMember.familiar_full_name) {
            changedFields.push(
              `${person} - ${fieldsLabelE.family_information} - Nombre: ${afterMember.familiar_full_name}`
            );
          }
          if (beforeMember.familiar_relationship !== afterMember.familiar_relationship) {
            changedFields.push(
              `${person} - ${fieldsLabelE.family_information} - Relación: ${afterMember.familiar_relationship}`
            );
          }
          if (beforeMember.familiar_phone !== afterMember.familiar_phone) {
            changedFields.push(
              `${person} - ${fieldsLabelE.family_information} - Teléfono: ${afterMember.familiar_phone}`
            );
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
      const fieldKey = field as keyof typeof fieldsLabelE;
      changedFields.push(`${fieldsLabelE[fieldKey]}: ${formatValue(after[field])}`);
    }
  });

  return changedFields;
};

// Función para enviar correo de notificación de actualización a la pareja
const sendUpdateNotificationEmail = async (data: EmailData): Promise<void> => {
  const {coupleNames, retreatNumber, apiKey, uniqueEmails, retreatInfo, userInfo, changedFields} = data;

  const subject = "Tu solicitud ha sido actualizada";
  const html = `
    ${await generateEmailHeader(userInfo)}
    <div style="padding: 10px;">
      <p>Hola ${coupleNames},</p>
      <p>Tu solicitud para participar en el retiro ${
        retreatInfo ? `<strong>#${retreatNumber}</strong>` : ""
      } de <strong>Encuentro Católico para Novios</strong> ha sido actualizada.</p>

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

  await sendResendEmail({apiKey, to: uniqueEmails, subject, html});
};

// Función principal que maneja las actualizaciones de solicitudes
export const onUpdateRetreatRequest = onDocumentUpdated(
  {document: "user/{userId}/retreat/{retreatId}/request/{requestId}", secrets: [resendApiKey]},
  async (event) => {
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

    const {she, he} = afterData;

    // Detectar campos cambiados
    const changedFields = detectChangedFields(beforeData as any, afterData as any);

    // Solo enviar notificación si hay cambios
    if (changedFields.length === 0) {
      console.log("No se detectaron cambios en el documento");
      return;
    }

    // Procesar emails
    const uniqueEmails = processEmails(she, he);
    if (uniqueEmails.length === 0) {
      console.error("No hay correos electrónicos válidos disponibles");
      return;
    }

    // Obtener información del documento de retiro y usuario admin
    const {retreatInfo, userInfo} = await getRequestContext({
      userId: docTrace.userId,
      retreatId: docTrace.retreatId,
    });

    const retreatNumber = retreatInfo?.number || "desconocido";

    // Obtener API key
    const apiKey = getResendApiKey();
    if (!apiKey) {
      return;
    }

    // Generar nombres de la pareja
    const coupleNames = generateCoupleNames(she, he);

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
    } catch (error) {
      console.error("Error enviando notificación de actualización:", error);
    }
  }
);
