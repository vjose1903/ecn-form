import { AbstractControl, ValidationErrors } from '@angular/forms';
import { fun } from '@core/services/functions.service';

export class CedulaValidator {
  // Constantes para optimización
  private static readonly CEDULA_LENGTH = 11;
  private static readonly MULTIPLIERS = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  private static readonly DIGIT_VERIFIER_INDEX = 10;
  private static readonly CLEAN_REGEX = /[-\s]/g;
  private static readonly DIGITS_REGEX = /^\d{11}$/;

  /**
   * Custom validator for Dominican Republic cedula validation
   * @param control - The form control to validate
   * @returns ValidationErrors | null
   */
  static validate(control: AbstractControl): ValidationErrors | null {
    const cedula = control.value;

    // Early return si no hay valor
    if (!cedula || typeof cedula !== 'string') {
      return null;
    }

    // Limpiar y validar en un solo paso
    const cedulaLimpia = cedula.replace(CedulaValidator.CLEAN_REGEX, '');

    // Validación rápida de longitud y formato
    if (cedulaLimpia.length !== CedulaValidator.CEDULA_LENGTH || !CedulaValidator.DIGITS_REGEX.test(cedulaLimpia)) {
      return { invalidCedula: true };
    }

    return CedulaValidator.ValidaCedula(cedulaLimpia) ? null : { invalidCedula: true };
  }

  /**
   * Validates Dominican Republic cedula number using optimized algorithm
   * @param cedula - The cedula string to validate (must be 11 digits)
   * @returns boolean - true if valid, false otherwise
   */
  static ValidaCedula(cedula: string): boolean {
    try {
      let suma = 0;
      const digitoVerificador = parseInt(cedula.charAt(CedulaValidator.DIGIT_VERIFIER_INDEX));

      // Bucle optimizado con acceso directo a caracteres
      for (let i = 0; i < CedulaValidator.DIGIT_VERIFIER_INDEX; i++) {
        const digito = parseInt(cedula.charAt(i)) * CedulaValidator.MULTIPLIERS[i];
        suma += digito > 9 ? Math.floor(digito / 10) + (digito % 10) : digito;
      }
 
      const verificador = fun.roundDecenaMayor(suma) - suma;
      return verificador === digitoVerificador || (verificador === 10 && digitoVerificador === 0);
    } catch {
      return false;
    }
  }
}
