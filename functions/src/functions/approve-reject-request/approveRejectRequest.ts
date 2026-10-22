import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {RetreatI} from "../../core/interfaces/retreat.interface";
import {RetreatHomeI} from "../../core/interfaces/retreat-home.interface";
import {UserI} from "../../core/interfaces/user.interface";
import {generateEmailHeader, EMAIL_CONSTANTS} from "../../core/typescript/emailHelpers";
import {formatDate} from "../../core/helpers/date";
import {generateCoupleNames, getRequestContext, processEmails} from "../../core/helpers/request";
import {getResendApiKey, resendApiKey, sendResendEmail} from "../../core/helpers/resend";

// Constantes
const CONSTANTS = {
  STATUS: {
    ACCEPTED: "accepted",
    REJECTED: "rejected",
  } as const,
} as const;

// Tipos mejorados
type RequestStatus = (typeof CONSTANTS.STATUS)[keyof typeof CONSTANTS.STATUS];

interface EmailData {
  coupleNames: string;
  apiKey: string;
  uniqueEmails: string[];
  retreatNumber: number;
  userInfo: UserI | null;
}

interface RejectedEmailData extends EmailData {
  [key: string]: any;
}

interface AcceptedEmailData extends EmailData {
  retreatInfo: RetreatI;
}

// Función helper para obtener información de la casa de retiro
const getRetreatHomeInfo = async (retreatHomeRef: any): Promise<RetreatHomeI | null> => {
  try {
    const retreatHomeSnapshot = await retreatHomeRef.get();

    if (!retreatHomeSnapshot.exists) {
      console.warn("La casa de retiro no existe");
      return null;
    }

    return retreatHomeSnapshot.data() as RetreatHomeI;
  } catch (err) {
    console.error("Error obteniendo información de la casa de retiro:", err);
    return null;
  }
};

// Función helper para obtener URLs de las imágenes de la casa de retiro
const getRetreatHomeImages = async (imageRefs: any[]): Promise<string[]> => {
  if (!imageRefs?.length) return [];

  try {
    const imagePromises = imageRefs.map(async (imageRef: any) => {
      try {
        const imageSnapshot = await imageRef.get();
        if (imageSnapshot.exists) {
          const imageData = imageSnapshot.data();
          return imageData?.url || null;
        }
        return null;
      } catch (err) {
        console.error("Error obteniendo imagen:", err);
        return null;
      }
    });

    const imageUrls = await Promise.all(imagePromises);
    return imageUrls.filter((url): url is string => url !== null);
  } catch (err) {
    console.error("Error procesando imágenes:", err);
    return [];
  }
};

// Función helper para generar la sección de información del retiro
const generateRetreatInfoSection = (retreatInfo: RetreatI, retreatHomeInfo: RetreatHomeI): string => {
  const startDate = formatDate(retreatInfo.start_date);
  const endDate = formatDate(retreatInfo.end_date);

  return `
    <div style="background-color: #f8f9fa; border-left: 4px solid ${EMAIL_CONSTANTS.BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h3 style="color: ${EMAIL_CONSTANTS.BRAND_COLOR}; margin: 0 0 15px 0; font-size: 18px;">Información del retiro:</h3>
      <div style="margin-bottom: 10px;">
        <strong>Fechas:</strong> ${startDate} - ${endDate}
      </div>
      <div style="margin-bottom: 15px;">
        <strong>Casa de retiro:</strong> ${retreatHomeInfo.name || "No especificada"}
      </div>
      <div style="margin-bottom: 15px;">
        <strong>Dirección:</strong> ${retreatHomeInfo.address || "No especificada"}
      </div>
      ${
        retreatHomeInfo.location
          ? `
        <a href="${retreatHomeInfo.location}" target="_blank" style="display: inline-block; background-color: ${EMAIL_CONSTANTS.SECONDARY_COLOR}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          📍 Abrir ubicación casa de retiro
        </a>
      `
          : ""
      }
    </div>
  `;
};

// Función helper para generar la sección de imágenes
const generateImagesSection = (images: string[]): string => {
  if (!images.length) return "";

  return `
    <div style="margin: 20px 0;">
      <h3 style="color: ${EMAIL_CONSTANTS.BRAND_COLOR}; margin-bottom: 15px;">Imágenes de la casa de retiro:</h3>
      <div style="display: flex; flex-wrap: wrap; justify-content: center;">
        ${images
          .map(
            (imageUrl) => `
          <div style="margin: 5px; flex: 1 1 250px; min-width: 250px; max-width: 600px;">
            <img src="${imageUrl}" alt="Casa de retiro" style="width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px #000000;">
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
};

// Función para enviar correo de aceptación
const sendAcceptedEmail = async (data: AcceptedEmailData): Promise<void> => {
  const {coupleNames, apiKey, uniqueEmails, retreatNumber, retreatInfo, userInfo} = data;

  // Obtener información de la casa de retiro
  const retreatHomeInfo = await getRetreatHomeInfo(retreatInfo.retreat_home);
  if (!retreatHomeInfo) {
    console.error("No se encontró información de la casa de retiro");
    return;
  }

  // Obtener URLs de las imágenes de la casa de retiro
  const images = await getRetreatHomeImages(retreatHomeInfo.images);

  const subject = "¡Solicitud Aceptada! - Encuentro Católico para Novios";
  const html = `
    ${await generateEmailHeader(userInfo)}
    <div style="padding: 10px;">
      <p>Hola ${coupleNames},</p>
      <p>¡Excelentes noticias! Su solicitud para participar en el retiro <strong>#${retreatNumber}</strong> de <strong>Encuentro Católico para Novios</strong> ha sido <strong>ACEPTADA</strong>.</p>
      <br>
      ${generateRetreatInfoSection(retreatInfo, retreatHomeInfo)}
      ${generateImagesSection(images)}
      <p>Nos pondremos en contacto con ustedes pronto para proporcionarles todos los detalles necesarios para su participación en esta experiencia transformadora.</p>
      <br>
      <p>¡Bienvenidos a la familia de Encuentro Católico para Novios!</p>
      <br>
      <p>Con alegría,<br>Equipo de Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({apiKey, to: uniqueEmails, subject, html});
};

// Función para enviar correo de rechazo
const sendRejectedEmail = async (data: RejectedEmailData): Promise<void> => {
  const {coupleNames, apiKey, uniqueEmails, retreatNumber, userInfo} = data;

  const subject = "Información sobre su solicitud - Encuentro Católico para Novios";
  const html = `
    ${await generateEmailHeader(userInfo)}
    <div style="padding: 10px;">
      <p>Hola ${coupleNames},</p>
      <p>Gracias por su interés en participar en el retiro <strong>#${retreatNumber}</strong> de <strong>Encuentro Católico para Novios</strong>.</p>
      <br>
      <p>Lamentamos informarles que en esta ocasión no hemos podido aceptar su solicitud. Sin embargo, les invitamos a comunicarse con nuestro equipo de reclutamiento y promoción para recibir más información ${userInfo && userInfo.phone ? `al teléfono ${userInfo.phone} vía WhatsApp,` : ""} sobre futuras oportunidades y cómo pueden prepararse para próximos retiros.</p>
      <br>
      <p>Les agradecemos su comprensión y les deseamos lo mejor en su camino de fe.</p>
      <br>
      <p>Saludos cordiales,<br>Equipo de Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({apiKey, to: uniqueEmails, subject, html});
};

// Función principal que maneja la actualización de estado
export const onStatusUpdate = onDocumentUpdated(
  {document: "user/{userId}/retreat/{retreatId}/request/{requestId}", secrets: [resendApiKey]},
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const docTrace = event.params;

    if (!beforeData || !afterData) {
      console.error("No se encontraron datos en el documento");
      return;
    }

    // Verificar si solo cambió el status
    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status as RequestStatus;

    if (beforeStatus === afterStatus) return;

    // Solo procesar si el status es 'accepted' o 'rejected'
    if (afterStatus !== CONSTANTS.STATUS.ACCEPTED && afterStatus !== CONSTANTS.STATUS.REJECTED) return;

    const {she, he} = afterData;

    // Procesar emails
    const uniqueEmails = processEmails(she, he);
    if (uniqueEmails.length === 0) {
      console.error("No hay correos electrónicos válidos disponibles");
      return;
    }

    // Obtener información del retiro y del admin
    const {retreatInfo, userInfo} = await getRequestContext({
      userId: docTrace.userId,
      retreatId: docTrace.retreatId,
    });

    console.log(" ");
    console.log(" ");
    console.log(" ");
    console.log("retreatInfo ", retreatInfo);
    console.log(" ");
    console.log(" ");
    console.log(" ");

    if (!retreatInfo) {
      console.error("No se encontró información del retiro");
      return;
    }

    // Generar nombres de la pareja
    const coupleNames = generateCoupleNames(she, he);

    // Obtener API key
    const apiKey = getResendApiKey();
    if (!apiKey) {
      return;
    }

    // Enviar correo según el status
    try {
      if (afterStatus === CONSTANTS.STATUS.ACCEPTED) {
        await sendAcceptedEmail({
          coupleNames,
          apiKey,
          uniqueEmails,
          retreatNumber: retreatInfo.number,
          retreatInfo,
          userInfo,
        });
      } else if (afterStatus === CONSTANTS.STATUS.REJECTED) {
        await sendRejectedEmail({
          coupleNames,
          apiKey,
          uniqueEmails,
          retreatNumber: retreatInfo.number,
          userInfo,
        });
      }
    } catch (error) {
      console.error(`Error procesando solicitud ${afterStatus}:`, error);
    }
  }
);
