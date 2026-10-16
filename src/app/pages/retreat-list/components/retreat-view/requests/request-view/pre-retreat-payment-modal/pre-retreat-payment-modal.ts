import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-pre-retreat-payment-modal',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, DividerLine],
  templateUrl: './pre-retreat-payment-modal.html',
  styleUrl: './pre-retreat-payment-modal.scss',
})
export class PreRetreatPaymentModal {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(DynamicDialogConfig);
  readonly ref = inject(DynamicDialogRef);
  private readonly requestService = inject(RequestService);

  readonly today = new Date();
  readonly loading = signal(false);
  readonly receipt = signal<File | null>(null);
  readonly request = this.config.data.request as RequestClass;
  readonly retreat = this.config.data.retreat as RetreatClass;
  readonly isArchived = Boolean(this.config.data.isArchivedView);
  readonly payments = this.request.pre_retreat_payments;
  readonly form = this.fb.group({
    payment_date: [new Date(), Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  onReceiptSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;

    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      Ss.toastService.warning({ message: 'Selecciona una imagen de recibo de máximo 5 MB', title: 'Archivo no válido' });
      this.receipt.set(null);
      (event.target as HTMLInputElement).value = '';
      return;
    }

    this.receipt.set(file);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const { payment_date, amount } = this.form.getRawValue();
    const receipt = this.receipt();

    if (this.form.invalid || !payment_date || !amount || !receipt) {
      Ss.toastService.warning({ message: 'Completa la fecha, el monto y adjunta la imagen del recibo', title: 'Datos incompletos' });
      return;
    }

    this.loading.set(true);
    try {
      const updatedRequest = await this.requestService.addPreRetreatPayment({
        request: this.request,
        retreat: this.retreat,
        payment: { payment_date, amount, receipt },
        isArchived: this.isArchived,
      });
      Ss.toastService.success({ message: 'Pago de pre retiro guardado correctamente', title: 'Pago registrado' });
      this.ref.close(updatedRequest);
    } catch (error) {
      console.error('Error al guardar el pago de pre retiro:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error));
      Ss.toastService.error({ message: error instanceof Error ? error.message : 'No se pudo guardar el pago. Intenta nuevamente.', title: 'Error' });
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(amount);
  }
}
