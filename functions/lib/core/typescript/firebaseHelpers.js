"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRetreatInfo = exports.getAdminInfo = exports.convertFirestoreTimestamp = void 0;
const firebase_admin_1 = require("../firebase-admin");
// Función helper para convertir Timestamps de Firestore a Date
const convertFirestoreTimestamp = (timestamp) => {
    if (!timestamp)
        return new Date();
    if (timestamp instanceof Date)
        return timestamp;
    // Si es un timestamp de Firestore con seconds y nanoseconds
    if (typeof timestamp === "object" && "seconds" in timestamp && "nanoseconds" in timestamp) {
        return new Date(timestamp.seconds * 1000);
    }
    // Si es un timestamp de Firestore con _seconds (formato antiguo)
    if (typeof timestamp === "object" && "_seconds" in timestamp) {
        return new Date(timestamp._seconds * 1000);
    }
    // Si es un string o número, intentar convertirlo
    try {
        return new Date(timestamp);
    }
    catch (err) {
        console.warn("No se pudo convertir el timestamp:", timestamp);
        return new Date();
    }
};
exports.convertFirestoreTimestamp = convertFirestoreTimestamp;
// Función helper para obtener información del usuario admin
const getAdminInfo = async (userRefPath) => {
    try {
        const snapshot = await firebase_admin_1.admin.firestore().doc(userRefPath).get();
        if (!snapshot.exists) {
            console.warn("El usuario admin no existe");
            return null;
        }
        return snapshot.data();
    }
    catch (err) {
        console.error("Error obteniendo información del usuario admin:", err);
        return null;
    }
};
exports.getAdminInfo = getAdminInfo;
// Función helper para obtener información del retiro
const getRetreatInfo = async (retreatRefPath) => {
    try {
        const snapshot = await firebase_admin_1.admin.firestore().doc(retreatRefPath).get();
        if (!snapshot.exists) {
            console.warn("El retiro no existe");
            return null;
        }
        const data = snapshot.data();
        // Convertir Timestamps de Firestore a Date
        const startDate = (0, exports.convertFirestoreTimestamp)(data.start_date);
        const endDate = (0, exports.convertFirestoreTimestamp)(data.end_date);
        const maxRequestDate = (0, exports.convertFirestoreTimestamp)(data.max_request_date);
        return { ...data, start_date: startDate, end_date: endDate, max_request_date: maxRequestDate };
    }
    catch (err) {
        console.error("Error obteniendo información del retiro:", err);
        return null;
    }
};
exports.getRetreatInfo = getRetreatInfo;
//# sourceMappingURL=firebaseHelpers.js.map