import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {admin, v2Db} from "../../core/firebase-admin";
import {RetreatI} from "../../core/interfaces/retreat.interface";
import {generateEmailHeader, EMAIL_CONSTANTS} from "../../core/typescript/emailHelpers";
import {UserI} from "../../core/interfaces/user.interface";
import {CoupleI} from "../../core/interfaces/request.interface";
import {generateCoupleNames, processEmails} from "../../core/helpers/request";
import {getResendApiKey, resendApiKey, sendResendEmail} from "../../core/helpers/resend";

// Constantes
const CONSTANTS = {
  PUSH: {
    APP_URL: "https://ecn-platform.netlify.app/retiros",
    ICON: "/icons/icon-192x192.png",
    TYPE: "new_retreat_request",
  },
} as const;

const INVALID_PUSH_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

// Tipos mejorados
interface EmailData {
  coupleNames: string;
  retreatNumber: number | string;
  apiKey: string;
  uniqueEmails: string[];
  retreatInfo: RetreatI | null;
  userInfo: UserI | null;
}

interface AdminEmailData {
  adminEmail: string;
  retreatNumber: number | string;
  apiKey: string;
  userInfo: UserI | null;
  couple: {
    she: CoupleI;
    he: CoupleI;
  };
}

interface AdminPushTokenDoc {
  token?: string;
  enabled?: boolean;
  platform?: string;
}

interface AdminPushTokenRecord {
  docId: string;
  token: string;
}

interface AdminPushNotificationData {
  userId: string;
  retreatId: string;
  requestId: string;
  retreatNumber: number | string;
  couple: {
    she?: {full_name?: string};
    he?: {full_name?: string};
  };
}

const generateAdminNotificationUrl = (data: {retreatId: string; requestId: string}): string =>
  `${CONSTANTS.PUSH.APP_URL}?openRetreat=1&retreatId=${data.retreatId}&openRequest=1&requestId=${data.requestId}`;

const generatePushBody = (she?: {full_name?: string}, he?: {full_name?: string}): string => {
  const hasCoupleNames = Boolean(she?.full_name || he?.full_name);

  if (!hasCoupleNames) {
    return "Se ha recibido una nueva solicitud de retiro.";
  }

  return `La pareja ${generateCoupleNames(she, he)} ha enviado una nueva solicitud.`;
};

// Función optimizada para enviar correo a la pareja
const sendCoupleEmail = async (data: EmailData): Promise<void> => {
  const {coupleNames, retreatNumber, apiKey, uniqueEmails, retreatInfo, userInfo} = data;

  const subject = "Confirmación de solicitud recibida";
  const html = `
    ${await generateEmailHeader(userInfo)}
    <div style="padding: 10px;">
      <p>Hola ${coupleNames},</p>
      <p>Hemos recibido su solicitud para participar en el retiro ${
        retreatInfo ? `<strong>#${retreatNumber}</strong>` : ""
      } de <strong>Encuentro Católico para Novios</strong> y está siendo evaluada por nuestro equipo de reclutamiento y promoción.</p>
      <p>Nos pondremos en contacto con ustedes pronto con más detalles.</p>
      <br>
      <p>Gracias por su interés,</p>
      <p>Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({apiKey, to: uniqueEmails, subject, html});
};

// Función optimizada para enviar notificación al administrador del retiro
const sendAdminNotificationEmail = async (data: AdminEmailData): Promise<void> => {
  const {adminEmail, retreatNumber, apiKey, userInfo, couple} = data;

  const subject = `Nueva solicitud recibida - Retiro #${retreatNumber}`;
  const html = `
    ${await generateEmailHeader(userInfo)}
    <div style="padding: 10px;">
      <p>Hola Administrador,</p>
      <p>Se ha recibido una nueva solicitud para vivir la experiencia de <strong>Encuentro Católico para Novios</strong>.</p>
      <br>
    <div style="background-color: #f8f9fa; border-left: 4px solid ${EMAIL_CONSTANTS.BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h3 style="color: ${EMAIL_CONSTANTS.BRAND_COLOR}; margin: 0 0 15px 0; font-size: 18px;">Detalles de la solicitud:</h3>
      <div style="margin-bottom: 10px;">
        <h3 style="margin: 0 0 5px 0; font-size: 15px; font-weight: bold;">Pareja</h3>
        <br>
        <strong>Novia:</strong> ${couple.she.full_name} ${couple.she.nickname ? `(${couple.she.nickname})` : ""} - ${couple.she.city_of_residence}
        <br>
        <strong>Novio:</strong> ${couple.he.full_name} ${couple.he.nickname ? `(${couple.he.nickname})` : ""} - ${couple.he.city_of_residence}
      </div>

      <div style="margin-bottom: 15px;">
        <strong>Retiro:</strong> #${retreatNumber}
      </div>
    </div>
      <br>
      <p>Por favor, revise la solicitud en el panel de administración.</p>

      <a href="https://ecn-platform.netlify.app/retiros" target="_blank" style="display: inline-block; background-color: ${EMAIL_CONSTANTS.SECONDARY_COLOR}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Panel de administración
      </a>
      <br>
      <p>Saludos,<br>Sistema de Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({
    apiKey,
    to: [adminEmail],
    subject,
    html,
    from: EMAIL_CONSTANTS.FROM_EMAIL_ADMIN,
  });
};

const getActiveAdminPushTokens = async (userId: string): Promise<AdminPushTokenRecord[]> => {
  const pushTokensSnapshot = await v2Db.collection(`user/${userId}/push_tokens`).get();

  const activeTokens = pushTokensSnapshot.docs.flatMap((doc) => {
    const pushTokenData = doc.data() as AdminPushTokenDoc;
    const token = pushTokenData.token?.trim();
    const isEnabled = pushTokenData.enabled !== false;
    const isWebToken = !pushTokenData.platform || pushTokenData.platform === "web";

    if (!token || !isEnabled || !isWebToken) {
      return [];
    }

    return [
      {
        docId: doc.id,
        token,
      },
    ];
  });

  console.log(`Tokens push activos encontrados para admin ${userId}: ${activeTokens.length}`);

  return activeTokens;
};

const cleanupInvalidAdminPushTokens = async (userId: string, docIds: string[]): Promise<number> => {
  if (docIds.length === 0) {
    return 0;
  }

  const batch = v2Db.batch();

  docIds.forEach((docId) => {
    const pushTokenRef = v2Db.doc(`user/${userId}/push_tokens/${docId}`);
    batch.delete(pushTokenRef);
  });

  await batch.commit();

  console.warn(`Tokens push inválidos eliminados para admin ${userId}: ${docIds.length}`);

  return docIds.length;
};

const sendAdminPushNotification = async (data: AdminPushNotificationData): Promise<void> => {
  const {userId, retreatId, requestId, retreatNumber, couple} = data;
  const activeTokens = await getActiveAdminPushTokens(userId);

  if (activeTokens.length === 0) {
    console.log(`No hay tokens push activos para el admin ${userId}`);
    return;
  }

  const tokenDocIdsMap = new Map<string, string[]>();

  activeTokens.forEach(({docId, token}) => {
    const docIds = tokenDocIdsMap.get(token) || [];
    docIds.push(docId);
    tokenDocIdsMap.set(token, docIds);
  });

  const tokens = Array.from(tokenDocIdsMap.keys());
  const title = `Nueva solicitud recibida - Retiro #${retreatNumber}`;
  const body = generatePushBody(couple.she, couple.he);
  const url = generateAdminNotificationUrl({retreatId, requestId});

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        type: CONSTANTS.PUSH.TYPE,
        title,
        body,
        userId: String(userId),
        retreatId: String(retreatId),
        requestId: String(requestId),
        retreatNumber: String(retreatNumber),
        url,
        tag: `retreat-request-${requestId}`,
      },
      webpush: {
        fcmOptions: {
          link: url,
        },
      },
    });

    const invalidDocIds = response.responses.flatMap((sendResponse, index) => {
      const errorCode = sendResponse.error?.code;

      if (!errorCode || !INVALID_PUSH_TOKEN_ERROR_CODES.has(errorCode)) {
        return [];
      }

      const token = tokens[index];
      return tokenDocIdsMap.get(token) || [];
    });

    const cleanedTokens = await cleanupInvalidAdminPushTokens(userId, [...new Set(invalidDocIds)]);

    console.log(
      `Push admin procesado para ${userId}: enviados=${tokens.length}, exitosos=${response.successCount}, fallidos=${response.failureCount}, limpiados=${cleanedTokens}`
    );
  } catch (error) {
    console.error(`Error enviando push al administrador ${userId}:`, error);
    throw error;
  }
};

// Notifica solicitudes creadas en la base nueva y obtiene los destinatarios de la ciudad.
export const onCreateRetreatRequestV2 = onDocumentCreated(
  {database: "ecn-platform-v2", document: "city/{cityId}/requests/{requestId}", secrets: [resendApiKey]},
  async event => {
    const root = event.data?.data();
    if (!root) return;
    if (typeof root.migration_actor_uid === "string") return;

    const {cityId, requestId} = event.params;
    const retreatId = String(root.retreat_id ?? "");
    if (!retreatId) return;
    const rootRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
    const [retreatSnapshot, basicSnapshot, contactSnapshot, citySnapshot, adminMembers] = await Promise.all([
      v2Db.doc(`city/${cityId}/retreat/${retreatId}`).get(),
      rootRef.collection("details").doc("couple_basic").get(),
      rootRef.collection("details").doc("contact").get(),
      v2Db.doc(`city/${cityId}`).get(),
      v2Db.collection(`city/${cityId}/members`).where("role_id", "==", "city_admin").where("status", "==", "active").get(),
    ]);
    const coupleBasic = basicSnapshot.data() ?? {};
    const contact = contactSnapshot.data() ?? {};
    const couple = {
      she: {...(coupleBasic.she ?? {}), ...(contact.she ?? {})},
      he: {...(coupleBasic.he ?? {}), ...(contact.he ?? {})},
    } as {she: CoupleI; he: CoupleI};
    const [cityAdmins, apiKey] = await Promise.all([
      Promise.all(adminMembers.docs.map(member => v2Db.doc(`user/${member.id}`).get())),
      Promise.resolve(getResendApiKey()),
    ]);
    const city = citySnapshot.data();
    const retreat = (retreatSnapshot.data() ?? null) as RetreatI | null;
    const retreatNumber = retreat?.number ?? retreatId.split("_")[0] ?? "desconocido";
    const adminProfiles = cityAdmins.filter(profile => profile.exists && profile.get("email"))
      .map(profile => ({
        id: profile.id,
        uid: profile.id,
        email: String(profile.get("email")),
        phone: String(profile.get("phone") ?? ""),
        city: city ? {id: cityId, ...city} : cityId,
      } as UserI));
    const uniqueEmails = processEmails(couple.she, couple.he);
    const coupleNames = generateCoupleNames(couple.she, couple.he);

    const notifications = await Promise.allSettled([
      apiKey && uniqueEmails.length > 0
        ? sendCoupleEmail({coupleNames, retreatNumber, apiKey, uniqueEmails, retreatInfo: retreat, userInfo: adminProfiles[0] ?? null})
        : Promise.resolve(),
      ...(apiKey ? adminProfiles.map(userInfo => sendAdminNotificationEmail({
        adminEmail: userInfo.email,
        retreatNumber,
        apiKey,
        userInfo,
        couple,
      })) : []),
      ...adminMembers.docs.map(member => sendAdminPushNotification({
        userId: member.id,
        retreatId,
        requestId,
        retreatNumber,
        couple,
      })),
    ]);
    notifications.forEach((result, index) => {
      if (result.status === "rejected") console.error(`Falló la notificación ${index + 1}:`, result.reason);
    });
  }
);
