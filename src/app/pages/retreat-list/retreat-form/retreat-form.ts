import { ChangeDetectorRef, Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { Ss } from '@core/services/singleton.service';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { FormControlName, FormFieldId } from './retreat-form.model';
import { DeviceDetectorService } from '@core/services/device-detector.service';
import { DeviceE } from '@core/models/device-detector.model';
import { FormsModule } from '@angular/forms';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { RetreatI, RetreatModality, RetreatModalityType } from '@core/entities/retreat/retreat.model';
import { SelectModule } from 'primeng/select';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { fun } from '@core/services/functions.service';
import { yesNoOptions } from '@core/typescript/constants';
import { SelectButtonModule } from 'primeng/selectbutton';

@Component({
  selector: 'app-retreat-form',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, FormsModule, DatePickerModule, InputNumberModule, TextareaModule, FormErrorMsgComponent, SelectModule, TitleCasePipe, SelectButtonModule],
  templateUrl: './retreat-form.html',
  styleUrl: './retreat-form.scss',
})
export class RetreatForm implements OnInit {
  private deviceDetectorService = inject(DeviceDetectorService);
  private retreatService = inject(RetreatService);
  private retreatHomeService = inject(RetreatHomeService);
  private config = inject(DynamicDialogConfig);
  private cdr = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);
  private ref = inject(DynamicDialogRef);

  retreat!: Retreat;

  formGroup = signal<FormGroup | undefined>(undefined);
  loading = signal(false);
  FormFieldId = FormFieldId;
  FormControlName = FormControlName;

  retreatHomes = signal<RetreatHome[]>([]);
  mixedModalityDates = signal<{ date: string; label: string }[]>([]);
  mixedModalityData = signal<{ [key: string]: RetreatModalityType }>({});

  // Opciones para el dropdown de modalidad
  modalityOptions = [
    { label: 'Presencial', value: RetreatModality.PRESENCIAL },
    { label: 'Virtual', value: RetreatModality.VIRTUAL },
    { label: 'Mixto', value: RetreatModality.MIXTO },
  ];

  yesNoOptions = yesNoOptions;

  // Opciones para modalidad mixta
  mixedModalityOptions = this.modalityOptions.slice(0, 2);

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  get form(): FormGroup | null {
    return this.formGroup() || null;
  }

  get isEdit(): boolean {
    return fun.hasValue(this.config?.data?.retreat?.id);
  }

  get isFormValid(): boolean {
    const form = this.formGroup();
    if (!form || !form.valid) return false;

    // Si es modalidad mixta, verificar que todas las fechas tengan valor
    if (form.get(FormControlName.modality)?.value === RetreatModality.MIXTO) {
      const dates = this.mixedModalityDates();
      const mixedData = this.mixedModalityData();

      return dates.every(dateInfo => mixedData[dateInfo.date]);
    }

    return true;
  }

  constructor() {
    this.setupFormEffects();
  }

  ngOnInit() {
    if (this.config?.data?.retreat) {
      this.retreat = this.config.data.retreat;
    }

    this.createForm(this.retreat);
    this.subscribeToForm();
    this.getRetreatHomes();
  }

  createForm(retreat: Retreat | undefined) {
    console.log('%c retreat', 'color: red; font-weight: bold;', retreat);

    const form = this.fb.group({
      [FormControlName.id]: [retreat?.id ?? null, []],
      [FormControlName.number]: [retreat?.number ?? null, [Validators.required, Validators.min(1)]],
      [FormControlName.retreat_home]: [retreat?.retreatHomeData?.id ?? null, [Validators.required]],
      [FormControlName.community_name]: [retreat?.community_name ?? null, []],
      [FormControlName.max_request_date]: [{ value: retreat?.max_request_date ? new Date(retreat.max_request_date) : null, disabled: false }, [Validators.required]],
      [FormControlName.start_date]: [{ value: retreat?.start_date ? new Date(retreat.start_date) : null, disabled: true }, [Validators.required]],
      [FormControlName.end_date]: [{ value: retreat?.end_date ? new Date(retreat.end_date) : null, disabled: true }, [Validators.required]],
      [FormControlName.modality]: [{ value: retreat?.modality ?? null, disabled: true }, [Validators.required]],
      [FormControlName.is_active]: [retreat?.is_active ?? true],
      [FormControlName.accept_requests]: [retreat?.accept_requests ?? true],
    });

    console.log('%c retreat', 'color: red; font-weight: bold;', retreat);
    console.log('%c retreat', 'color: yellow; font-weight: bold;', form.getRawValue());

    this.formGroup.set(form);
  }

  getRetreatHomes() {
    this.retreatHomeService.loadingRetreatHomes$.subscribe(loading => {
      if (!loading) {
        this.retreatHomes.set(this.retreatHomeService.retreatHomes);
      }
    });
  }

  test() {
    const form = this.formGroup();
    if (form) {
      form.enabled ? form.disable() : form.enable();
    }
    this.cdr.detectChanges();
  }

  private setupFormEffects(): void {
    effect(() => {
      const form = this.formGroup();
      if (form) {
        if (this.loading()) {
          // Deshabilitar todos los campos del formulario
          const allControls = Object.keys(form.controls);
          allControls.forEach(controlName => {
            form.get(controlName)?.disable();
          });
        } else {
          // Solo habilitar los campos que deben estar habilitados inicialmente
          // max_request_date, number, retreat_home, is_active, accept_requests
          form.get(FormControlName.max_request_date)?.enable();
          form.get(FormControlName.number)?.enable();
          form.get(FormControlName.retreat_home)?.enable();
          form.get(FormControlName.is_active)?.enable();
          form.get(FormControlName.accept_requests)?.enable();

          // Los campos start_date, end_date, modality permanecen deshabilitados
          // hasta que se completen las validaciones correspondientes
        }
      }
    });
  }

  subscribeToForm() {
    if (!this.form) return;

    // Configurar suscripciones a cambios en el formulario
    this.setupMaxRequestDateSubscription();
    this.setupStartDateSubscription();
    this.setupEndDateSubscription();
    this.setupModalitySubscription();

    // Ejecutar lógica inicial
    setTimeout(() => {
      this.form?.get(FormControlName.max_request_date)?.updateValueAndValidity({ emitEvent: false });
    }, 0);
  }

  /**
   * Configura la suscripción a cambios en la fecha límite de solicitudes
   */
  private setupMaxRequestDateSubscription(): void {
    this.form?.get(FormControlName.max_request_date)?.valueChanges.subscribe((maxRequestDate: any) => {
      const controls = this.getFormControls();

      if (maxRequestDate) {
        controls.startDate?.enable();
        controls.startDate?.setValidators([Validators.required]);

        if (!controls.startDate?.value) {
          this.resetControls([controls.endDate, controls.modality]);
        }
      } else {
        this.resetControls([controls.startDate, controls.endDate, controls.modality]);
      }

      this.updateControlsValidity(controls);
    });
  }

  /**
   * Configura la suscripción a cambios en la fecha de inicio
   */
  private setupStartDateSubscription(): void {
    this.form?.get(FormControlName.start_date)?.valueChanges.subscribe((startDate: any) => {
      const controls = this.getFormControls();

      if (startDate) {
        controls.endDate?.enable();
        controls.endDate?.setValidators([Validators.required]);
        this.checkAndEnableModality();
      } else {
        this.resetControls([controls.endDate, controls.modality]);
      }

      this.updateControlsValidity(controls);
    });
  }

  /**
   * Configura la suscripción a cambios en la fecha de fin
   */
  private setupEndDateSubscription(): void {
    this.form?.get(FormControlName.end_date)?.valueChanges.subscribe((endDate: any) => {
      if (endDate) {
        this.checkAndEnableModality();
      } else {
        this.resetControls([this.form?.get(FormControlName.modality)]);
      }
    });
  }

  /**
   * Configura la suscripción a cambios en la modalidad
   */
  private setupModalitySubscription(): void {
    this.form?.get(FormControlName.modality)?.valueChanges.subscribe((modality: any) => {
      if (modality === RetreatModality.MIXTO) {
        this.generateMixedModalityDates();
      } else {
        this.clearMixedModalityData();
      }
    });
  }

  /**
   * Obtiene los controles del formulario para evitar repetición
   */
  private getFormControls() {
    return {
      startDate: this.form?.get(FormControlName.start_date),
      endDate: this.form?.get(FormControlName.end_date),
      modality: this.form?.get(FormControlName.modality),
    };
  }

  /**
   * Resetea múltiples controles del formulario
   */
  private resetControls(controls: any[]): void {
    controls.forEach(control => {
      if (control) {
        control.disable();
        control.clearValidators();
        control.setValue(null);
      }
    });
  }

  /**
   * Actualiza la validez de múltiples controles
   */
  private updateControlsValidity(controls: any): void {
    Object.values(controls).forEach((control: any) => {
      control?.updateValueAndValidity({ emitEvent: false });
    });
  }

  /**
   * Verifica y habilita la modalidad si start_date y end_date tienen valor
   */
  private checkAndEnableModality(): void {
    const form = this.formGroup();
    if (!form) return;

    const startDate = form.get(FormControlName.start_date)?.value;
    const endDate = form.get(FormControlName.end_date)?.value;
    const modalityControl = form.get(FormControlName.modality);

    if (startDate && endDate) {
      // Habilitar modalidad solo si ambas fechas están definidas
      modalityControl?.enable();
      modalityControl?.setValidators([Validators.required]);
    } else {
      // Deshabilitar modalidad si falta alguna fecha
      modalityControl?.disable();
      modalityControl?.clearValidators();
      // No establecer valor por defecto, mantener null
    }

    modalityControl?.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Genera las fechas para modalidad mixta
   */
  generateMixedModalityDates() {
    const form = this.formGroup();
    if (!form) return;

    const startDate = form.get(FormControlName.start_date)?.value;
    const endDate = form.get(FormControlName.end_date)?.value;

    if (!startDate || !endDate) {
      this.mixedModalityDates.set([]);
      this.initializeMixedModalityData();
      return;
    }

    const dates: { date: string; label: string }[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('es-ES', { weekday: 'long' });
      const day = d.getDate();
      const month = d.toLocaleDateString('es-ES', { month: 'long' });
      const label = `${dayName} ${day} ${month}`;

      dates.push({ date: dateString, label });
    }

    this.mixedModalityDates.set(dates);
    this.initializeMixedModalityData();
  }

  /**
   * Inicializa los datos de modalidad mixta preservando valores existentes
   */
  private initializeMixedModalityData(): void {
    const dates = this.mixedModalityDates();
    const currentData = this.mixedModalityData();
    const mixedData: { [key: string]: RetreatModalityType } = {};

    dates.forEach(dateInfo => {
      // Preservar el valor existente si existe, sino usar null
      mixedData[dateInfo.date] = currentData[dateInfo.date] || (null as any);
    });

    this.mixedModalityData.set(mixedData);
  }

  /**
   * Limpia los datos de modalidad mixta
   */
  private clearMixedModalityData(): void {
    this.mixedModalityData.set({});
  }

  /**
   * Actualiza el valor de modalidad para una fecha específica
   */
  updateMixedModalityValue(date: string, value: RetreatModalityType): void {
    const currentData = this.mixedModalityData();
    const updatedData = { ...currentData, [date]: value };
    this.mixedModalityData.set(updatedData);
  }

  openGoogleMaps() {
    window.open('https://www.google.com/maps', '_blank');
  }

  /**
   * Envía el formulario
   */
  async onSubmit() {
    const form = this.formGroup();
    if (!form || !form.valid) {
      Ss.toastService.error({ message: 'Por favor, completa todos los campos requeridos', title: 'Formulario inválido' });
      return;
    }

    try {
      this.loading.set(true);

      const formData = form.getRawValue();
      const validationErrors = this.validateFormData(formData);

      if (validationErrors.length > 0) {
        Ss.toastService.error({ message: validationErrors.join('\n'), title: 'Datos inválidos' });
        return;
      }

      const result = await this.processFormSubmission(formData);

      // Cerrar el dialog y devolver los datos
      this.ref.close(result);
    } catch (error) {
      console.error('Error al procesar formulario:', error);
      this.handleSubmissionError(error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Valida los datos del formulario
   */
  private validateFormData(formData: any): string[] {
    const errors: string[] = [];

    if (!formData.number || formData.number < 1) {
      errors.push('El número del retiro es requerido y debe ser mayor a 0');
    }

    if (!formData.retreat_home) {
      errors.push('La casa de retiro es requerida');
    }

    if (!formData.max_request_date) {
      errors.push('La fecha límite de solicitudes es requerida');
    }

    if (!formData.start_date) {
      errors.push('La fecha de inicio es requerida');
    }

    if (!formData.end_date) {
      errors.push('La fecha de fin es requerida');
    }

    if (!formData.modality) {
      errors.push('La modalidad es requerida');
    }

    // Validar modalidad mixta
    if (formData.modality === RetreatModality.MIXTO) {
      const dates = this.mixedModalityDates();
      const mixedData = this.mixedModalityData();
      const hasInvalidMixedModality = dates.some(dateInfo => !mixedData[dateInfo.date]);

      if (hasInvalidMixedModality) {
        errors.push('Por favor, selecciona la modalidad para todos los días del retiro');
      }
    }

    return errors;
  }

  /**
   * Procesa el envío del formulario
   */
  private async processFormSubmission(formData: any): Promise<RetreatI> {
    // Agregar los datos de modalidad mixta si es necesario
    if (formData.modality === RetreatModality.MIXTO) {
      formData.mixedModalityData = this.mixedModalityData();
    }

    // Obtener referencia de la casa de retiro
    const retreatHome = this.retreatHomes().find(retreatHome => retreatHome.id === formData.retreat_home);
    if (retreatHome) {
      const retreatHomeInstance = new RetreatHome(retreatHome);
      formData.retreat_home = await retreatHomeInstance.getRetreatHomeReference();
    }

    // Crear o actualizar el retiro
    let retreat: RetreatI;
    if (formData.id) {
      retreat = await this.retreatService.updateRetreat(formData);
    } else {
      retreat = await this.retreatService.createRetreat(formData);
    }

    return retreat;
  }

  /**
   * Maneja errores de envío
   */
  private handleSubmissionError(error: any): void {
    let message = 'Error inesperado al procesar el formulario';

    if (error instanceof Error) {
      if (error.message.includes('red') || error.message.includes('conexión')) {
        message = 'Error de conexión. Verifique su internet e intente nuevamente.';
      } else {
        message = error.message;
      }
    }

    Ss.toastService.error({ message, title: 'Error' });
  }

  onCancel() {
    this.ref.close();
  }
}
