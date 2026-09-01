import { AbstractControl, ValidationErrors } from '@angular/forms';

export class PhoneValidator {
  private static readonly PHONE_LENGTH = 10;
  private static readonly CLEAN_REGEX = /\D/g;
  private static readonly SEQUENTIAL_VALUES = new Set(['0123456789', '1234567890', '9876543210']);

  static validate(control: AbstractControl): ValidationErrors | null {
    const phone = control.value;

    if (!phone || typeof phone !== 'string') return null;

    const digits = phone.replace(PhoneValidator.CLEAN_REGEX, '');

    if (digits.length !== PhoneValidator.PHONE_LENGTH || PhoneValidator.isInvalidPattern(digits)) {
      return { invalidPhone: true };
    }

    return null;
  }

  static isValid(phone: string): boolean {
    const digits = phone.replace(PhoneValidator.CLEAN_REGEX, '');
    return digits.length === PhoneValidator.PHONE_LENGTH && !PhoneValidator.isInvalidPattern(digits);
  }

  private static isInvalidPattern(digits: string): boolean {
    const areaCode = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const lineNumber = digits.slice(6);
    const subscriberNumber = digits.slice(3);

    return (
      PhoneValidator.hasRepeatedDigits(digits) ||
      PhoneValidator.hasRepeatedDigits(areaCode) ||
      PhoneValidator.hasRepeatedDigits(prefix) ||
      PhoneValidator.hasRepeatedDigits(lineNumber) ||
      PhoneValidator.hasRepeatedDigits(subscriberNumber) ||
      areaCode.startsWith('0') ||
      areaCode.startsWith('1') ||
      prefix.startsWith('0') ||
      prefix.startsWith('1') ||
      PhoneValidator.SEQUENTIAL_VALUES.has(digits)
    );
  }

  private static hasRepeatedDigits(value: string): boolean {
    return /^(\d)\1+$/.test(value);
  }
}
