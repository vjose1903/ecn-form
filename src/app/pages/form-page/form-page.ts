import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';

import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerLine } from '../../core/components/divider-line/divider-line';
import { DeviceDetectorService } from '../../core/services/device-detector.service';
import { DeviceE } from '../../core/models/device-detector.model';
import { Affirmation, cleanFormValues, FormControlName, FormFieldId, FormGroupFields, IdentityType } from './form-page.model';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { CedulaValidator } from '@core/typescript/validators/validate-cedula';
import { PreviousRequestValidator } from '@core/typescript/validate-previous-request';
import { yesNoOptions } from '@core/typescript/constants';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { Ss } from '@core/services/singleton.service';
import { FormSkeletonComponent } from './components/form-skeleton/form-skeleton.component';
import { RequestService } from '@core/entities/request/request.service';
import { RequestAction, RequestI, RequestStatus } from '@core/entities/request/request.model';
import { RequestSend } from './components/request-send/request-send';
import { ErrorMessage } from './components/error-message/error-message';
import { fun } from '@core/services/functions.service';
import { UserService } from '@core/entities/user/user.service';
import { UserC } from '@core/entities/user/user.class';
import { RequestClass } from '@core/entities/request/request.class';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputNumberModule } from 'primeng/inputnumber';

import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FormStatsUtils } from './utils/form-stats';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { environment } from 'environments/environment';
import { formDataMuck } from './form-page.muck';

@Component({
  selector: 'app-form-page',
  imports: [
    CommonModule,
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
    ErrorMessage,
    InputGroupModule,
    InputGroupAddonModule,
    InputNumberModule,
    PopoverModule,
    CheckboxModule,
    DialogModule,
  ],
  templateUrl: './form-page.html',
  styleUrl: './form-page.scss',
})
export class FormPage implements OnInit {
  @Input() user_id: string = '';

  submission_success = signal(false);
  confirmationDialogVisible = signal(false);
  hasReadInformation = signal(false);

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
  readonly showDevTestButton = !environment.production;

  formGroup = this.fb.group({
    [FormControlName.id]: [''],
    [FormControlName.is_active]: [true],
    [FormControlName.action]: [RequestAction.NEW],
    [FormControlName.status]: [RequestStatus.PENDING],
    [FormControlName.retreat]: ['', Validators.required],
    [FormControlName.dating_period_year]: [null, Validators.required],
    [FormControlName.dating_period_month]: [null, Validators.required],
    [FormControlName.have_wedding_date]: [null, Validators.required],
    [FormControlName.wedding_date]: [null],
    [FormControlName.how_find_us]: ['', Validators.required],
    [FormControlName.how_find_us_other]: [''],
    [FormControlName.who_invited_you]: [''],
    [FormControlName.who_invited_you_phone]: [''],

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
      [FormControlName.family_information]: this.fb.array(
        [
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', Validators.required],
            [FormControlName.familiar_phone]: ['', Validators.required],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', Validators.required],
            [FormControlName.familiar_phone]: ['', Validators.required],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
        ],
        [Validators.minLength(2)]
      ),

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
      [FormControlName.family_information]: this.fb.array(
        [
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', Validators.required],
            [FormControlName.familiar_phone]: ['', Validators.required],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', Validators.required],
            [FormControlName.familiar_phone]: ['', Validators.required],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
        ],
        [Validators.minLength(2)]
      ),
      [FormControlName.emergency_full_name]: ['', Validators.required],
      [FormControlName.emergency_phone]: ['', Validators.required],
      [FormControlName.emergency_relationship]: ['', Validators.required],
      [FormControlName.religion]: ['', Validators.required],
      [FormControlName.church_name]: ['', Validators.required],
    }),
  });

  retreats = signal<RetreatClass[] | null>(null);
  initialized = signal(true);
  error = signal(false);
  loading = signal(false);
  retreatSelected = signal<RetreatClass | null>(null);
  userSelected = signal<UserC | null>(null);

  private ref = inject(DynamicDialogRef, { optional: true });
  private config = inject(DynamicDialogConfig, { optional: true });

  formType: 'new' | 'update' = 'new';
  request: RequestI | null = null;

  requestRefString = computed(() => {
    const retreatSelected = this.retreatSelected();
    const user = this.userSelected();

    if (!retreatSelected || !user) return '';

    return `user/${user.id}/retreat/${retreatSelected.id}/request`;
  });

  howToKnow = [{ label: 'Redes Sociales' }, { label: 'Amigos' }, { label: 'Familia' }, { label: 'Otro' }];

  identityTypes = [{ label: 'Cédula' }, { label: 'Pasaporte' }];

  yesNoOptions = yesNoOptions;

  companionOptions = [{ label: 'Padre' }, { label: 'Madre' }, { label: 'Hermano' }, { label: 'Hermana' }, { label: 'Tio' }, { label: 'Tia' }, { label: 'Abuelo' }, { label: 'Abuela' }, { label: 'Amigo' }, { label: 'Suegra' }, { label: 'Suegro' }];

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  get isUpdate() {
    return this.formType === 'update';
  }

  isInModal() {
    return this.ref !== null && this.ref !== undefined;
  }

  get sheGroup() {
    return this.formGroup?.get(FormGroupFields.she) as FormGroup;
  }

  get heGroup() {
    return this.formGroup?.get(FormGroupFields.he) as FormGroup;
  }

  get sheFamilyInformationArray() {
    return this.sheGroup?.get(FormControlName.family_information) as FormArray;
  }

  get heFamilyInformationArray() {
    return this.heGroup?.get(FormControlName.family_information) as FormArray;
  }

  get isFormValid() {
    return this.formGroup.valid && !this.datingPeriodError;
  }

  get datingPeriodError() {
    const yearValue = this.formGroup.get(FormControlName.dating_period_year)?.value;
    const monthValue = this.formGroup.get(FormControlName.dating_period_month)?.value;

    const ambosCero = yearValue !== null && yearValue !== undefined && monthValue !== null && monthValue !== undefined && yearValue === 0 && monthValue === 0;

    return ambosCero;
  }

  get currentRequestId() {
    return this.formGroup.get(FormControlName.id)?.value;
  }

  async ngOnInit(): Promise<void> {
    if (this.ref && this.config) {
      this.formType = this.config.data.formType;
      this.request = this.config.data.request;
      this.user_id = this.config.data.user_id;
    }

    await this.getUser();

    this.subscribeToFormChanges();
    this.processInitComponent();
  }

  addFamilyMember(groupName: FormGroupFields.she | FormGroupFields.he) {
    const familyArray = groupName === FormGroupFields.she ? this.sheFamilyInformationArray : this.heFamilyInformationArray;

    const newFamilyMember = this.fb.group({
      [FormControlName.familiar_full_name]: ['', Validators.required],
      [FormControlName.familiar_phone]: ['', Validators.required],
      [FormControlName.familiar_relationship]: ['', Validators.required],
    });

    familyArray.push(newFamilyMember);
  }

  removeFamilyMember(groupName: FormGroupFields.she | FormGroupFields.he, index: number) {
    const familyArray = groupName === FormGroupFields.she ? this.sheFamilyInformationArray : this.heFamilyInformationArray;

    // Mantener mínimo 2 familiares
    if (familyArray.length > 2) {
      familyArray.removeAt(index);
    }
  }

  getFamilyMember(groupName: FormGroupFields.she | FormGroupFields.he, index: number) {
    const familyArray = groupName === FormGroupFields.she ? this.sheFamilyInformationArray : this.heFamilyInformationArray;
    return familyArray.at(index) as FormGroup;
  }

  getDatingPeriodAddon(formControlName: FormControlName.dating_period_year | FormControlName.dating_period_month) {
    const value = this.formGroup.get(formControlName)?.value;

    const addons = {
      [FormControlName.dating_period_year]: { singular: ' Año', plural: ' Años' },
      [FormControlName.dating_period_month]: { singular: ' Mes', plural: ' Meses' },
    } as const;

    if (value === null || value === undefined) return addons[formControlName].plural;

    return Number(value) == 1 ? addons[formControlName].singular : addons[formControlName].plural;
  }

  async patchForm() {
    if (fun.hasValue(this.request)) {
      this.formGroup.get(FormControlName.id)?.setValue(this.request?.id ?? '');
      await this.onRetreatChange(this.request?.retreat);

      let data = this.request;
      if (data instanceof RequestClass) data = data.asJson();

      this.formGroup.patchValue(data as any);
    }

    return Promise.resolve();
  }

  async test(): Promise<void> {
    const retreats = this.retreats();

    if (!retreats?.length) {
      Ss.toastService.warning({
        title: 'Sin retiros',
        message: 'No hay retiros disponibles para cargar datos de prueba.',
      });
      return;
    }

    const retreatId = this.formGroup.get(FormControlName.retreat)?.value || this.retreatSelected()?.id || retreats[0]?.id;

    if (!retreatId) {
      Ss.toastService.warning({
        title: 'Retiro no disponible',
        message: 'No se pudo seleccionar un retiro para la prueba.',
      });
      return;
    }

    const mockRequest = this.getMockRequest(retreatId);

    this.formGroup.patchValue(mockRequest as any);
    await this.onRetreatChange(retreatId);
    this.openedAccordionPanel = [0, 1, 2];

    Ss.toastService.success({
      title: 'Formulario completado',
      message: 'Se cargaron los datos de prueba en el formulario.',
    });
  }

  private getMockRequest(retreatId: string): RequestI {
    return {
      ...formDataMuck,
      retreat: retreatId,
      wedding_date: this.parseMockDate(formDataMuck.wedding_date),
      she: {
        ...formDataMuck.she,
        birth_date: this.parseMockDate(formDataMuck.she.birth_date) ?? '',
        family_information: formDataMuck.she.family_information.map(member => ({ ...member })),
      },
      he: {
        ...formDataMuck.he,
        birth_date: this.parseMockDate(formDataMuck.he.birth_date) ?? '',
        family_information: formDataMuck.he.family_information.map(member => ({ ...member })),
      },
    };
  }

  private parseMockDate(value: Date | string | { seconds: number; nanoseconds: number } | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }

    if (typeof value === 'object' && 'seconds' in value) {
      return new Date(value.seconds * 1000);
    }

    return null;
  }

  onRetry() {
    window.location.reload();
  }

  processInitComponent() {
    this.initialized.set(false);

    const getRequiredInfo = () => new Promise<any>(resolve => resolve([this.userSelected(), this.retreats()]));
    const reintentarSi = (requiredInfo: any) => requiredInfo.some((info: any) => fun.isEmpty(info));
    const noLoadedRequiredInfo = () => {
      this.error.set(true);
      this.initialized.set(true);
    };

    const initializeForm = async () => {
      if (this.formType === 'update') await this.patchForm();

      this.initialized.set(true);
    };

    fun.retryUntil({
      task: getRequiredInfo,
      retryWhen: reintentarSi,
      actionAfterRetry: initializeForm.bind(this),
      actionIfNoSuccess: noLoadedRequiredInfo,
    });
  }

  getUser() {
    this.userService.getUserById(this.user_id).then(user => {
      this.userSelected.set(user);
      this.getRetreats();
    });
  }

  getRetreats() {
    const user = this.userSelected();
    if (user == null) return;

    this.retreatService
      .getRetreatByUser(user)
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
    this.formGroup.valueChanges.subscribe(value => {});

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
    // const group = this.formGroup.get(groupName);
    // const liveAccompaniedControl = group?.get(FormControlName.live_accompanied);
    // liveAccompaniedControl?.valueChanges.subscribe(liveAccompanied => {
    //   const companionFields = [FormControlName.familiar_full_name, FormControlName.familiar_phone, FormControlName.familiar_relationship];
    //   companionFields.forEach(fieldName => {
    //     const control = group?.get(fieldName);
    //     if (liveAccompanied === true) {
    //       this.setRequiredControl(control);
    //     } else if (liveAccompanied === false) {
    //       this.removeRequiredControl(control, '');
    //     }
    //     control?.updateValueAndValidity({ emitEvent: false });
    //   });
    // });
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
        identityNumberControl?.addValidators([Validators.required, CedulaValidator.validate, PreviousRequestValidator.validate(this.previousRequests(), FormControlName.identity_number, this.currentRequestId)]);
      } else {
        identityNumberControl?.addValidators([Validators.required, PreviousRequestValidator.validate(this.previousRequests(), FormControlName.identity_number, this.currentRequestId)]);
      }

      identityNumberControl?.markAsPristine();
      identityNumberControl?.markAsUntouched();
      identityNumberControl?.setErrors(null);
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
  private removeRequiredControl(control: AbstractControl | null | undefined, value: string | number | null | undefined) {
    control?.clearValidators();
    control?.setValue(value, { emitEvent: false });
    control?.markAsPristine();
    control?.markAsUntouched();
  }

  changeAccordionPanelIndex(index: number, type: 'close' | 'open') {
    if (type === 'close') {
      this.openedAccordionPanel = this.openedAccordionPanel.filter(panel => panel !== index);
    } else {
      this.openedAccordionPanel.push(index);
    }

    this.openedAccordionPanel.sort((a, b) => a - b);
  }

  async onRetreatChange(retreatId?: string | null) {
    retreatId ??= this.formGroup.get(FormControlName.retreat)?.value;

    if (fun.isEmpty(retreatId)) return;

    const retreat = this.retreats()?.find(r => r.id === retreatId);

    this.retreatSelected.set(retreat ?? null);

    // Limpiar validadores anteriores primero
    this.clearPreviousRequestValidators();

    const previousRequests = (await retreat?.getRequests()) ?? [];
    this.previousRequests.set(previousRequests);

    // Actualizar validadores de campos que dependen de solicitudes anteriores
    this.updatePreviousRequestValidators();

    // Forzar la validación de todos los campos que ya tienen valores para mostrar errores inmediatamente
    this.forceValidationOnExistingValues();
  }

  /**
   * Limpia los validadores de solicitudes anteriores
   */
  private clearPreviousRequestValidators() {
    // Campos que necesitan validación de solicitudes anteriores
    const fieldsToValidate = [FormControlName.email, FormControlName.cell_phone, FormControlName.identity_number];

    // Limpiar validadores para ambos grupos (she y he)
    [FormGroupFields.she, FormGroupFields.he].forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control) {
          // Obtener validadores existentes
          const currentValidators = control.validator ? [control.validator] : [];

          // Filtrar validadores que no sean PreviousRequestValidator
          const filteredValidators = currentValidators.filter(validator => {
            return !validator.toString().includes('PreviousRequestValidator');
          });

          // Aplicar los validadores filtrados
          control.setValidators(filteredValidators);

          // Forzar la validación y emitir eventos para que se actualice la UI
          control.updateValueAndValidity();
        }
      });
    });
  }

  /**
   * Actualiza los validadores de campos que dependen de solicitudes anteriores
   */
  private updatePreviousRequestValidators() {
    // Verificar que tenemos datos en el signal
    const currentRequests = this.previousRequests();

    // Campos que necesitan validación de solicitudes anteriores
    const fieldsToValidate = [FormControlName.email, FormControlName.cell_phone, FormControlName.identity_number];

    // Actualizar validadores para ambos grupos (she y he)
    [FormGroupFields.she, FormGroupFields.he].forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control) {
          // Obtener validadores existentes
          const currentValidators = control.validator ? [control.validator] : [];

          // Agregar el validador de solicitudes anteriores con el array directamente
          const newValidators = [...currentValidators, PreviousRequestValidator.validate(currentRequests, fieldName, this.currentRequestId)];

          // Aplicar los validadores actualizados
          control.setValidators(newValidators);

          // Forzar la validación y emitir eventos para que se muestren los mensajes de error
          control.updateValueAndValidity();

          // Marcar como touched para que se muestren los errores si ya tiene valor
          if (control.value && control.invalid) {
            control.markAsTouched();
          }
        }
      });
    });
  }

  /**
   * Fuerza la validación de todos los campos que ya tienen valores para mostrar errores inmediatamente
   */
  private forceValidationOnExistingValues() {
    // Campos que necesitan validación de solicitudes anteriores
    const fieldsToValidate = [FormControlName.email, FormControlName.cell_phone, FormControlName.identity_number];

    // Forzar validación para ambos grupos (she y he)
    [FormGroupFields.she, FormGroupFields.he].forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control && control.value) {
          // Forzar la validación del campo
          control.updateValueAndValidity();

          // Si el campo es inválido, marcarlo como touched para mostrar el error
          if (control.invalid) control.markAsTouched();
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
    if (section === FormGroupFields.general) return this.checkRequiredFields(this.formGroup, true);

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
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) return true;

        return this.checkRequiredFields(childControl, false);
      });
    }

    if (control instanceof FormArray) {
      return control.controls.every(childControl => this.checkRequiredFields(childControl, false));
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
    if (!control.hasError('required')) return true;

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
      return this.checkInvalidFields(this.formGroup, true) || this.datingPeriodError;
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
        if (rootLevelOnly && (controlName === FormGroupFields.she || controlName === FormGroupFields.he)) return false;

        return this.checkInvalidFields(childControl, false);
      });
    }

    if (control instanceof FormArray) {
      return control.controls.some(childControl => this.checkInvalidFields(childControl, false));
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
    if (!control.errors) return false;

    // Obtener todas las claves de errores excepto 'required'
    const errorKeys = Object.keys(control.errors).filter(key => key !== 'required');

    // Si hay errores que no sean 'required', el control es inválido
    return errorKeys.length > 0;
  }

  resetForm() {
    this.formGroup.reset(cleanFormValues);
    this.submission_success.set(false);
  }

  // Variables para manejar el estado del popover
  private popoverTimeout: any;
  private isMouseOverPopover = false;

  onPopoverShow() {
    // Cancelar cualquier timeout pendiente cuando se muestra el popover
    if (this.popoverTimeout) {
      clearTimeout(this.popoverTimeout);
      this.popoverTimeout = null;
    }
  }

  onPopoverHide() {
    // Limpiar el timeout cuando se oculta el popover
    if (this.popoverTimeout) {
      clearTimeout(this.popoverTimeout);
      this.popoverTimeout = null;
    }
  }

  onPopoverMouseLeave(popover: any) {
    // Dar un pequeño delay antes de cerrar para permitir que el usuario mueva el cursor al popover
    this.popoverTimeout = setTimeout(() => {
      if (!this.isMouseOverPopover) {
        popover.hide();
      }
    }, 100);
  }

  onPopoverContentMouseEnter() {
    // El usuario está sobre el contenido del popover
    this.isMouseOverPopover = true;

    // Cancelar cualquier timeout de cierre
    if (this.popoverTimeout) {
      clearTimeout(this.popoverTimeout);
      this.popoverTimeout = null;
    }
  }

  onPopoverContentMouseLeave(popover: any) {
    // El usuario salió del contenido del popover
    this.isMouseOverPopover = false;

    // Cerrar el popover después de un pequeño delay
    this.popoverTimeout = setTimeout(() => {
      popover.hide();
    }, 100);
  }

  /**
   * Obtiene los campos faltantes de una sección específica
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @returns Array de nombres de campos faltantes
   */
  getMissingFields(section: FormGroupFields): string[] {
    return FormStatsUtils.getMissingFields(this.formGroup, section, this.datingPeriodError);
  }

  /**
   * Obtiene los campos con errores de una sección específica
   * @param section - El grupo a verificar: 'general', 'she', o 'he'
   * @returns Array de nombres de campos con errores
   */
  getInvalidFields(section: FormGroupFields): string[] {
    return FormStatsUtils.getInvalidFields(this.formGroup, section);
  }

  onSubmit() {
    this.loading.set(false); // No ponemos loading hasta confirmar
    this.hasReadInformation.set(false); // Reset checkbox
    this.confirmationDialogVisible.set(true);
  }

  onConfirmSubmit() {
    if (!this.hasReadInformation()) {
      Ss.toastService.warning({
        message: 'Debes confirmar que has leído la información antes de enviar',
        title: 'Confirmación requerida',
      });
      return;
    }

    this.loading.set(true);

    const formData = this.formGroup.getRawValue() as unknown as RequestI;
    this.processFormSubmission(formData);
  }

  onCancelSubmit() {
    this.confirmationDialogVisible.set(false);
    this.hasReadInformation.set(false);
    this.loading.set(false);
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
        request = await this.requestService.updateRequest(formData, retreat, { previousRequest: this.request ?? undefined, trackAsEdited: true });
      } else {
        console.log('formData ', formData);

        request = await this.requestService.createRequest({ payload: formData, refString: this.requestRefString() });
      }

      this.confirmationDialogVisible.set(false);

      if (!this.isInModal()) {
        this.submission_success.set(true);
        this.loading.set(false);
      } else {
        this.ref?.close(request);
        Ss.toastService.success({ message: 'Solicitud actualizada correctamente', title: 'Solicitud actualizada' });
      }

      return request;
    } catch (error) {
      console.error(error);
      if (!this.isInModal()) {
        this.loading.set(false);
      } else {
        Ss.toastService.error({ message: 'Error al actualizar la solicitud', title: 'Error' });
      }
      return null;
    }
  }
}
