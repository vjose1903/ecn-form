export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

if (isEmulator) {
  void import("dotenv")
    .then((dotenv) => {
      dotenv.config();
    })
    .catch((error: unknown) => {
      console.error("Error cargando variables de entorno del emulador:", error);
    });
}
