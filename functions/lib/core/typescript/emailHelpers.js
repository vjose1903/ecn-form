"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmailHeader = exports.getCityInfo = exports.EMAIL_CONSTANTS = void 0;
// Constantes para emails
exports.EMAIL_CONSTANTS = {
    ECN_LOGO_URL: "https://firebasestorage.googleapis.com/v0/b/ecn-platform.firebasestorage.app/o/images%2Flogo-ecn-icon.png?alt=media&token=37c230b2-9570-4d2f-99b7-65905a554bcf",
    FROM_EMAIL: "Encuentro Católico Para Novios <no-reply@inspot-technology.com>",
    FROM_EMAIL_ADMIN: "ECN Platform <no-reply@inspot-technology.com>",
    BRAND_COLOR: "#a83044",
    SECONDARY_COLOR: "#007bff",
};
// Función helper para obtener información de la ciudad
const getCityInfo = async (cityRef) => {
    if (typeof cityRef === "string") {
        return null;
    }
    // Si ya es un objeto CityI (no una referencia)
    if (typeof cityRef === "object" && "key" in cityRef && "label" in cityRef) {
        return cityRef;
    }
    try {
        const citySnapshot = await cityRef.get();
        if (!citySnapshot.exists) {
            console.warn("La ciudad no existe");
            return null;
        }
        return citySnapshot.data();
    }
    catch (err) {
        console.error("Error obteniendo información de la ciudad:", err);
        return null;
    }
};
exports.getCityInfo = getCityInfo;
// Función helper para generar el header HTML común
const generateEmailHeader = async (userInfo) => {
    let cityInfo = null;
    if (userInfo && userInfo.city) {
        cityInfo = await (0, exports.getCityInfo)(userInfo?.city);
    }
    return `
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${exports.EMAIL_CONSTANTS.BRAND_COLOR};">
    <tr>
      <td style="padding: 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="50" valign="middle" style="padding-right: 10px;">
              <img src="${exports.EMAIL_CONSTANTS.ECN_LOGO_URL}" alt="ECN Logo" width="50" height="50" style="display: block; border: 0;">
            </td>
            <td valign="middle">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <h1 style="color: white; margin: 0; font-size: 17px; font-family: Arial, sans-serif; line-height: 1.2;">Encuentro Católico para Novios</h1>
                  </td>
                </tr>
                ${cityInfo
        ? `
                <tr>
                  <td style="padding-top: 2px;">
                    <small style="color: #ffffffb3; margin: 0; font-size: 13px; font-family: Arial, sans-serif; line-height: 1.2;">${cityInfo.large_label}</small>
                  </td>
                </tr>
                `
        : ""}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;
};
exports.generateEmailHeader = generateEmailHeader;
//# sourceMappingURL=emailHelpers.js.map