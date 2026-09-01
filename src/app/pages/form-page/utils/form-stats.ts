import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { FormGroupFields } from '../form-page.model';

export class FormStatsUtils {
  /**
   * Obtiene los campos faltantes de una sección específica
   * @param formGroup - El FormGroup principal
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @param datingPeriodError - Error específico del tiempo de noviazgo
   * @returns Array de nombres de campos faltantes
   */
  static getMissingFields(formGroup: FormGroup, section: FormGroupFields, datingPeriodError: boolean = false): string[] {
    const missingFields: string[] = [];

    if (section === FormGroupFields.general) {
      this.collectMissingFields(formGroup, missingFields, true);

      // Verificar error específico de tiempo de noviazgo
      if (datingPeriodError) {
        missingFields.push('Tiempo de noviazgo (debe ser mayor a 0)');
      }
    } else {
      const subGroup = formGroup.get(section);

      if (subGroup) {
        this.collectMissingFields(subGroup, missingFields, false, section);
      }
    }

    return missingFields;
  }

  /**
   * Obtiene los campos con errores de una sección específica
   * @param formGroup - El FormGroup principal
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @returns Array de nombres de campos con errores
   */
  static getInvalidFields(formGroup: FormGroup, section: FormGroupFields): string[] {
    const invalidFields: string[] = [];

    if (section === FormGroupFields.general) {
      this.collectInvalidFields(formGroup, invalidFields, true);
    } else {
      const subGroup = formGroup.get(section);

      if (subGroup) {
        this.collectInvalidFields(subGroup, invalidFields, false, section);
      }
    }

    return invalidFields;
  }

  /**
   * Recopila los campos faltantes (required) de un FormGroup
   */
  private static collectMissingFields(control: AbstractControl, missingFields: string[], rootLevelOnly: boolean = false, section?: FormGroupFields, parentPath: string = ''): void {
    if (control instanceof FormGroup) {
      Object.entries(control.controls).forEach(([controlName, childControl]) => {
        // Si es nivel raíz y encontramos un subgrupo, saltarlo
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) return;

        const currentPath = parentPath ? `${parentPath}.${controlName}` : controlName;
        this.collectMissingFields(childControl, missingFields, false, section, currentPath);
      });
      return;
    }

    if (control instanceof FormArray) {
      control.controls.forEach((childControl, index) => {
        const currentPath = `${parentPath}[${index}]`;
        this.collectMissingFields(childControl, missingFields, false, section, currentPath);
      });
      return;
    }

    // Para FormControl individual - verificar si es requerido y está vacío
    if (control.hasError('required') && !control.value) {
      const fieldLabel = this.getFieldLabel(parentPath, section);
      if (fieldLabel && !missingFields.includes(fieldLabel)) {
        missingFields.push(fieldLabel);
      }
    }
  }

  /**
   * Recopila los campos con errores (no required) de un FormGroup
   */
  private static collectInvalidFields(control: AbstractControl, invalidFields: string[], rootLevelOnly: boolean = false, section?: FormGroupFields, parentPath: string = ''): void {
    this.collectControlErrors(control, invalidFields, section, parentPath);

    if (control instanceof FormGroup) {
      Object.entries(control.controls).forEach(([controlName, childControl]) => {
        // Si es nivel raíz y encontramos un subgrupo, saltarlo
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) return;

        const currentPath = parentPath ? `${parentPath}.${controlName}` : controlName;
        this.collectInvalidFields(childControl, invalidFields, false, section, currentPath);
      });
      return;
    }

    if (control instanceof FormArray) {
      control.controls.forEach((childControl, index) => {
        const currentPath = `${parentPath}[${index}]`;
        this.collectInvalidFields(childControl, invalidFields, false, section, currentPath);
      });
      return;
    }
  }

  private static collectControlErrors(control: AbstractControl, invalidFields: string[], section?: FormGroupFields, parentPath: string = ''): void {
    if (control.errors) {
      const errorKeys = Object.keys(control.errors).filter(key => key !== 'required');
      if (errorKeys.length > 0) {
        const fieldLabel = this.getFieldLabel(parentPath, section);
        if (fieldLabel && !invalidFields.includes(fieldLabel)) {
          const errorMessages = errorKeys.map(key => this.getErrorMessage(key, control.errors![key]));
          invalidFields.push(`${fieldLabel}: ${errorMessages.join(', ')}`);
        }
      }
    }
  }

  /**
   * Obtiene la etiqueta legible de un campo basado en su path
   */
  private static getFieldLabel(fieldPath: string, section?: FormGroupFields): string {
    const fieldLabels: { [key: string]: string } = {
      retreat: 'Fecha de Retiro Deseada',
      dating_period_year: 'Años de noviazgo',
      dating_period_month: 'Meses de noviazgo',
      have_wedding_date: 'Tiene Fecha de Boda',
      wedding_date: 'Fecha de Boda',
      how_find_us: 'Como se enteraron del Retiro',
      how_find_us_other: 'Otro (Como se enteraron)',
      who_invited_you: 'Quien los invitó',
      who_invited_you_phone: 'Teléfono de quien los invitó',
      full_name: 'Nombres y Apellidos',
      nickname: 'Apodo',
      birth_date: 'Fecha de Nacimiento',
      identity_type: 'Tipo de Documento',
      identity_number: 'Número de Documento',
      are_you_married: 'Ha estado casado por la iglesia',
      have_children: 'Tiene hijos',
      address: 'Dirección actual',
      city_of_residence: 'Ciudad',
      email: 'Correo Electrónico',
      cell_phone: 'Teléfono celular',
      home_phone: 'Teléfono casa',
      work_phone: 'Teléfono trabajo',
      emergency_full_name: 'Contacto de emergencia - Nombres y Apellidos',
      emergency_phone: 'Contacto de emergencia - Teléfono',
      emergency_relationship: 'Contacto de emergencia - Parentesco',
      religion: 'Religión',
      religion_other: 'Otra religión',
      church_name: 'Parroquia',
      familiar_full_name: 'Familiar - Nombres y Apellidos',
      familiar_phone: 'Familiar - Teléfono',
      familiar_relationship: 'Familiar - Parentesco',
    };

    if (!fieldPath && (section === FormGroupFields.she || section === FormGroupFields.he)) {
      return 'Contactos familiares y emergencia';
    }

    // Limpiar el path para obtener el nombre del campo
    const cleanPath =
      fieldPath
        .replace(/\[\d+\]/, '')
        .split('.')
        .pop() || fieldPath;
    const label = fieldLabels[cleanPath] || cleanPath;

    return label;
  }

  /**
   * Obtiene el mensaje de error legible
   */
  private static getErrorMessage(errorKey: string, errorValue: any): string {
    const errorMessages: { [key: string]: string } = {
      email: 'Formato de email inválido',
      pattern: 'Formato inválido',
      minlength: `Mínimo ${errorValue?.requiredLength} caracteres`,
      maxlength: `Máximo ${errorValue?.requiredLength} caracteres`,
      min: `Valor mínimo ${errorValue?.min}`,
      max: `Valor máximo ${errorValue?.max}`,
      cedula: 'Cédula inválida',
      url: 'URL inválida',
      previousRequestExists: 'Ya existe una solicitud previa',
      invalidCedula: 'Cédula inválida',
      invalidPhone: 'Teléfono inválido',
      invalidCity: 'Ciudad inválida',
      invalidReligion: 'Religión inválida',
      invalidName: 'Solo letras y espacios',
      invalidDate: 'Fecha inválida',
      futureDate: 'La fecha no puede ser futura',
      pastDate: 'La fecha no puede ser pasada',
      invalidAgeRange: `Edad entre ${errorValue?.min ?? 14} y ${errorValue?.max ?? 100} años`,
      minLetters: `Debe tener más de ${(errorValue?.min ?? 3) - 1} letras`,
      missingCloseFamilyContact: 'Debe incluir al menos un familiar cercano',
      duplicatedEmergencyFamilyContact: 'Contacto repetido entre familiares y emergencia',
      retreatParticipantPhone: 'Teléfono de persona inscrita en este retiro',
    };

    return errorMessages[errorKey] || `error: ${errorKey}`;
  }
}
