import { Component, inject, Input, OnInit, signal } from '@angular/core';
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
import { PreviousRequestValidator } from '@core/typescript/validate-previous-request';
import { yesNoOptions } from '@core/typescript/constants';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { Ss } from '@core/services/singleton.service';
import { FormSkeletonComponent } from './components/form-skeleton/form-skeleton.component';
import { RequestService } from '@core/entities/request/request.service';
import { RequestI, RequestStatus } from '@core/entities/request/request.model';
import { RequestSend } from './components/request-send/request-send';
import { fun } from '@core/services/functions.service';
import { UserService } from '@core/entities/user/user.service';
import { UserC } from '@core/entities/user/user.class';
import { RequestClass } from '@core/entities/request/request.class';

@Component({
  selector: 'app-form-page',
  imports: [
    AccordionModule,
    InputTextModule,
    FormsModule,
    ReactiveFormsModule,
    SelectModule,
    DatePickerModule,
    TextareaModule,
    InputMaskModule,
    SelectButtonModule,
    DividerLine,
    ButtonModule,
    NgTemplateOutlet,
    FormErrorMsgComponent,
    FormSkeletonComponent,
    RequestSend,
  ],
  templateUrl: './form-page.html',
  styleUrl: './form-page.scss',
})
export class FormPage implements OnInit {
  @Input() user_id: string = '';
  userData: UserC | null = null;
  submission_success = signal(false);

  deviceDetectorService = inject(DeviceDetectorService);
  retreatService = inject(RetreatService);
  userService = inject(UserService);
  requestService = inject(RequestService);
  fb = inject(FormBuilder);

  FormControlName = FormControlName;
  FormFieldId = FormFieldId;
  FormGroupFields = FormGroupFields;
  IdentityType = IdentityType;
  Affirmation = Affirmation;

  openedAccordionPanel: number[] = [0, 1, 2];
  previousRequests = signal<RequestClass[]>([]);

  formGroup = this.fb.group({
    [FormControlName.id]: [''],
    [FormControlName.is_active]: [true],
    [FormControlName.is_accepted]: [null],
    [FormControlName.status]: [RequestStatus.PENDING],
    [FormControlName.retreat]: ['', Validators.required],
    [FormControlName.dating_period]: ['', Validators.required],
    [FormControlName.have_wedding_date]: [null, Validators.required],
    [FormControlName.wedding_date]: [null],
    [FormControlName.how_find_us]: ['', Validators.required],
    [FormControlName.how_find_us_other]: [''],
    [FormControlName.who_invited_you]: [''],

    [FormGroupFields.she]: this.fb.group({
      [FormControlName.full_name]: ['', Validators.required],
      [FormControlName.nickname]: [''],
      [FormControlName.birth_date]: ['', Validators.required],
      [FormControlName.identity_type]: [IdentityType.cedula, Validators.required],
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate, PreviousRequestValidator.validate(this.previousRequests, FormControlName.identity_number)])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', Validators.required],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email, PreviousRequestValidator.validate(this.previousRequests, FormControlName.email)])],
      [FormControlName.cell_phone]: ['', Validators.compose([Validators.required, PreviousRequestValidator.validate(this.previousRequests, FormControlName.cell_phone)])],
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
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate, PreviousRequestValidator.validate(this.previousRequests, FormControlName.identity_number)])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', Validators.required],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email, PreviousRequestValidator.validate(this.previousRequests, FormControlName.email)])],
      [FormControlName.cell_phone]: ['', Validators.compose([Validators.required, PreviousRequestValidator.validate(this.previousRequests, FormControlName.cell_phone)])],
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

  retreats = signal<Retreat[] | null>(null);
  loading = signal(true);
  timeRanges = [{ label: '0 a 6 meses' }, { label: '6 a 12 meses' }, { label: '1 a 4 años' }, { label: '4 a 6 años' }, { label: '6 a 8 años' }, { label: '8 a 10 años' }, { label: 'mas de 10 años' }];

  howToKnow = [{ label: 'Redes Sociales' }, { label: 'Amigos' }, { label: 'Familia' }, { label: 'Otro' }];

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

  get isFormValid() {
    return this.formGroup.valid;
  }

  async ngOnInit(): Promise<void> {
    await this.getUser();

    this.subscribeToFormChanges();
    // this.patchForm();
    this.processInitForm();
  }

  patchForm() {
    // this.formGroup.patchValue(formDataMuck as any, { emitEvent: true });
  }

  test() {
    console.log(this.formGroup);
  }

  processInitForm() {
    this.loading.set(true);

    const getRequiredInfo = () => new Promise<[UserC | null, Retreat[] | null]>(resolve => resolve([this.userData, this.retreats()]));
    const reintentarSi = (requiredInfo: [UserC | null, Retreat[] | null]) => requiredInfo.some((info: UserC | Retreat[] | null) => info === null);
    const noLoadedRequiredInfo = () => Ss.toastService.error({ message: 'Error al obtener la información requerida, Vuelva a intentarlo', title: 'Error' });

    const initializeTable = () => {
      this.loading.set(false);
    };

    fun.retryUntil({
      task: getRequiredInfo,
      retryWhen: reintentarSi,
      actionAfterRetry: initializeTable.bind(this),
      actionIfNoSuccess: noLoadedRequiredInfo,
    });
  }

  getUser() {
    this.userService.getUserById(this.user_id).then(user => {
      this.userData = user;
      this.getRetreats();
    });
  }

  getRetreats() {
    if (!this.userData) return;

    this.retreatService
      .getRetreatByUser(this.userData)
      .then(retreats => {
        this.retreats.set(retreats);

        if (retreats?.length === 0) {
          Ss.toastService.warning({ message: 'No hay retiros disponibles para solicitar', title: 'Error' });
        }
      })
      .catch(error => {
        Ss.toastService.error({ message: 'Error al obtener los retiros, disponibles para solicitar', title: 'Error' });
      });
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
        identityNumberControl?.addValidators([Validators.required, CedulaValidator.validate, PreviousRequestValidator.validate(this.previousRequests, FormControlName.identity_number)]);
      } else {
        identityNumberControl?.addValidators([Validators.required, PreviousRequestValidator.validate(this.previousRequests, FormControlName.identity_number)]);
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

  async onRetreatChange() {
    const retreatId = this.formGroup.get(FormControlName.retreat)?.value;
    const retreat = this.retreats()?.find(r => r.id === retreatId);

    const previousRequests = (await retreat?.getRequests()) ?? [];
    this.previousRequests.set(previousRequests);

    // Actualizar validadores de campos que dependen de solicitudes anteriores
    this.updatePreviousRequestValidators();
  }

  /**
   * Actualiza los validadores de campos que dependen de solicitudes anteriores
   */
  private updatePreviousRequestValidators() {
    // Campos que necesitan validación de solicitudes anteriores
    const fieldsToValidate = [FormControlName.email, FormControlName.cell_phone, FormControlName.identity_number];

    // Actualizar validadores para ambos grupos (she y he)
    [FormGroupFields.she, FormGroupFields.he].forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control) {
          // Obtener validadores existentes (excluyendo el validador de solicitudes anteriores)
          const currentValidators = control.validator ? [control.validator] : [];
          const asyncValidators = control.asyncValidator ? [control.asyncValidator] : [];

          // Filtrar validadores existentes que no sean PreviousRequestValidator
          const filteredValidators = currentValidators.filter(validator => validator !== PreviousRequestValidator.validate(this.previousRequests, fieldName));

          // Agregar el nuevo validador de solicitudes anteriores
          const newValidators = [...filteredValidators, PreviousRequestValidator.validate(this.previousRequests, fieldName)];

          // Aplicar los validadores actualizados
          control.setValidators(newValidators);
          control.updateValueAndValidity({ emitEvent: false });
        }
      });
    });
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

  resetForm() {
    this.formGroup.reset();
    this.submission_success.set(false);
  }

  onSubmit() {
    const formData = this.formGroup.getRawValue() as unknown as RequestI;

    Ss.confirmationService.confirm({
      message:
        '<span class="text-lg text-red-600 font-semibold">IMPORTANTE: Solo se permite el envío de un formulario por persona.</span> <br> <br> <span class="text-sm">Por favor, revisa cuidadosamente toda la información proporcionada antes de confirmar el envío. Una vez enviado, no podrás realizar cambios.</span> <br> <span class="text-sm">Se enviará un correo de confirmación a la dirección de correo electrónico proporcionada.</span>',
      header: '¿Estás seguro de querer enviar este formulario?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Enviar',
      rejectLabel: 'Cancelar',
      acceptIcon: 'pi pi-send',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => this.processFormSubmission(formData),
      reject: () => {},
    });
  }

  private async processFormSubmission(formData: RequestI): Promise<RequestI | null> {
    const retreat = this.retreats()?.find(r => r.id === formData.retreat);
    if (!retreat) {
      Ss.toastService.error({ message: 'Retiro no encontrado', title: 'Error' });
      return null;
    }

    try {
      let request: RequestI | null = null;
      if (formData.id) {
        // request = await this.requestService.updateRequest(formData, retreat);
      } else {
        request = await this.requestService.createRequest(formData, retreat);
      }

      await retreat.incrementRequestCount();

      this.submission_success.set(true);

      return request;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
