import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue} from "firebase-admin/firestore";
import {v2Db} from "../../core/firebase-admin";
import {getResendApiKey, resendApiKey, sendResendEmail} from "../../core/helpers/resend";
import {processEmails} from "../../core/helpers/request";

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getRequestMailContext = async (cityId: string, requestId: string) => {
  const requestRef = v2Db.doc(`city/${cityId}/requests/${requestId}`);
  const [root, basic, contact] = await Promise.all([
    requestRef.get(),
    requestRef.collection("details").doc("couple_basic").get(),
    requestRef.collection("details").doc("contact").get(),
  ]);
  if (!root.exists || typeof root.get("migration_actor_uid") === "string") return null;
  const coupleBasic = basic.data() ?? {};
  const coupleContact = contact.data() ?? {};
  const she = {...(coupleBasic.she ?? {}), ...(coupleContact.she ?? {})};
  const he = {...(coupleBasic.he ?? {}), ...(coupleContact.he ?? {})};
  const retreatId = String(root.get("retreat_id") ?? "");
  const retreat = retreatId ? await v2Db.doc(`city/${cityId}/retreat/${retreatId}`).get() : null;
  return {
    root,
    she,
    he,
    emails: processEmails(she, he),
    retreatNumber: retreat?.get("number") ?? retreatId.split("_")[0] ?? "desconocido",
  };
};

export const onRequestStatusUpdateV2 = onDocumentUpdated(
  {database: "ecn-platform-v2", document: "city/{cityId}/requests/{requestId}/details/status", secrets: [resendApiKey]},
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status || !["accepted", "rejected"].includes(String(after.status))) return;

    const {cityId, requestId} = event.params;
    const context = await getRequestMailContext(cityId, requestId);
    if (!context?.emails.length) return;
    const apiKey = getResendApiKey();
    if (!apiKey) return;

    const accepted = after.status === "accepted";
    const names = [context.she.full_name, context.he.full_name].filter(Boolean).map(escapeHtml).join(" y ");
    const subject = accepted ? "¡Solicitud aceptada! - Encuentro Católico para Novios" : "Información sobre su solicitud - Encuentro Católico para Novios";
    const message = accepted
      ? `Su solicitud para el retiro #${escapeHtml(context.retreatNumber)} ha sido aceptada.`
      : `Su solicitud para el retiro #${escapeHtml(context.retreatNumber)} no pudo ser aceptada en esta ocasión.`;
    try {
      await sendResendEmail({
        apiKey,
        to: context.emails,
        subject,
        html: `<div style="padding:16px;font-family:Arial,sans-serif"><p>Hola ${names},</p><p>${message}</p><p>Encuentro Católico para Novios</p></div>`,
      });
    } catch (error) {
      console.error("No se pudo notificar el cambio de estado de la solicitud", error);
    }
  }
);

export const onRequestUpdatedNotificationV2 = onDocumentCreated(
  {database: "ecn-platform-v2", document: "city/{cityId}/requests/{requestId}/history/{eventId}", secrets: [resendApiKey]},
  async event => {
    const history = event.data?.data();
    if (history?.action !== "updated") return;
    const changes = Array.isArray(history.changes) ? history.changes as Array<{label?: string; next_value?: string}> : [];
    if (!changes.length || changes.some(change => change.label?.endsWith(".status"))) return;
    const context = await getRequestMailContext(event.params.cityId, event.params.requestId);
    if (!context?.emails.length) return;
    const apiKey = getResendApiKey();
    if (!apiKey) return;

    const lines = changes.map(change => `<li>${escapeHtml(change.label ?? "Campo actualizado")}: ${escapeHtml(change.next_value)}</li>`).join("");
    const names = [context.she.full_name, context.he.full_name].filter(Boolean).map(escapeHtml).join(" y ");
    try {
      await sendResendEmail({
        apiKey,
        to: context.emails,
        subject: "Su solicitud ha sido actualizada",
        html: `<div style="padding:16px;font-family:Arial,sans-serif"><p>Hola ${names},</p><p>La solicitud para el retiro #${escapeHtml(context.retreatNumber)} fue actualizada:</p><ul>${lines}</ul><p>Encuentro Católico para Novios</p></div>`,
      });
    } catch (error) {
      console.error("No se pudo notificar la actualización de la solicitud", error);
    }
  }
);

const dateInSantoDomingo = (value: unknown): string => {
  const date = value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? value.toDate()
    : value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit"}).format(date);
};

export const closeRetreatRequestsDailyV2 = onSchedule(
  {schedule: "0 5 * * *", timeZone: "America/Santo_Domingo"},
  async () => {
    const today = dateInSantoDomingo(new Date());
    const retreats = await v2Db.collectionGroup("retreat").get();
    const dueRetreats = retreats.docs.filter(doc =>
      doc.get("is_active") === true && doc.get("accept_requests") === true && dateInSantoDomingo(doc.get("max_request_date")) === today
    );
    for (const retreat of dueRetreats) {
      await retreat.ref.update({accept_requests: false, updated_at: FieldValue.serverTimestamp()});
    }
    console.log(JSON.stringify({action: "daily_retreat_request_closure", date: today, processed: retreats.size, closed: dueRetreats.length}));
  }
);
