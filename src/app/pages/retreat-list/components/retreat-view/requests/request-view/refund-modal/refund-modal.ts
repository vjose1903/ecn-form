import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-refund-modal',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule],
  templateUrl: './refund-modal.html',
  styleUrl: './refund-modal.scss',
})
export class RefundModal implements OnDestroy {
  private fb = inject(FormBuilder);
  private config = inject(DynamicDialogConfig);
  private ref = inject(DynamicDialogRef);
  private requestService = inject(RequestService);
  request = this.config.data.request as RequestClass;
  retreat = this.config.data.retreat as RetreatClass;
  loading = signal(false);
  today = new Date();
  receipt = signal<File | null>(null);
  receiptPreviewUrl = signal<string | null>(null);
  pending = Math.max(0, Number(this.request.payments_summary.refund_due_amount ?? 0) - Number(this.request.payments_summary.refund_recorded_total ?? 0));
  form = this.fb.group({refund_date: [new Date(), Validators.required], amount: [this.pending as number | null, [Validators.required, Validators.min(0.01), Validators.max(this.pending)]]});

  selectReceipt(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    if (file && (!/^image\/(jpeg|png|webp|heic)$/.test(file.type) || file.size > 5 * 1024 * 1024)) {
      Ss.toastService.warning({title: 'Archivo no válido', message: 'Selecciona una imagen de hasta 5 MB.'});
      this.clearReceiptPreview();
      this.receipt.set(null);
      (event.target as HTMLInputElement).value = '';
      return;
    }
    this.clearReceiptPreview();
    this.receipt.set(file);
    this.receiptPreviewUrl.set(URL.createObjectURL(file));
  }

  ngOnDestroy(): void { this.clearReceiptPreview(); }

  private clearReceiptPreview(): void {
    const previewUrl = this.receiptPreviewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    this.receiptPreviewUrl.set(null);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const {refund_date, amount} = this.form.getRawValue();
    if (this.form.invalid || !refund_date || !amount || amount > this.pending || this.loading()) return;
    this.loading.set(true);
    try {
      await this.requestService.recordRefund({request: this.request, retreat: this.retreat, amount, refundDate: refund_date, receipt: this.receipt() ?? undefined});
      Ss.toastService.success({title: 'Devolución registrada', message: 'El movimiento quedó guardado en el trazo de la solicitud.'});
      this.ref.close(true);
    } catch (error) {
      console.error('Error al registrar la devolución:', JSON.stringify(error instanceof Error ? {name: error.name, message: error.message} : error));
      Ss.toastService.error({title: 'Error', message: error instanceof Error ? error.message : 'No se pudo registrar la devolución.'});
    } finally {
      this.loading.set(false);
    }
  }

  close(): void { this.ref.close(); }
}
