import { AbstractControl, ValidationErrors } from '@angular/forms';

export class UrlValidator {
  // Regex más flexible para validar URLs - acepta protocolos incompletos
  private static readonly URL_REGEX = /^(https?:?\/?\/?)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

  /**
   * Custom validator for URL validation
   * @param control - The form control to validate
   * @returns ValidationErrors | null
   */
  static validate(control: AbstractControl): ValidationErrors | null {
    const url = control.value;

    // Early return si no hay valor
    if (!url || typeof url !== 'string') return null;

    // Validar URL con regex
    if (!UrlValidator.URL_REGEX.test(url)) {
      return { invalidUrl: true };
    }

    return null;
  }

  /**
   * Validates if a string is a valid URL
   * @param url - The URL string to validate
   * @returns boolean - true if valid, false otherwise
   */
  static isValidUrl(url: string): boolean {
    try {
      // Usar el constructor URL nativo para validación adicional
      new URL(url);
      return UrlValidator.URL_REGEX.test(url);
    } catch {
      return false;
    }
  }
}
