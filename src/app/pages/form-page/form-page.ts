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
import { AutoCompleteModule } from 'primeng/autocomplete';

import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerLine } from '../../core/components/divider-line/divider-line';
import { DeviceDetectorService } from '../../core/services/device-detector.service';
import { DeviceE } from '../../core/models/device-detector.model';
import { Affirmation, cleanFormValues, FormControlName, FormFieldId, FormGroupFields, IdentityType } from './form-page.model';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { CedulaValidator } from '@core/typescript/validators/validate-cedula';
import { PhoneValidator } from '@core/typescript/validators/validate-phone';
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
    AutoCompleteModule,
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
  readonly today = this.startOfDay(new Date());
  readonly otherReligionOption = 'Otra religión';
  private readonly closeFamilyRelationships = new Set(['padre', 'madre', 'hermano', 'hermana', 'tio', 'tia', 'abuelo', 'abuela']);

  formGroup = this.fb.group({
    [FormControlName.id]: [''],
    [FormControlName.is_active]: [true],
    [FormControlName.action]: [RequestAction.NEW],
    [FormControlName.status]: [RequestStatus.PENDING],
    [FormControlName.retreat]: ['', Validators.required],
    [FormControlName.dating_period_year]: [null, [Validators.required, Validators.min(0), Validators.max(80)]],
    [FormControlName.dating_period_month]: [null, [Validators.required, Validators.min(0), Validators.max(11)]],
    [FormControlName.have_wedding_date]: [null, Validators.required],
    [FormControlName.wedding_date]: [null, this.futureOrTodayDateValidator()],
    [FormControlName.how_find_us]: ['', Validators.required],
    [FormControlName.how_find_us_other]: [''],
    [FormControlName.who_invited_you]: ['', [this.minLettersValidator(3), this.personNameValidator()]],
    [FormControlName.who_invited_you_phone]: ['', PhoneValidator.validate],

    [FormGroupFields.she]: this.fb.group({
      [FormControlName.full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
      [FormControlName.nickname]: [''],
      [FormControlName.birth_date]: ['', [Validators.required, this.birthDateRangeValidator()]],
      [FormControlName.identity_type]: [IdentityType.cedula, Validators.required],
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', [Validators.required, this.citySuggestionValidator()]],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email])],
      [FormControlName.cell_phone]: ['', [Validators.required, PhoneValidator.validate]],
      [FormControlName.home_phone]: ['', PhoneValidator.validate],
      [FormControlName.work_phone]: ['', PhoneValidator.validate],
      [FormControlName.family_information]: this.fb.array(
        [
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
            [FormControlName.familiar_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
            [FormControlName.familiar_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
        ],
        [Validators.minLength(2), this.hasCloseFamilyContactValidator()]
      ),

      [FormControlName.emergency_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
      [FormControlName.emergency_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
      [FormControlName.emergency_relationship]: ['', Validators.required],
      [FormControlName.religion]: ['', [Validators.required, this.religionSuggestionValidator()]],
      [FormControlName.religion_other]: [''],
      [FormControlName.church_name]: ['', Validators.required],
    }),
    [FormGroupFields.he]: this.fb.group({
      [FormControlName.full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
      [FormControlName.nickname]: [''],
      [FormControlName.birth_date]: ['', [Validators.required, this.birthDateRangeValidator()]],
      [FormControlName.identity_type]: [IdentityType.cedula, Validators.required],
      [FormControlName.identity_number]: ['', Validators.compose([Validators.required, CedulaValidator.validate])],
      [FormControlName.are_you_married]: [null, Validators.required],
      [FormControlName.have_children]: [null, Validators.required],
      [FormControlName.city_of_residence]: ['', [Validators.required, this.citySuggestionValidator()]],
      [FormControlName.address]: ['', Validators.required],
      [FormControlName.email]: ['', Validators.compose([Validators.required, Validators.email])],
      [FormControlName.cell_phone]: ['', [Validators.required, PhoneValidator.validate]],
      [FormControlName.home_phone]: ['', PhoneValidator.validate],
      [FormControlName.work_phone]: ['', PhoneValidator.validate],
      [FormControlName.family_information]: this.fb.array(
        [
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
            [FormControlName.familiar_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
          this.fb.group({
            [FormControlName.familiar_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
            [FormControlName.familiar_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
            [FormControlName.familiar_relationship]: ['', Validators.required],
          }),
        ],
        [Validators.minLength(2), this.hasCloseFamilyContactValidator()]
      ),
      [FormControlName.emergency_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
      [FormControlName.emergency_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
      [FormControlName.emergency_relationship]: ['', Validators.required],
      [FormControlName.religion]: ['', [Validators.required, this.religionSuggestionValidator()]],
      [FormControlName.religion_other]: [''],
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

    return `city/${retreatSelected.city_id || user.city}/requests`;
  });

  howToKnow = [{ label: 'Redes Sociales' }, { label: 'Amigos' }, { label: 'Familia' }, { label: 'Otro' }];

  identityTypes = [{ label: 'Cédula' }, { label: 'Pasaporte' }];

  yesNoOptions = yesNoOptions;

  companionOptions = [{ label: 'Padre' }, { label: 'Madre' }, { label: 'Hermano' }, { label: 'Hermana' }, { label: 'Tio' }, { label: 'Tia' }, { label: 'Abuelo' }, { label: 'Abuela' }, { label: 'Amigo' }, { label: 'Suegra' }, { label: 'Suegro' }];

  readonly citySuggestions = [
    'Santo Domingo de Guzmán',
    'Azua',
    'Las Charcas',
    'Las Yayas de Viajama',
    'Padre Las Casas',
    'Peralta',
    'Sabana Yegua',
    'Pueblo Viejo',
    'Tábara Arriba',
    'Guayabal',
    'Estebanía',
    'Neiba',
    'Galván',
    'Tamayo',
    'Villa Jaragua',
    'Los Ríos',
    'Barahona',
    'Cabral',
    'Enriquillo',
    'Paraíso',
    'Vicente Noble',
    'El Peñón',
    'La Ciénaga',
    'Fundación',
    'Las Salinas',
    'Polo',
    'Jaquimeyes',
    'Dajabón',
    'Loma de Cabrera',
    'Partido',
    'Restauración',
    'El Pino',
    'San Francisco de Macorís',
    'Arenoso',
    'Castillo',
    'Pimentel',
    'Villa Riva',
    'Las Guáranas',
    'Eugenio María de Hostos',
    'Comendador',
    'Bánica',
    'El Llano',
    'Hondo Valle',
    'Pedro Santana',
    'Juan Santiago',
    'El Seibo',
    'Miches',
    'Moca',
    'Cayetano Germosén',
    'Gaspar Hernández',
    'Jamao al Norte',
    'San Víctor',
    'Jimaní',
    'Duvergé',
    'La Descubierta',
    'Postrer Río',
    'Cristóbal',
    'Mella',
    'Higüey',
    'San Rafael del Yuma',
    'La Romana',
    'Guaymate',
    'Villa Hermosa',
    'La Vega',
    'Constanza',
    'Jarabacoa',
    'Jima Abajo',
    'Nagua',
    'Cabrera',
    'El Factor',
    'Río San Juan',
    'Monte Cristi',
    'Castañuelas',
    'Guayubín',
    'Las Matas de Santa Cruz',
    'Pepillo Salcedo',
    'Villa Vásquez',
    'Pedernales',
    'Oviedo',
    'Baní',
    'Nizao',
    'Matanzas',
    'Puerto Plata',
    'Altamira',
    'Guananico',
    'Imbert',
    'Los Hidalgos',
    'Luperón',
    'Sosúa',
    'Villa Isabela',
    'Villa Montellano',
    'Salcedo',
    'Tenares',
    'Villa Tapia',
    'Samaná',
    'Sánchez',
    'Las Terrenas',
    'San Cristóbal',
    'Sabana Grande de Palenque',
    'Bajos de Haina',
    'Cambita Garabitos',
    'Villa Altagracia',
    'Yaguate',
    'San Gregorio de Nigua',
    'Los Cacaos',
    'San Juan',
    'Bohechío',
    'El Cercado',
    'Juan de Herrera',
    'Las Matas de Farfán',
    'Vallejuelo',
    'San Pedro de Macorís',
    'Los Llanos',
    'Ramón Santana',
    'Consuelo',
    'Quisqueya',
    'Guayacanes',
    'Cotuí',
    'Cevicos',
    'Fantino',
    'Villa La Mata',
    'Santiago',
    'Bisonó',
    'Jánico',
    'Licey al Medio',
    'San José de Las Matas',
    'Tamboril',
    'Villa González',
    'Puñal',
    'Sabana Iglesia',
    'Baitoa',
    'San Ignacio de Sabaneta',
    'Villa Los Almácigos',
    'Monción',
    'Mao',
    'Esperanza',
    'Laguna Salada',
    'Bonao',
    'Maimón',
    'Piedra Blanca',
    'Monte Plata',
    'Bayaguana',
    'Sabana Grande de Boyá',
    'Yamasá',
    'Peralvillo',
    'Hato Mayor',
    'Sabana de La Mar',
    'El Valle',
    'San José de Ocoa',
    'Sabana Larga',
    'Rancho Arriba',
    'Santo Domingo Este',
    'Santo Domingo Oeste',
    'Santo Domingo Norte',
    'Boca Chica',
    'San Antonio de Guerra',
    'Los Alcarrizos',
    'Pedro Brand',
  ];

  filteredCitySuggestions: string[] = [...this.citySuggestions];
  private readonly citySuggestionSet = new Set(this.citySuggestions);

  readonly religionSuggestions = [
    'Católico',
    'Cristiano',
    'Evangélico',
    'Protestante',
    'Pentecostal',
    'Adventista',
    'Bautista',
    'Metodista',
    'Luterano',
    'Presbiteriano',
    'Anglicano',
    'Episcopal',
    'Menonita',
    'Mormón',
    'Testigo de Jehová',
    'Ortodoxo',
    'Judío',
    'Musulmán',
    'Hindú',
    'Budista',
    'Bahá’í',
    'Espiritista',
    'Santero',
    'Rastafari',
    'Ninguna religión',
    'Ateo',
    'Agnóstico',
    this.otherReligionOption,
  ];

  filteredReligionSuggestions: string[] = [...this.religionSuggestions];
  private readonly religionSuggestionSet = new Set(this.religionSuggestions);

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  filterCitySuggestions(event: { query: string }) {
    const query = this.normalizeSearchText(event.query);
    this.filteredCitySuggestions = this.citySuggestions.filter(city => this.normalizeSearchText(city).includes(query));
  }

  filterReligionSuggestions(event: { query: string }) {
    const query = this.normalizeSearchText(event.query);
    this.filteredReligionSuggestions = this.religionSuggestions.filter(religion => this.normalizeSearchText(religion).includes(query));
  }

  isOtherReligionSelected(group: FormGroup): boolean {
    return group.get(FormControlName.religion)?.value === this.otherReligionOption;
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
      [FormControlName.familiar_full_name]: ['', [Validators.required, this.minLettersValidator(3), this.personNameValidator()]],
      [FormControlName.familiar_phone]: ['', [Validators.required, PhoneValidator.validate, this.retreatParticipantPhoneValidator()]],
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

      this.normalizeReligionForEdit(data as RequestI);
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
    this.userService.getPublicFormUser(this.user_id).then(user => {
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
    this.formGroup.valueChanges.subscribe(() => {
      this.updateContactPhoneValidity();
      this.updateContactDuplicationValidity();
    });

    this.formGroup.get(FormControlName.have_wedding_date)?.valueChanges.subscribe(haveWeddingDate => {
      const weddingDateControl = this.formGroup.get(FormControlName.wedding_date);

      if (haveWeddingDate === true) {
        weddingDateControl?.setValidators([Validators.required, this.futureOrTodayDateValidator()]);
        weddingDateControl?.markAsPristine();
        weddingDateControl?.markAsUntouched();
      } else if (haveWeddingDate === false) {
        this.removeRequiredControl(weddingDateControl, null);
        weddingDateControl?.addValidators(this.futureOrTodayDateValidator());
      }
      weddingDateControl?.updateValueAndValidity({ emitEvent: false });
    });

    // Suscripción para campos de acompañante - She y He usando función helper
    this.setupCompanionFieldSubscription(FormGroupFields.she);
    this.setupCompanionFieldSubscription(FormGroupFields.he);

    // Suscripción para campos de identidad - She y He usando función helper
    this.setupIdentityNumberSubscription(FormGroupFields.she);
    this.setupIdentityNumberSubscription(FormGroupFields.he);

    this.setupReligionOtherSubscription(FormGroupFields.she);
    this.setupReligionOtherSubscription(FormGroupFields.he);

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

  private setupReligionOtherSubscription(groupName: FormGroupFields.she | FormGroupFields.he) {
    const group = this.formGroup.get(groupName);
    if (!group) return;

    group.get(FormControlName.religion)?.valueChanges.subscribe(religion => {
      const religionOtherControl = group.get(FormControlName.religion_other);

      if (religion === this.otherReligionOption) {
        this.setRequiredControl(religionOtherControl);
      } else {
        this.removeRequiredControl(religionOtherControl, '');
      }

      religionOtherControl?.updateValueAndValidity({ emitEvent: false });
    });
  }

  private syncReligionOtherControls(markInvalid = false): void {
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
      const group = this.formGroup.get(groupName);
      const religionControl = group?.get(FormControlName.religion);
      const religionOtherControl = group?.get(FormControlName.religion_other);

      if (!religionOtherControl) return;

      if (religionControl?.value === this.otherReligionOption) {
        religionOtherControl.setValidators([Validators.required]);
      } else {
        religionOtherControl.clearValidators();
        religionOtherControl.setValue('', { emitEvent: false });
      }

      religionOtherControl.updateValueAndValidity({ emitEvent: false });

      if (markInvalid && religionOtherControl.invalid) {
        religionOtherControl.markAsTouched();
        religionOtherControl.markAsDirty();
      }
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
    this.updateContactPhoneValidity(true);
  }

  /**
   * Limpia los validadores de solicitudes anteriores
   */
  private clearPreviousRequestValidators() {
    // Campos que necesitan validación de solicitudes anteriores
    const fieldsToValidate = [FormControlName.email, FormControlName.cell_phone, FormControlName.identity_number];

    // Limpiar validadores para ambos grupos (she y he)
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control) {
          control.setValidators(this.getBasePreviousRequestValidators(group, fieldName));

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
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
      const group = this.formGroup.get(groupName);

      fieldsToValidate.forEach(fieldName => {
        const control = group?.get(fieldName);
        if (control) {
          control.setValidators([...this.getBasePreviousRequestValidators(group, fieldName), PreviousRequestValidator.validate(currentRequests, fieldName, this.currentRequestId)]);

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
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
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

  private getBasePreviousRequestValidators(group: AbstractControl | null | undefined, fieldName: FormControlName): ValidatorFn[] {
    if (fieldName === FormControlName.email) {
      return [Validators.required, Validators.email];
    }

    if (fieldName === FormControlName.cell_phone) {
      return [Validators.required, PhoneValidator.validate];
    }

    if (fieldName === FormControlName.identity_number) {
      const identityType = group?.get(FormControlName.identity_type)?.value;
      return identityType === IdentityType.cedula ? [Validators.required, CedulaValidator.validate] : [Validators.required];
    }

    return [];
  }

  getFamilyInformationErrorMessage(groupName: FormGroupFields.she | FormGroupFields.he): string | null {
    const familyArray = this.getFamilyArray(groupName);
    if (familyArray?.hasError('missingCloseFamilyContact')) {
      return 'Al menos un familiar debe ser padre, madre, hermano/a, tío/a o abuelo/a.';
    }

    return null;
  }

  private getFamilyArray(groupName: FormGroupFields.she | FormGroupFields.he): FormArray {
    return this.formGroup.get([groupName, FormControlName.family_information]) as FormArray;
  }

  private minLettersValidator(min: number): ValidatorFn {
    return (control: AbstractControl) => {
      const value = control.value;
      if (!value || typeof value !== 'string') return null;

      const letterCount = value.match(/\p{L}/gu)?.length ?? 0;
      return letterCount >= min ? null : { minLetters: { min, actual: letterCount } };
    };
  }

  private personNameValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = String(control.value ?? '').trim();
      if (!value) return null;

      return /^[\p{L}\s]+$/u.test(value) ? null : { invalidName: true };
    };
  }

  private birthDateRangeValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const date = this.toDate(control.value);
      if (!date) return control.value ? { invalidDate: true } : null;

      const today = this.startOfDay(new Date());
      const birthDate = this.startOfDay(date);
      if (birthDate > today) return { futureDate: true };

      const age = this.calculateAgeFromDate(birthDate, today);
      return age >= 14 && age <= 100 ? null : { invalidAgeRange: { min: 14, max: 100 } };
    };
  }

  private futureOrTodayDateValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const date = this.toDate(control.value);
      if (!date) return control.value ? { invalidDate: true } : null;

      return this.startOfDay(date) >= this.startOfDay(new Date()) ? null : { pastDate: true };
    };
  }

  private citySuggestionValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const city = String(control.value ?? '').trim();
      if (!city) return null;

      return this.citySuggestionSet.has(city) ? null : { invalidCity: true };
    };
  }

  private religionSuggestionValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const religion = String(control.value ?? '').trim();
      if (!religion) return null;

      return this.religionSuggestionSet.has(religion) ? null : { invalidReligion: true };
    };
  }

  private normalizeReligionForEdit(data: RequestI): void {
    [data.she, data.he].forEach(person => {
      if (!person) return;

      const religion = String(person.religion ?? '').trim();
      if (!religion) return;

      const normalizedReligion = this.normalizeSearchText(religion);
      const canonicalReligion = this.religionSuggestions.find(option => this.normalizeSearchText(option) === normalizedReligion);

      if (canonicalReligion) {
        person.religion = canonicalReligion;
        return;
      }

      if (normalizedReligion === 'catolica') {
        person.religion = 'Católico';
        person.religion_other = '';
        return;
      }

      person.religion = this.otherReligionOption;
      person.religion_other = religion;
    });
  }

  private hasCloseFamilyContactValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      if (!(control instanceof FormArray)) return null;

      const allFamilyMembersCompleted = control.controls.every(familyMember => {
        const name = familyMember.get(FormControlName.familiar_full_name)?.value;
        const phone = familyMember.get(FormControlName.familiar_phone)?.value;
        const relationship = familyMember.get(FormControlName.familiar_relationship)?.value;

        return Boolean(this.normalizeName(name) && this.normalizePhone(phone) && relationship);
      });

      if (!allFamilyMembersCompleted) return null;

      const hasCloseFamily = control.controls.some(familyMember => this.isCloseFamilyRelationship(familyMember.get(FormControlName.familiar_relationship)?.value));
      return hasCloseFamily ? null : { missingCloseFamilyContact: true };
    };
  }

  private retreatParticipantPhoneValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const phone = this.normalizePhone(control.value);
      if (!phone) return null;

      return this.getRetreatParticipantPhones().has(phone) ? { retreatParticipantPhone: true } : null;
    };
  }

  private updateContactDuplicationValidity(): void {
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
      this.clearContactDuplicationErrors(groupName);

      const repeatedContactErrors = this.getRepeatedContactErrors(groupName);
      repeatedContactErrors.forEach(({ controls, message }) => {
        controls.forEach(control => {
          this.setControlError(control, 'duplicatedEmergencyFamilyContact', { message });
          control.markAsTouched();
          control.markAsDirty();
        });
      });
    });
  }

  private clearContactDuplicationErrors(groupName: FormGroupFields.she | FormGroupFields.he): void {
    const group = this.formGroup.get(groupName);
    const familyInformation = this.getFamilyArray(groupName);
    const controls = [
      ...familyInformation.controls.flatMap(familyMember => [familyMember.get(FormControlName.familiar_full_name), familyMember.get(FormControlName.familiar_phone)]),
      group?.get(FormControlName.emergency_full_name),
      group?.get(FormControlName.emergency_phone),
    ].filter(Boolean) as AbstractControl[];

    controls.forEach(control => this.removeControlError(control, 'duplicatedEmergencyFamilyContact'));
  }

  private getRepeatedContactErrors(groupName: FormGroupFields.she | FormGroupFields.he): { controls: AbstractControl[]; message: string }[] {
    const group = this.formGroup.get(groupName);
    const familyInformation = this.getFamilyArray(groupName);
    const seenPhones = new Map<string, true>();
    const seenContacts = new Map<string, true>();
    const repeatedContactErrors: { controls: AbstractControl[]; message: string }[] = [];

    familyInformation.controls.forEach(familyMember => {
      const nameControl = familyMember.get(FormControlName.familiar_full_name);
      const phoneControl = familyMember.get(FormControlName.familiar_phone);
      const name = this.normalizeName(nameControl?.value);
      const phone = this.normalizePhone(phoneControl?.value);
      const contactKey = name && phone ? `${name}|${phone}` : '';

      if (contactKey && seenContacts.has(contactKey)) {
        repeatedContactErrors.push({
          controls: [nameControl!, phoneControl!],
          message: 'No repita el mismo nombre y teléfono entre familiares.',
        });
      } else if (phone && seenPhones.has(phone)) {
        repeatedContactErrors.push({
          controls: [phoneControl!],
          message: 'No repita el mismo teléfono entre familiares.',
        });
      }

      if (contactKey) seenContacts.set(contactKey, true);
      if (phone) seenPhones.set(phone, true);
    });

    const emergencyNameControl = group?.get(FormControlName.emergency_full_name);
    const emergencyPhoneControl = group?.get(FormControlName.emergency_phone);
    const emergencyName = this.normalizeName(emergencyNameControl?.value);
    const emergencyPhone = this.normalizePhone(emergencyPhoneControl?.value);
    const emergencyContactKey = emergencyName && emergencyPhone ? `${emergencyName}|${emergencyPhone}` : '';

    if (emergencyContactKey && seenContacts.has(emergencyContactKey) && emergencyNameControl && emergencyPhoneControl) {
      repeatedContactErrors.push({
        controls: [emergencyNameControl, emergencyPhoneControl],
        message: 'No repita el mismo nombre y teléfono entre familiares y contacto de emergencia.',
      });
    } else if (emergencyPhone && seenPhones.has(emergencyPhone) && emergencyPhoneControl) {
      repeatedContactErrors.push({
        controls: [emergencyPhoneControl],
        message: 'No repita el mismo teléfono entre familiares y contacto de emergencia.',
      });
    }

    return repeatedContactErrors;
  }

  private setControlError(control: AbstractControl, errorKey: string, errorValue: unknown = true): void {
    control.setErrors({ ...(control.errors ?? {}), [errorKey]: errorValue });
  }

  private removeControlError(control: AbstractControl, errorKey: string): void {
    if (!control.errors?.[errorKey]) return;

    const { [errorKey]: _, ...errors } = control.errors;
    control.setErrors(Object.keys(errors).length ? errors : null);
  }

  private getRetreatParticipantPhones(): Set<string> {
    const currentRequestId = this.currentRequestId;
    const phones = new Set<string>();

    [this.sheGroup, this.heGroup].forEach(group => {
      const phone = this.normalizePhone(group?.get(FormControlName.cell_phone)?.value);
      if (phone) phones.add(phone);
    });

    this.previousRequests()
      .filter(request => !currentRequestId || request.id !== currentRequestId)
      .forEach(request => {
        [request.she?.cell_phone, request.he?.cell_phone].forEach(phoneValue => {
          const phone = this.normalizePhone(phoneValue);
          if (phone) phones.add(phone);
        });
      });

    return phones;
  }

  private updateContactPhoneValidity(markTouched = false): void {
    ([FormGroupFields.she, FormGroupFields.he] as const).forEach(groupName => {
      const familyArray = this.getFamilyArray(groupName);
      const group = this.formGroup.get(groupName);
      const phoneControls = [
        ...familyArray.controls.map(familyMember => familyMember.get(FormControlName.familiar_phone)),
        group?.get(FormControlName.emergency_phone),
      ].filter(Boolean) as AbstractControl[];

      phoneControls.forEach(control => {
        control.updateValueAndValidity({ emitEvent: false });
        if (markTouched && control.value && control.invalid) {
          control.markAsTouched();
          control.markAsDirty();
        }
      });
    });
  }

  private isCloseFamilyRelationship(value: unknown): boolean {
    return this.closeFamilyRelationships.has(this.normalizeRelationship(value));
  }

  private normalizeRelationship(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizeName(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeSearchText(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizePhone(value: unknown): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'object' && 'seconds' in value) {
      const date = new Date(Number((value as { seconds: number }).seconds) * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private calculateAgeFromDate(birthDate: Date, today: Date): number {
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
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
    if (!this.validateFormBeforeSubmit()) {
      Ss.toastService.warning({
        message: 'Revisa los campos faltantes o inválidos antes de enviar',
        title: 'Formulario incompleto',
      });
      return;
    }

    this.loading.set(false); // No ponemos loading hasta confirmar
    this.hasReadInformation.set(false); // Reset checkbox
    this.confirmationDialogVisible.set(true);
  }

  private validateFormBeforeSubmit(): boolean {
    this.syncReligionOtherControls(true);
    this.validateControlTree(this.formGroup);
    this.updateContactPhoneValidity(true);
    this.updateContactDuplicationValidity();
    this.formGroup.markAllAsTouched();
    this.markInvalidControlsAsDirty(this.formGroup);

    return this.isFormValid;
  }

  private validateControlTree(control: AbstractControl): void {
    if (control instanceof FormGroup) {
      Object.values(control.controls).forEach(childControl => this.validateControlTree(childControl));
    }

    if (control instanceof FormArray) {
      control.controls.forEach(childControl => this.validateControlTree(childControl));
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  private markInvalidControlsAsDirty(control: AbstractControl): void {
    if (control instanceof FormGroup) {
      Object.values(control.controls).forEach(childControl => this.markInvalidControlsAsDirty(childControl));
    }

    if (control instanceof FormArray) {
      control.controls.forEach(childControl => this.markInvalidControlsAsDirty(childControl));
    }

    if (control.invalid) {
      control.markAsDirty();
    }
  }

  onConfirmSubmit() {
    if (!this.hasReadInformation()) {
      Ss.toastService.warning({
        message: 'Debes confirmar que has leído la información antes de enviar',
        title: 'Confirmación requerida',
      });
      return;
    }

    if (!this.validateFormBeforeSubmit()) {
      this.confirmationDialogVisible.set(false);
      Ss.toastService.warning({
        message: 'Revisa los campos faltantes o inválidos antes de enviar',
        title: 'Formulario incompleto',
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
        request = await this.requestService.createRequest({ payload: formData, refString: this.requestRefString(), retreat });
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
