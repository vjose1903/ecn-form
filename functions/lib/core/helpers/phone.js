"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPhone = void 0;
// Keep the same validation as the form's PhoneValidator.
const isValidPhone = (phone) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10 || ["0123456789", "1234567890", "9876543210"].includes(digits))
        return false;
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    return ![digits, area, prefix, digits.slice(6), digits.slice(3)].some(value => /^(\d)\1+$/.test(value))
        && !/^[01]/.test(area) && !/^[01]/.test(prefix);
};
exports.isValidPhone = isValidPhone;
//# sourceMappingURL=phone.js.map