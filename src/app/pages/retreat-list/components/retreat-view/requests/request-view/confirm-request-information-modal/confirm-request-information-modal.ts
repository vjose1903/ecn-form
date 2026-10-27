import {CommonModule} from '@angular/common';
import {Component, inject, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {InputMaskModule} from 'primeng/inputmask';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {AngularSvgIconModule} from 'angular-svg-icon';
import {RequestClass} from '@core/entities/request/request.class';
import {RequestI} from '@core/entities/request/request.model';
import {RequestService} from '@core/entities/request/request.service';
import {RetreatClass} from '@core/entities/retreat/retreat.class';
import {Ss} from '@core/services/singleton.service';
import {PhoneValidator} from '@core/typescript/validators/validate-phone';

@Component({
  selector: 'app-confirm-request-information-modal',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, InputMaskModule, AngularSvgIconModule],
  templateUrl: './confirm-request-information-modal.html',
  styleUrl: './confirm-request-information-modal.scss',
})
export class ConfirmRequestInformationModal {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(DynamicDialogConfig);
  readonly ref = inject(DynamicDialogRef);
  private readonly requestService = inject(RequestService);
  readonly request = this.config.data.request as RequestClass;
  readonly retreat = this.config.data.retreat as RetreatClass;
  readonly isConfirmed = this.request.isConfirmed;
  readonly loading = signal(false);

  readonly form = this.fb.group({
    she: this.fb.group({
      full_name: [this.request.she.full_name ?? '', [Validators.required, Validators.maxLength(180)]],
      cell_phone: [this.request.she.cell_phone ?? '', [Validators.required, PhoneValidator.validate]],
    }),
    he: this.fb.group({
      full_name: [this.request.he.full_name ?? '', [Validators.required, Validators.maxLength(180)]],
      cell_phone: [this.request.he.cell_phone ?? '', [Validators.required, PhoneValidator.validate]],
    }),
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.loading() || this.form.invalid) return;
    this.loading.set(true);
    try {
      const raw = this.form.getRawValue();
      const updated = await this.requestService.confirmRequestInformation(this.request, this.retreat, {
        she: {full_name: raw.she.full_name!.trim(), cell_phone: raw.she.cell_phone!.trim()},
        he: {full_name: raw.he.full_name!.trim(), cell_phone: raw.he.cell_phone!.trim()},
      });
      Ss.toastService.success({title: 'Información confirmada', message: 'Los nombres y teléfonos quedaron guardados.'});
      this.ref.close(updated);
    } catch (error) {
      console.error('Error al confirmar la información de la solicitud:', JSON.stringify(error instanceof Error ? {name: error.name, message: error.message, stack: error.stack} : error));
      Ss.toastService.error({title: 'No se pudo confirmar', message: error instanceof Error ? error.message : 'Intenta nuevamente.'});
    } finally {
      this.loading.set(false);
    }
  }
}
