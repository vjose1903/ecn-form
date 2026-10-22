import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";

// Inicializar Firebase Admin solo si no existe ya
if (!admin.apps.length) {
  admin.initializeApp();
}

export {admin};

// La base nueva nunca debe resolverse por defecto: las funciones existentes
// siguen operando sobre (default) hasta que cada flujo nuevo se migre.
export const v2Db = getFirestore(admin.app(), "ecn-platform-v2");
