import { Component, inject, Input, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';
import { ButtonModule } from 'primeng/button';

import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerLine } from '../../core/components/divider-line/divider-line';
import { DeviceDetectorService } from '../../core/services/device-detector.service';
import { DeviceE } from '../../core/models/device-detector.model';
import { Affirmation, FormControlName, FormFieldId, FormGroupFields, IdentityType } from './form-page.model';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { CedulaValidator } from '@core/typescript/validate-cedula';
import { yesNoOptions } from '@core/typescript/constants';

@Component({
  selector: 'app-form-page',
  imports: [AccordionModule, InputTextModule, FormsModule, ReactiveFormsModule, SelectModule, DatePickerModule, TextareaModule, InputMaskModule, SelectButtonModule, DividerLine, ButtonModule, NgTemplateOutlet, FormErrorMsgComponent],
  templateUrl: './form-page.html',
  styleUrl: './form-page.scss',
})
export class FormPage implements OnInit {
  @Input() city: string = '';

  deviceDetectorService = inject(DeviceDetectorService);
  fb = inject(FormBuilder);

  FormControlName = FormControlName;
  FormFieldId = FormFieldId;
  FormGroupFields = FormGroupFields;
  IdentityType = IdentityType;
  Affirmation = Affirmation;

  openedAccordionPanel: number[] = [0, 1, 2];

  formGroup = this.fb.group({
    [FormControlName.city]: [this.city],
    [FormControlName.date_request]: ['', Validators.required],
    [FormControlName.dating_period]: ['', Validators.required],
    [FormControlName.have_wedding_date]: [null, Validators.required],
    [FormControlName.wedding_date]: [null],
    [FormControlName.how_find_us]: ['', Validators.required],
    [FormControlName.how_find_us_other]: ['', Validators.required],
    [FormControlName.who_invited_you]: ['', Validators.required],

    [FormGroupFields.she]: this.fb.group({
      [FormControlName.full_name]: ['', Validators.required],
      [FormControlName.nickname]: [''],
      [FormControlName.birth_date]: ['', Validators.required],
      [FormControlName.identity_type]: [IdentityType.cedula, Validators.required],
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', Validators.required],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email])],
      [FormControlName.cell_phone]: ['', Validators.required],
      [FormControlName.home_phone]: [''],
      [FormControlName.work_phone]: [''],
      [FormControlName.live_accompanied]: [null, Validators.required],
      [FormControlName.companion_full_name]: ['', Validators.required],
      [FormControlName.companion_phone]: ['', Validators.required],
      [FormControlName.companion_relationship]: ['', Validators.required],
      [FormControlName.emergency_full_name]: ['', Validators.required],
      [FormControlName.emergency_phone]: ['', Validators.required],
      [FormControlName.emergency_relationship]: ['', Validators.required],
      [FormControlName.religion]: ['', Validators.required],
      [FormControlName.church_name]: ['', Validators.required],
    }),
    [FormGroupFields.he]: this.fb.group({
      [FormControlName.full_name]: ['', Validators.required],
      [FormControlName.nickname]: [''],
      [FormControlName.birth_date]: ['', Validators.required],
      [FormControlName.identity_type]: [IdentityType.cedula, Validators.required],
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', Validators.required],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email])],
      [FormControlName.cell_phone]: ['', Validators.required],
      [FormControlName.home_phone]: [''],
      [FormControlName.work_phone]: [''],
      [FormControlName.live_accompanied]: [null, Validators.required],
      [FormControlName.companion_full_name]: ['', Validators.required],
      [FormControlName.companion_phone]: ['', Validators.required],
      [FormControlName.companion_relationship]: ['', Validators.required],
      [FormControlName.emergency_full_name]: ['', Validators.required],
      [FormControlName.emergency_phone]: ['', Validators.required],
      [FormControlName.emergency_relationship]: ['', Validators.required],
      [FormControlName.religion]: ['', Validators.required],
      [FormControlName.church_name]: ['', Validators.required],
    }),
  });

  dates = [{ label: '31 de Octubre al 02 de Noviembre 2025' }];

  timeRanges = [{ label: '0 a 6 meses' }, { label: '6 a 12 meses' }, { label: '1 a 4 años' }, { label: '4 a 6 años' }, { label: '6 a 8 años' }, { label: '8 a 10 años' }, { label: 'mas de 10 años' }];

  howToKnow = [{ label: 'Redes' }, { label: 'Amigos' }, { label: 'Familia' }, { label: 'Otro' }];

  identityTypes = [{ label: 'Cédula' }, { label: 'Pasaporte' }];

  yesNoOptions = yesNoOptions;

  companionOptions = [
    { label: 'Padre' },
    { label: 'Madre' },
    { label: 'Hermano' },
    { label: 'Hermana' },
    { label: 'Tio' },
    { label: 'Tia' },
    { label: 'Abuelo' },
    { label: 'Abuela' },
    { label: 'Novio' },
    { label: 'Novia' },
    { label: 'Esposo' },
    { label: 'Esposa' },
    { label: 'Hijo' },
    { label: 'Hija' },
    { label: 'Amigo' },
  ];

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  get sheGroup() {
    return this.formGroup?.get(FormGroupFields.she) as FormGroup;
  }

  get heGroup() {
    return this.formGroup?.get(FormGroupFields.he) as FormGroup;
  }

  ngOnInit(): void {
    this.subscribeToFormChanges();
  }

  subscribeToFormChanges() {
    // Suscripción específica para wedding_date
    this.formGroup.get(FormControlName.have_wedding_date)?.valueChanges.subscribe(haveWeddingDate => {
      const weddingDateControl = this.formGroup.get(FormControlName.wedding_date);

      if (haveWeddingDate === true) {
        this.setRequiredControl(weddingDateControl);
      } else if (haveWeddingDate === false) {
        this.removeRequiredControl(weddingDateControl, null);
      }
      weddingDateControl?.updateValueAndValidity({ emitEvent: false });
    });

    // Suscripción para campos de acompañante - She y He usando función helper
    this.setupCompanionFieldSubscription(FormGroupFields.she);
    this.setupCompanionFieldSubscription(FormGroupFields.he);

    // Suscripción para campos de identidad - She y He usando función helper
    this.setupIdentityNumberSubscription(FormGroupFields.she);
    this.setupIdentityNumberSubscription(FormGroupFields.he);

    // Suscripción para how_find_us_other
    this.formGroup.get(FormControlName.how_find_us)?.valueChanges.subscribe(howFindUs => {
      const howFindUsOtherControl = this.formGroup.get(FormControlName.how_find_us_other);

      if (howFindUs === 'Otro') {
        this.setRequiredControl(howFindUsOtherControl);
      } else {
        this.removeRequiredControl(howFindUsOtherControl, '');
      }
      howFindUsOtherControl?.updateValueAndValidity({ emitEvent: false });
    });
  }

  /**
   * Configura la suscripción para manejar campos de acompañante dinámicamente
   * Elimina duplicación de código y corrige el bug del grupo 'he'
   * @param groupName - 'she' o 'he'
   */
  private setupCompanionFieldSubscription(groupName: FormGroupFields.she | FormGroupFields.he) {
    const group = this.formGroup.get(groupName);
    const liveAccompaniedControl = group?.get(FormControlName.live_accompanied);

    liveAccompaniedControl?.valueChanges.subscribe(liveAccompanied => {
      const companionFields = [FormControlName.companion_full_name, FormControlName.companion_phone, FormControlName.companion_relationship];

      companionFields.forEach(fieldName => {
        const control = group?.get(fieldName);

        if (liveAccompanied === true) {
          this.setRequiredControl(control);
        } else if (liveAccompanied === false) {
          this.removeRequiredControl(control, '');
        }
        control?.updateValueAndValidity({ emitEvent: false });
      });
    });
  }

  /**
   * Configura la suscripción para manejar campos de identidad dinámicamente
   * @param groupName - 'she' o 'he'
   */
  private setupIdentityNumberSubscription(groupName: FormGroupFields.she | FormGroupFields.he) {
    const group = this.formGroup.get(groupName);

    if (!group) return;

    // Suscripción específica para identity_number
    group.get(FormControlName.identity_type)?.valueChanges.subscribe(identityType => {
      const identityNumberControl = group.get(FormControlName.identity_number);
      this.removeRequiredControl(identityNumberControl, '');

      if (identityType === IdentityType.cedula) {
        identityNumberControl?.addValidators([Validators.required, CedulaValidator.validate]);
      } else {
        identityNumberControl?.addValidators(Validators.required);
      }

      identityNumberControl?.markAsPristine();
      identityNumberControl?.markAsUntouched();
      identityNumberControl?.updateValueAndValidity({ emitEvent: false });
    });
  }

  /**
   * Set the required validator and mark the control as pristine and untouched
   * @param control - The control to set the required validator and mark as pristine and untouched
   */
  private setRequiredControl(control: AbstractControl | null | undefined) {
    control?.setValidators([Validators.required]);
    control?.markAsPristine();
    control?.markAsUntouched();
  }

  /**
   * Remove the required validator and set the value of the control
   * @param control - The control to remove the required validator and set the value
   * @param value - The value to set the control to
   */
  private removeRequiredControl(control: AbstractControl | null | undefined, value: string | null) {
    control?.clearValidators();
    control?.setValue(value, { emitEvent: false });
  }

  changeAccordionPanelIndex(index: number, type: 'close' | 'open') {
    if (type === 'close') {
      this.openedAccordionPanel = this.openedAccordionPanel.filter(panel => panel !== index);
    } else {
      this.openedAccordionPanel.push(index);
    }

    this.openedAccordionPanel.sort((a, b) => a - b);
  }

  /**
   * Verifica si todos los campos requeridos de un grupo específico están completos
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @returns true si todos los campos requeridos están completos, false en caso contrario
   */
  areRequiredFieldsComplete(section: FormGroupFields): boolean {
    if (section === FormGroupFields.general) {
      return this.checkRequiredFields(this.formGroup, true);
    }

    const groupName = section === FormGroupFields.she ? FormGroupFields.she : FormGroupFields.he;
    const subGroup = this.formGroup.get(groupName);

    return subGroup ? this.checkRequiredFields(subGroup, false) : false;
  }

  /**
   * Verifica campos requeridos en un FormGroup o FormControl
   * @param control - El control a verificar
   * @param rootLevelOnly - Si true, solo verifica controles del nivel raíz (excluye subgrupos)
   * @returns true si todos los campos requeridos están completos
   */
  private checkRequiredFields(control: AbstractControl, rootLevelOnly: boolean = false): boolean {
    if (control instanceof FormGroup) {
      return Object.entries(control.controls).every(([controlName, childControl]) => {
        // Si es nivel raíz y encontramos un subgrupo, saltarlo
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) {
          return true;
        }

        return this.checkRequiredFields(childControl, false);
      });
    }

    // Para FormControl individual
    return this.isControlCompleted(control);
  }

  /**
   * Verifica si un control individual es válido (si es requerido, debe tener valor)
   * @param control - El control a verificar
   * @returns true si el control es válido
   */
  private isControlCompleted(control: AbstractControl): boolean {
    // Si no tiene error de required, es válido
    if (!control.hasError('required')) {
      return true;
    }

    // Si tiene error de required, verificamos si tiene valor truthy
    return !!control.value;
  }

  /**
   * Verifica si hay campos inválidos por validadores que no sean required en una sección específica
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @returns true si hay campos inválidos, false si todos los campos son válidos
   */
  areInvalidFields(section: FormGroupFields): boolean {
    if (section === FormGroupFields.general) {
      return this.checkInvalidFields(this.formGroup, true);
    }

    const groupName = section === FormGroupFields.she ? FormGroupFields.she : FormGroupFields.he;
    const subGroup = this.formGroup.get(groupName);

    return subGroup ? this.checkInvalidFields(subGroup, false) : false;
  }

  /**
   * Verifica campos inválidos en un FormGroup o FormControl
   * @param control - El control a verificar
   * @param rootLevelOnly - Si true, solo verifica controles del nivel raíz (excluye subgrupos)
   * @returns true si hay campos inválidos
   */
  private checkInvalidFields(control: AbstractControl, rootLevelOnly: boolean = false): boolean {
    if (control instanceof FormGroup) {
      return Object.entries(control.controls).some(([controlName, childControl]) => {
        // Si es nivel raíz y encontramos un subgrupo, saltarlo
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) {
          return false;
        }

        return this.checkInvalidFields(childControl, false);
      });
    }

    // Para FormControl individual
    return this.isControlInvalid(control);
  }

  /**
   * Verifica si un control individual es inválido (excluyendo errores de required)
   * @param control - El control a verificar
   * @returns true si el control es inválido por otros validadores
   */
  private isControlInvalid(control: AbstractControl): boolean {
    // Si el control no tiene errores, es válido
    if (!control.errors) {
      return false;
    }

    // Obtener todas las claves de errores excepto 'required'
    const errorKeys = Object.keys(control.errors).filter(key => key !== 'required');

    // Si hay errores que no sean 'required', el control es inválido
    return errorKeys.length > 0;
  }
}
