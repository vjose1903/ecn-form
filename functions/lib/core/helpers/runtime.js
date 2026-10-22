"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmulator = void 0;
exports.isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
if (exports.isEmulator) {
    void import("dotenv")
        .then((dotenv) => {
        dotenv.config();
    })
        .catch((error) => {
        console.error("Error cargando variables de entorno del emulador:", error);
    });
}
//# sourceMappingURL=runtime.js.map