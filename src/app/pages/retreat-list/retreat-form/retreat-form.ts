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

@Component({
  selector: 'app-retreat-form',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, FormsModule, DatePickerModule, InputNumberModule, TextareaModule, FormErrorMsgComponent, SelectModule, TitleCasePipe],
  templateUrl: './retreat-form.html',
  styleUrl: './retreat-form.scss',
})
export class RetreatForm implements OnInit {
  deviceDetectorService = inject(DeviceDetectorService);
  retreatService = inject(RetreatService);
  retreatHomeService = inject(RetreatHomeService);
  cdr = inject(ChangeDetectorRef);

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

  // Opciones para modalidad mixta
  mixedModalityOptions = this.modalityOptions.slice(0, 2);

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  get form(): FormGroup | null {
    return this.formGroup() || null;
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

  constructor(private fb: FormBuilder, public ref: DynamicDialogRef, public config: DynamicDialogConfig) {
    this.setupFormEffects();
  }

  ngOnInit() {
    this.initForm();
    this.subscribeToForm();
    this.getRetreatHomes();
  }

  initForm() {
    const form = this.fb.group({
      [FormControlName.number]: [null, [Validators.required, Validators.min(1)]],
      [FormControlName.retreat_home]: [null, [Validators.required]],
      [FormControlName.max_request_date]: [{ value: null, disabled: false }, [Validators.required]],
      [FormControlName.start_date]: [{ value: null, disabled: true }, [Validators.required]],
      [FormControlName.end_date]: [{ value: null, disabled: true }, [Validators.required]],
      [FormControlName.modality]: [{ value: null, disabled: true }, [Validators.required]],
      [FormControlName.is_active]: [true],
      [FormControlName.accept_requests]: [true],
    });

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
          // Habilitar todos los campos del formulario
          const allControls = Object.keys(form.controls);
          allControls.forEach(controlName => {
            form.get(controlName)?.enable();
          });
        }
      }
    });
  }

  subscribeToForm() {
    if (!this.form) return;

    // Suscripción a cambios en la fecha límite de solicitudes
    this.form.get(FormControlName.max_request_date)?.valueChanges.subscribe((maxRequestDate: any) => {
      const startDateControl = this.form?.get(FormControlName.start_date);
      const endDateControl = this.form?.get(FormControlName.end_date);
      const modalityControl = this.form?.get(FormControlName.modality);

      if (maxRequestDate) {
        startDateControl?.enable();
        startDateControl?.setValidators([Validators.required]);

        if (!startDateControl?.value) {
          endDateControl?.disable();
          endDateControl?.clearValidators();
          endDateControl?.setValue(null);
          modalityControl?.disable();
          modalityControl?.clearValidators();
        }
      } else {
        startDateControl?.disable();
        startDateControl?.clearValidators();
        startDateControl?.setValue(null);
        endDateControl?.disable();
        endDateControl?.clearValidators();
        endDateControl?.setValue(null);
        modalityControl?.disable();
        modalityControl?.clearValidators();
        modalityControl?.setValue(null);
      }

      startDateControl?.updateValueAndValidity({ emitEvent: false });
      endDateControl?.updateValueAndValidity({ emitEvent: false });
      modalityControl?.updateValueAndValidity({ emitEvent: false });
    });

    // Suscripción a cambios en la fecha de inicio
    this.form?.get(FormControlName.start_date)?.valueChanges.subscribe((startDate: any) => {
      const endDateControl = this.form?.get(FormControlName.end_date);
      const modalityControl = this.form?.get(FormControlName.modality);

      if (startDate) {
        endDateControl?.enable();
        endDateControl?.setValidators([Validators.required]);
        this.checkAndEnableModality();
      } else {
        endDateControl?.disable();
        endDateControl?.clearValidators();
        endDateControl?.setValue(null);
        modalityControl?.disable();
        modalityControl?.clearValidators();
        modalityControl?.setValue(null);
      }

      endDateControl?.updateValueAndValidity({ emitEvent: false });
      modalityControl?.updateValueAndValidity({ emitEvent: false });
    });

    // Suscripción a cambios en la fecha de fin
    this.form?.get(FormControlName.end_date)?.valueChanges.subscribe((endDate: any) => {
      if (endDate) {
        this.checkAndEnableModality();
      } else {
        const modalityControl = this.form?.get(FormControlName.modality);
        modalityControl?.disable();
        modalityControl?.clearValidators();
        modalityControl?.setValue(null);
        modalityControl?.updateValueAndValidity({ emitEvent: false });
      }
    });

    // Suscripción a cambios en la modalidad
    this.form?.get(FormControlName.modality)?.valueChanges.subscribe((modality: any) => {
      if (modality === RetreatModality.MIXTO) {
        this.generateMixedModalityDates();
      } else {
        this.mixedModalityDates.set([]);
        this.clearMixedModalityData();
      }
    });

    // Ejecutar lógica inicial
    setTimeout(() => {
      this.form?.get(FormControlName.max_request_date)?.updateValueAndValidity();
    }, 0);
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
      mixedData[dateInfo.date] = currentData[dateInfo.date] || null as any;
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

  async onSubmit() {
    const form = this.formGroup();
    if (!form) return;

    // Verificar que el formulario principal sea válido
    if (!form.valid) {
      Ss.toastService.error({ message: 'Por favor, complete todos los campos requeridos' });
      return;
    }

    // Verificar que los campos de modalidad mixta sean válidos si es necesario
    if (form.get(FormControlName.modality)?.value === RetreatModality.MIXTO) {
      const dates = this.mixedModalityDates();
      const mixedData = this.mixedModalityData();
      const hasInvalidMixedModality = dates.some(dateInfo => !mixedData[dateInfo.date]);

      if (hasInvalidMixedModality) {
        Ss.toastService.error({ message: 'Por favor, selecciona la modalidad para todos los días del retiro' });
        return;
      }
    }

    this.loading.set(true);

    // Obtener los datos del formulario
    const formData = form.getRawValue();

    // Agregar los datos de modalidad mixta si es necesario
    if (formData.modality === RetreatModality.MIXTO) {
      formData.mixedModalityData = this.mixedModalityData();
    }

    console.log('formData >>>> ', JSON.parse(JSON.stringify(formData)));

    const retreatHome = this.retreatHomes().find(retreatHome => retreatHome.id === formData.retreat_home);
    if (retreatHome) {
      const retreat = new RetreatHome(retreatHome);
      formData.retreat_home = await retreat.getRetreatHomeReference();
    }

    console.log('formData >>>> ', formData);
    setTimeout(() => {
      this.loading.set(false);
    }, 2000);

    // Guardar en Firebase usando el servicio actualizado
    // this.retreatService
    //   .createRetreat(formData as RetreatI)
    //   .then(retreat => {
    //     Ss.toastService.success({ message: 'Retiro creado correctamente' });
    //     console.log('Retiro creado:', retreat);

    //     // Cerrar el dialog y devolver los datos
    //     this.ref.close(formData);
    //   })
    //   .catch(error => {
    //     Ss.toastService.error({ message: 'Error al crear el retiro' });
    //     console.error('Error al crear el retiro:', error);
    //   })
    //   .finally(() => {
    //     this.formGroup.enable();
    //     this.loading.set(false);
    //   });
  }

  onCancel() {
    this.ref.close();
  }
}
