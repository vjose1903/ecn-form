import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";

// Inicializar Firebase Admin solo si no existe ya
if (!admin.apps.length) {
  admin.initializeApp();
}

export {admin};

// La aplicación opera únicamente sobre la base de datos v2.
export const v2Db = getFirestore(admin.app(), "ecn-platform-v2");
