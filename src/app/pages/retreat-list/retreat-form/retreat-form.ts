import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { DropdownModule } from 'primeng/dropdown';
import { TextareaModule } from 'primeng/textarea';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { Ss } from '@core/services/singleton.service';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { FormControlName, FormFieldId } from './retreat-form.model';
import { DeviceDetectorService } from '@core/services/device-detector.service';
import { DeviceE } from '@core/models/device-detector.model';
import { FormsModule } from '@angular/forms';
import { fun } from '@core/services/functions.service';
import { UrlValidator } from '@core/typescript/validate-url';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { RetreatI } from '@core/entities/retreat/retreat.model';

@Component({
  selector: 'app-retreat-form',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, FormsModule, DatePickerModule, InputNumberModule, DropdownModule, TextareaModule, FormErrorMsgComponent],
  templateUrl: './retreat-form.html',
  styleUrl: './retreat-form.scss',
})
export class RetreatForm implements OnInit {
  deviceDetectorService = inject(DeviceDetectorService);
  retreatService = inject(RetreatService);

  formGroup!: FormGroup;
  loading = signal(false);
  FormFieldId = FormFieldId;
  FormControlName = FormControlName;

  // Opciones para el dropdown
  retreatTypes = [
    { label: 'Retiro por Emergencia', value: 'emergency' },
    { label: 'Retiro Programado', value: 'scheduled' },
    { label: 'Retiro por Salud', value: 'health' },
    { label: 'Otro', value: 'other' },
  ];

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  constructor(private fb: FormBuilder, public ref: DynamicDialogRef, public config: DynamicDialogConfig) {}

  ngOnInit() {
    this.initForm();
    this.subscribeToForm();
  }

  initForm() {
    this.formGroup = this.fb.group({
      [FormControlName.number]: [null, [Validators.required, Validators.min(1)]],
      [FormControlName.start_date]: [null, [Validators.required]],
      [FormControlName.max_request_date]: [{ value: null, disabled: true }, [Validators.required]],
      [FormControlName.end_date]: [{ value: null, disabled: true }, [Validators.required]],
      [FormControlName.location]: [null, [Validators.required, UrlValidator.validate]],
      [FormControlName.price]: [null, [Validators.required, Validators.min(0)]],
      [FormControlName.is_active]: [true],
      [FormControlName.accept_requests]: [true],
    });
  }

  subscribeToForm() {
    let isUpdating = false;

    // Suscripción a cambios en la fecha de inicio
    this.formGroup.get(FormControlName.start_date)?.valueChanges.subscribe(startDate => {
      if (isUpdating) return;

      isUpdating = true;
      const maxRequestDateControl = this.formGroup.get(FormControlName.max_request_date);
      const endDateControl = this.formGroup.get(FormControlName.end_date);

      if (startDate) {
        // Habilitar max_request_date
        maxRequestDateControl?.enable();
        maxRequestDateControl?.setValidators([Validators.required]);

        // Si ya hay una fecha de fin, verificar que sea válida
        const endDate = endDateControl?.value;
        if (endDate && endDate < startDate) {
          endDateControl?.setValue(null);
        }
      } else {
        // Deshabilitar max_request_date y end_date si no hay fecha de inicio
        maxRequestDateControl?.disable();
        maxRequestDateControl?.clearValidators();
        endDateControl?.disable();
        endDateControl?.clearValidators();

        // Limpiar valores
        maxRequestDateControl?.setValue(null);
        endDateControl?.setValue(null);
      }

      maxRequestDateControl?.updateValueAndValidity({ emitEvent: false });
      endDateControl?.updateValueAndValidity({ emitEvent: false });
      isUpdating = false;
    });

    // Suscripción a cambios en la fecha máxima de solicitudes
    this.formGroup.get(FormControlName.max_request_date)?.valueChanges.subscribe(maxRequestDate => {
      if (isUpdating) return;

      isUpdating = true;
      const endDateControl = this.formGroup.get(FormControlName.end_date);
      const startDate = this.formGroup.get(FormControlName.start_date)?.value;

      if (maxRequestDate && startDate) {
        // Habilitar end_date
        endDateControl?.enable();
        endDateControl?.setValidators([Validators.required]);

        // Si hay una fecha de fin menor que maxRequestDate, limpiarla
        const currentEndDate = endDateControl?.value;
        if (currentEndDate && currentEndDate < maxRequestDate) {
          endDateControl?.setValue(null);
        }
      } else {
        // Deshabilitar end_date si no hay max_request_date
        endDateControl?.disable();
        endDateControl?.clearValidators();
        endDateControl?.setValue(null);
      }

      endDateControl?.updateValueAndValidity({ emitEvent: false });
      isUpdating = false;
    });

    // Suscripción a cambios en la fecha de fin
    this.formGroup.get(FormControlName.end_date)?.valueChanges.subscribe(endDate => {
      if (isUpdating) return;

      isUpdating = true;
      const maxRequestDateControl = this.formGroup.get(FormControlName.max_request_date);
      const startDate = this.formGroup.get(FormControlName.start_date)?.value;

      if (endDate && startDate) {
        // Verificar que max_request_date no exceda end_date
        const currentMaxRequestDate = maxRequestDateControl?.value;
        if (currentMaxRequestDate && currentMaxRequestDate > endDate) {
          maxRequestDateControl?.setValue(null);
        }
      }

      maxRequestDateControl?.updateValueAndValidity({ emitEvent: false });
      isUpdating = false;
    });
  }

  openGoogleMaps() {
    window.open('https://www.google.com/maps', '_blank');
  }

  onSubmit() {
    if (this.formGroup.valid) {
      this.loading.set(true);

      // Simular envío del formulario

      const formData = this.formGroup.getRawValue();

      this.formGroup.disable();

      // Aquí puedes agregar la lógica para guardar en Firebase
      console.log('Datos del formulario:', formData);
      // this.retreatService
      //   .create(formData as RetreatI)
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
      //     this.loading.set(false);
      //   });

      this.loading.set(false);
    } else {
      Ss.toastService.error({ message: 'Por favor, complete todos los campos requeridos' });
    }
  }

  onCancel() {
    this.ref.close();
  }
}
