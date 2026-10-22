import {admin} from "../firebase-admin";
import {UserI} from "../interfaces/user.interface";
import {RetreatI} from "../interfaces/retreat.interface";

// Función helper para convertir Timestamps de Firestore a Date
export const convertFirestoreTimestamp = (timestamp: any): Date => {
  if (!timestamp) return new Date();

  if (timestamp instanceof Date) return timestamp;

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
  } catch (err) {
    console.warn("No se pudo convertir el timestamp:", timestamp);
    return new Date();
  }
};

// Función helper para obtener información del usuario admin
export const getAdminInfo = async (userRefPath: string): Promise<UserI | null> => {
  try {
    const snapshot = await admin.firestore().doc(userRefPath).get();

    if (!snapshot.exists) {
      console.warn("El usuario admin no existe");
      return null;
    }

    return snapshot.data() as UserI;
  } catch (err) {
    console.error("Error obteniendo información del usuario admin:", err);
    return null;
  }
};

// Función helper para obtener información del retiro
export const getRetreatInfo = async (retreatRefPath: string): Promise<RetreatI | null> => {
  try {
    const snapshot = await admin.firestore().doc(retreatRefPath).get();

    if (!snapshot.exists) {
      console.warn("El retiro no existe");
      return null;
    }

    const data = snapshot.data() as RetreatI;

    // Convertir Timestamps de Firestore a Date
    const startDate = convertFirestoreTimestamp(data.start_date);
    const endDate = convertFirestoreTimestamp(data.end_date);
    const maxRequestDate = convertFirestoreTimestamp(data.max_request_date);

    return {...data, start_date: startDate, end_date: endDate, max_request_date: maxRequestDate};
  } catch (err) {
    console.error("Error obteniendo información del retiro:", err);
    return null;
  }
};
