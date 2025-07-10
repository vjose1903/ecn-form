import { AbstractControl, ValidationErrors } from '@angular/forms';
import { Signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { FormControlName } from 'app/pages/form-page/form-page.model';

// Tipo que mapea FormControlName a las propiedades válidas de CoupleI
type CoupleFieldName =
  | 'full_name'
  | 'nickname'
  | 'birth_date'
  | 'identity_type'
  | 'identity_number'
  | 'are_you_married'
  | 'have_children'
  | 'city_of_residence'
  | 'address'
  | 'email'
  | 'cell_phone'
  | 'home_phone'
  | 'work_phone'
  | 'familiar_full_name'
  | 'familiar_phone'
  | 'familiar_relationship'
  | 'emergency_full_name'
  | 'emergency_phone'
  | 'emergency_relationship'
  | 'religion'
  | 'church_name';

export class PreviousRequestValidator {
  /**
   * Valida que no exista una solicitud anterior con el mismo valor en la propiedad especificada
   * @param previousRequests - Array con las solicitudes anteriores
   * @param fieldName - Nombre del campo a validar (ej: 'email', 'identity_number', etc.)
   * @returns Función validadora
   */
  static validate(previousRequests: RequestClass[], fieldName: FormControlName) {
    return (control: AbstractControl): ValidationErrors | null => {
      const currentValue = control.value;

      // Si no hay valor, no hay error (el required se maneja por separado)
      if (!currentValue) return null;

      // Si no hay solicitudes anteriores, no hay conflicto
      if (!previousRequests || previousRequests.length === 0) return null;

      // Verificar que el campo sea válido para CoupleI
      if (!this.isValidCoupleField(fieldName)) return null;

      // Buscar en todas las solicitudes anteriores
      const hasConflict = previousRequests.some(request => {
        // Buscar en el grupo 'she'
        if (request.she && request.she[fieldName as CoupleFieldName] === currentValue) return true;

        // Buscar en el grupo 'he'
        if (request.he && request.he[fieldName as CoupleFieldName] === currentValue) return true;

        return false;
      });

      if (hasConflict) {
        return {
          previousRequestExists: {
            value: currentValue,
            message: `Ya existe una solicitud con este ${this.getFieldDisplayName(fieldName)}`,
          },
        };
      }

      return null;
    };
  }

  /**
   * Verifica si el campo es válido para CoupleI
   * @param fieldName - Nombre del campo a verificar
   * @returns true si es un campo válido de CoupleI
   */
  private static isValidCoupleField(fieldName: FormControlName): boolean {
    const coupleFields: CoupleFieldName[] = [
      'full_name',
      'nickname',
      'birth_date',
      'identity_type',
      'identity_number',
      'are_you_married',
      'have_children',
      'city_of_residence',
      'address',
      'email',
      'cell_phone',
      'home_phone',
      'work_phone',
      'familiar_full_name',
      'familiar_phone',
      'familiar_relationship',
      'emergency_full_name',
      'emergency_phone',
      'emergency_relationship',
      'religion',
      'church_name',
    ];

    return coupleFields.includes(fieldName as CoupleFieldName);
  }

  /**
   * Obtiene el nombre de visualización del campo para el mensaje de error
   * @param fieldName - Nombre del campo
   * @returns Nombre de visualización
   */
  private static getFieldDisplayName(fieldName: FormControlName): string {
    const fieldNames: Record<FormControlName, string> = {
      [FormControlName.id]: 'ID',
      [FormControlName.is_active]: 'Estado activo',
      [FormControlName.retreat]: 'Retiro',
      [FormControlName.dating_period_month]: 'Período de noviazgo',
      [FormControlName.dating_period_year]: 'Período de noviazgo',
      [FormControlName.have_wedding_date]: 'Fecha de boda',
      [FormControlName.wedding_date]: 'Fecha de boda',
      [FormControlName.how_find_us]: 'Cómo nos encontró',
      [FormControlName.how_find_us_other]: 'Otro método de contacto',
      [FormControlName.who_invited_you]: 'Quién lo invitó',
      [FormControlName.who_invited_you_phone]: 'Teléfono de quien lo invitó',
      [FormControlName.full_name]: 'Nombre completo',
      [FormControlName.nickname]: 'Apodo',
      [FormControlName.birth_date]: 'Fecha de nacimiento',
      [FormControlName.identity_type]: 'Tipo de identificación',
      [FormControlName.identity_number]: 'Número de identificación',
      [FormControlName.are_you_married]: 'Estado civil',
      [FormControlName.have_children]: 'Tiene hijos',
      [FormControlName.city_of_residence]: 'Ciudad de residencia',
      [FormControlName.address]: 'Dirección',
      [FormControlName.email]: 'Correo electrónico',
      [FormControlName.cell_phone]: 'Teléfono celular',
      [FormControlName.home_phone]: 'Teléfono de casa',
      [FormControlName.work_phone]: 'Teléfono del trabajo',
      [FormControlName.family_information]: 'Información familiar',
      [FormControlName.familiar_full_name]: 'Nombre del acompañante',
      [FormControlName.familiar_phone]: 'Teléfono del acompañante',
      [FormControlName.familiar_relationship]: 'Relación con el acompañante',
      [FormControlName.emergency_full_name]: 'Nombre de contacto de emergencia',
      [FormControlName.emergency_phone]: 'Teléfono de emergencia',
      [FormControlName.emergency_relationship]: 'Relación con contacto de emergencia',
      [FormControlName.religion]: 'Religión',
      [FormControlName.church_name]: 'Nombre de la iglesia',
      [FormControlName.status]: 'Estado de la solicitud',
    };

    return fieldNames[fieldName] || fieldName;
  }
}
