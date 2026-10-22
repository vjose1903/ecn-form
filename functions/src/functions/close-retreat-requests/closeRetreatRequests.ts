import {admin} from "../../core/firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {RetreatI} from "../../core/interfaces/retreat.interface";
import {toDateOnlyString} from "../../core/helpers/date";
import {getResendApiKey, resendApiKey, sendResendEmail} from "../../core/helpers/resend";
const ADMIN_EMAIL = "vjose1903@outlook.es";
const FROM_EMAIL = "ECN PLATFORM <no-reply@inspot-technology.com>";

// Función que se ejecuta diariamente a las 5:00 AM
export const closeRetreatRequestsDaily = onSchedule(
  {
    schedule: "0 5 * * *", // Cron expression: todos los días a las 5:00 AM
    timeZone: "America/Santo_Domingo", // Zona horaria de República Dominicana
    secrets: [resendApiKey],
  },
  async () => {
    console.log("Iniciando proceso de cierre de solicitudes de retiros...");

    const startTime = Date.now();
    const todayString = toDateOnlyString(new Date());

    try {
      const stats = await processAllRetreats(todayString);
      const executionTime = Date.now() - startTime;

      console.log(
        `Proceso completado en ${executionTime}ms. Retiros procesados: ${stats.processed}, Retiros cerrados: ${stats.closed}`
      );

      // Enviar correo con estadísticas
      await sendStatisticsEmail({...stats, executionDate: todayString, executionTime});
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("Error en el proceso de cierre de solicitudes:", error);

      // Enviar correo de error
      await sendErrorEmail({
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        executionDate: todayString,
        executionTime,
      });

      throw error;
    }
  }
);

// Función principal para procesar todos los retiros
const processAllRetreats = async (todayString: string) => {
  const usersSnapshot = await admin.firestore().collection("user").get();

  if (usersSnapshot.empty) {
    console.log("No se encontraron usuarios");
    return {processed: 0, closed: 0};
  }

  let totalProcessed = 0;
  let totalClosed = 0;

  // Procesar usuarios en lotes para mejor rendimiento
  const batchSize = 10;
  const userDocs = usersSnapshot.docs;

  for (let i = 0; i < userDocs.length; i += batchSize) {
    const batch = userDocs.slice(i, i + batchSize);
    const batchPromises = batch.map((userDoc) => processUserRetreats(userDoc.id, todayString));

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(({processed, closed}) => {
      totalProcessed += processed;
      totalClosed += closed;
    });
  }

  return {processed: totalProcessed, closed: totalClosed};
};

// Función para procesar retiros de un usuario específico
const processUserRetreats = async (userId: string, todayString: string) => {
  console.log(`Procesando usuario: ${userId}`);

  const retreatsSnapshot = await admin.firestore().collection("user").doc(userId).collection("retreat").get();

  if (retreatsSnapshot.empty) {
    console.log(`No se encontraron retiros para el usuario ${userId}`);
    return {processed: 0, closed: 0};
  }

  let userProcessed = 0;
  let userClosed = 0;

  // Procesar retiros en lotes para mejor rendimiento
  const retreatDocs = retreatsSnapshot.docs;
  const batchSize = 5;

  for (let i = 0; i < retreatDocs.length; i += batchSize) {
    const batch = retreatDocs.slice(i, i + batchSize);
    const batchPromises = batch.map((retreatDoc) => processRetreat(retreatDoc, userId, todayString));

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(({processed, closed}) => {
      userProcessed += processed;
      userClosed += closed;
    });
  }

  return {processed: userProcessed, closed: userClosed};
};

// Función para procesar un retiro individual
const processRetreat = async (retreatDoc: any, userId: string, todayString: string) => {
  const retreatId = retreatDoc.id;
  const retreatData = retreatDoc.data() as RetreatI;

  // Verificar si el retiro está activo y acepta solicitudes
  if (!retreatData.is_active || !retreatData.accept_requests) {
    console.log(`Retiro ${retreatId} del usuario ${userId} no está activo o no acepta solicitudes`);
    return {processed: 1, closed: 0};
  }

  // Convertir y comparar fechas
  const maxRequestDateString = toDateOnlyString(retreatData.max_request_date);

  console.log(
    `Retiro ${retreatId} del usuario ${userId}: max_request_date = ${maxRequestDateString}, today = ${todayString}`
  );

  // Comparar fechas (solo día, mes y año)
  if (maxRequestDateString === todayString) {
    console.log(`Cerrando solicitudes para retiro ${retreatId} del usuario ${userId}`);

    // Actualizar accept_requests a false
    await retreatDoc.ref.update({
      accept_requests: false,
    });

    console.log(`✅ Solicitudes cerradas para retiro ${retreatId} del usuario ${userId}`);
    return {processed: 1, closed: 1};
  }

  return {processed: 1, closed: 0};
};

// Función helper para convertir fechas a string
// Función para enviar correo con estadísticas
const sendStatisticsEmail = async (args: {
  processed: number;
  closed: number;
  executionDate: string;
  executionTime: number;
}) => {
  const {processed, closed, executionDate, executionTime} = args;

  const apiKey = getResendApiKey();
  if (!apiKey) return;

  const subject = "Reporte de Cierre de Solicitudes - Encuentro Católico para Novios";

  const html = `
    <div style="padding: 10px;">
      <p>Hola,</p>
      <p>Se ha completado el proceso automático de cierre de solicitudes de retiros.</p>
      <br>

      <!-- Información del reporte -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #a83044; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #a83044; margin: 0 0 15px 0; font-size: 18px;">Estadísticas del proceso:</h3>
        <div style="margin-bottom: 10px;">
          <strong>Fecha de ejecución:</strong> ${executionDate}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Tiempo de ejecución:</strong> ${executionTime}ms
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Total de retiros procesados:</strong> ${processed}
        </div>
        <div style="margin-bottom: 15px;">
          <strong>Total de retiros cerrados:</strong> ${closed}
        </div>
      </div>

      <p>Este proceso se ejecuta automáticamente todos los días a las 5:00 AM hora de República Dominicana.</p>
      <br>
      <p>Saludos cordiales,<br>Sistema Automático de Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({
    apiKey,
    to: ADMIN_EMAIL,
    subject,
    html,
    from: FROM_EMAIL,
    logLabel: "estadísticas",
    suppressError: true,
  });
};

// Función para enviar correo de error
const sendErrorEmail = async (args: {
  error: string;
  errorStack?: string;
  executionDate: string;
  executionTime: number;
}) => {
  const {error, errorStack, executionDate, executionTime} = args;

  const apiKey = getResendApiKey();
  if (!apiKey) return;

  const subject = "❌ Error en Cierre de Solicitudes - Encuentro Católico para Novios";

  const html = `
    <div style="padding: 10px;">
      <p>Hola,</p>
      <p>Ha ocurrido un error durante la ejecución del proceso automático de cierre de solicitudes de retiros.</p>
      <br>

      <!-- Información del error -->
      <div style="background-color: #fff3cd; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #dc3545; margin: 0 0 15px 0; font-size: 18px;">Detalles del error:</h3>
        <div style="margin-bottom: 10px;">
          <strong>Fecha de ejecución:</strong> ${executionDate}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Tiempo de ejecución:</strong> ${executionTime}ms
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Mensaje de error:</strong> ${error}
        </div>
        ${
          errorStack
            ? `
        <div style="margin-bottom: 15px;">
          <strong>Stack trace:</strong>
          <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 5px;">${errorStack}</pre>
        </div>
        `
            : ""
        }
      </div>

      <p>Este error ocurrió durante la ejecución automática diaria a las 5:00 AM hora de República Dominicana.</p>
      <br>
      <p>Por favor, revise los logs del sistema para más detalles.</p>
      <br>
      <p>Saludos cordiales,<br>Sistema Automático de Encuentro Católico para Novios</p>
    </div>
  `;

  await sendResendEmail({
    apiKey,
    to: ADMIN_EMAIL,
    subject,
    html,
    from: FROM_EMAIL,
    logLabel: "error",
    suppressError: true,
  });
};
