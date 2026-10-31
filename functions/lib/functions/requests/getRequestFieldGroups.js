"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestFieldGroups = void 0;
const https_1 = require("firebase-functions/v2/https");
const authorization_1 = require("../../core/security/authorization");
const firebase_admin_1 = require("../../core/firebase-admin");
const statusFields = ["status", "action", "is_active", "created_at", "archived_at", "archived_retreat_id"];
const dashboardFields = {
    contact: ["city_of_residence"],
    identity: ["age", "religion", "religion_other", "are_you_married"],
    family: ["have_children"],
    relationship: ["how_find_us", "how_find_us_other", "have_wedding_date", "dating_period_year"],
    invitation: ["who_invited_you"],
};
const requestDetailSections = ["couple_basic", "contact", "identity", "family", "relationship", "invitation", "legacy_extra"];
exports.getRequestFieldGroups = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const cityId = typeof data.cityId === "string" ? data.cityId.trim() : "";
    const includeDashboardDetails = data.includeDashboardDetails === true;
    const includeRequestDetails = data.includeRequestDetails === true;
    const requestIds = Array.isArray(data.requestIds) ? [...new Set(data.requestIds.filter((id) => typeof id === "string" && /^[^/]{1,180}$/.test(id)))] : [];
    if (!cityId || requestIds.length > 200)
        throw new https_1.HttpsError("invalid-argument", "La ciudad o lista de solicitudes no es válida.");
    (0, authorization_1.requireAuthenticated)(request);
    let requestPermissions = {};
    if (!(0, authorization_1.isSuperAdmin)(request)) {
        const member = await firebase_admin_1.v2Db.doc(`city/${cityId}/members/${request.auth.uid}`).get();
        if (!member.exists || member.get("status") !== "active") {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
        const roleId = member.get("role_id");
        if (typeof roleId !== "string" || !roleId)
            throw new https_1.HttpsError("permission-denied", "No tienes un rol activo en esta ciudad.");
        const role = await firebase_admin_1.v2Db.doc(`city/${cityId}/roles/${roleId}`).get();
        if (!role.exists || role.get("is_active") !== true) {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
        const permissions = role.get("permissions");
        requestPermissions = permissions?.requests ?? {};
        if (requestPermissions.list !== true && requestPermissions.read !== true) {
            throw new https_1.HttpsError("permission-denied", "No tienes acceso a las solicitudes de esta ciudad.");
        }
    }
    const canReadStatus = (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.status?.read === true);
    const canReadInformed = (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.informed?.read === true);
    const canReadPayments = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.payments?.read === true;
    const canUpdateRequests = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.update === true;
    const canUpdateStatus = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.fields?.status?.update === true;
    const canUpdateInformed = (0, authorization_1.isSuperAdmin)(request) || requestPermissions.fields?.informed?.update === true;
    const readableDashboardSections = Object.keys(dashboardFields).filter(section => (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.[section]?.read === true));
    const readableRequestDetailSections = requestDetailSections.filter(section => (0, authorization_1.isSuperAdmin)(request) || (requestPermissions.read === true && requestPermissions.fields?.[section]?.read === true));
    const editableRequestSections = requestDetailSections.filter(section => (0, authorization_1.isSuperAdmin)(request) || (canUpdateRequests && requestPermissions.fields?.[section]?.update === true));
    const readableSections = [
        ...(canReadStatus ? ["status"] : []),
        ...(canReadInformed ? ["informed"] : []),
    ];
    const editableSections = [
        ...editableRequestSections,
        ...(canUpdateRequests && canUpdateStatus ? ["status"] : []),
        ...(canUpdateRequests && canUpdateInformed ? ["informed"] : []),
    ];
    const statusRefs = canReadStatus || canReadInformed
        ? requestIds.map(id => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${id}/details/status`))
        : [];
    const paymentsSummaryRefs = canReadPayments ? requestIds.map(id => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${id}/details/payments_summary`)) : [];
    const informedRefs = canReadInformed
        ? requestIds.map(id => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${id}/details/informed`))
        : [];
    const dashboardRefs = includeDashboardDetails
        ? readableDashboardSections.flatMap(section => requestIds.map(id => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${id}/details/${section}`)))
        : [];
    const requestDetailRefs = includeRequestDetails
        ? readableRequestDetailSections.flatMap(section => requestIds.map(id => firebase_admin_1.v2Db.doc(`city/${cityId}/requests/${id}/details/${section}`)))
        : [];
    const snapshots = statusRefs.length + informedRefs.length + paymentsSummaryRefs.length + dashboardRefs.length + requestDetailRefs.length
        ? await firebase_admin_1.v2Db.getAll(...statusRefs, ...informedRefs, ...paymentsSummaryRefs, ...dashboardRefs, ...requestDetailRefs)
        : [];
    const statusSnapshots = snapshots.slice(0, statusRefs.length);
    const informedSnapshots = snapshots.slice(statusRefs.length, statusRefs.length + informedRefs.length);
    const paymentsSummarySnapshots = snapshots.slice(statusRefs.length + informedRefs.length, statusRefs.length + informedRefs.length + paymentsSummaryRefs.length);
    const dashboardStart = statusRefs.length + informedRefs.length + paymentsSummaryRefs.length;
    const dashboardSnapshots = readableDashboardSections.map((_, sectionIndex) => snapshots.slice(dashboardStart + sectionIndex * requestIds.length, dashboardStart + (sectionIndex + 1) * requestIds.length));
    const requestDetailStart = dashboardStart + dashboardRefs.length;
    const requestDetailSnapshots = readableRequestDetailSections.map((_, sectionIndex) => snapshots.slice(requestDetailStart + sectionIndex * requestIds.length, requestDetailStart + (sectionIndex + 1) * requestIds.length));
    return Object.fromEntries(requestIds.map((requestId, index) => {
        const result = { readableSections, editableSections };
        if (includeDashboardDetails || includeRequestDetails) {
            const details = {};
            if (includeRequestDetails) {
                readableRequestDetailSections.forEach((section, sectionIndex) => {
                    const snapshot = requestDetailSnapshots[sectionIndex]?.[index];
                    if (snapshot?.exists)
                        details[section] = snapshot.data();
                });
            }
            else {
                readableDashboardSections.forEach((section, sectionIndex) => {
                    const snapshot = dashboardSnapshots[sectionIndex]?.[index];
                    if (!snapshot?.exists)
                        return;
                    const source = snapshot.data() ?? {};
                    const fields = dashboardFields[section];
                    if (["contact", "identity", "family"].includes(section)) {
                        const people = Object.fromEntries(["she", "he"].flatMap(person => {
                            const personData = source[person];
                            if (!personData || typeof personData !== "object")
                                return [];
                            const picked = Object.fromEntries(fields.filter(field => field in personData).map(field => [field, personData[field]]));
                            return Object.keys(picked).length ? [[person, picked]] : [];
                        }));
                        if (Object.keys(people).length)
                            details[section] = people;
                    }
                    else {
                        details[section] = Object.fromEntries(fields.filter(field => field in source).map(field => [field, source[field]]));
                    }
                });
            }
            result.details = details;
            result.readableSections = [...readableSections, ...Object.keys(details)];
        }
        const statusSnapshot = statusSnapshots[index];
        if (canReadStatus && statusSnapshot) {
            result.status = Object.fromEntries(statusFields
                .filter(field => statusSnapshot.get(field) !== undefined)
                .map(field => [field, statusSnapshot.get(field)]));
        }
        if (canReadPayments && paymentsSummarySnapshots[index]?.exists)
            result.payments_summary = paymentsSummarySnapshots[index].data();
        if (canReadInformed && statusSnapshot) {
            const informedSnapshot = informedSnapshots[index];
            result.is_informado = informedSnapshot?.exists
                ? informedSnapshot.get("is_informado") === true
                : statusSnapshot.get("is_informado") === true;
        }
        return [requestId, result];
    }));
});
//# sourceMappingURL=getRequestFieldGroups.js.map