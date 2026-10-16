import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { PreRetreatPaymentI } from '@core/entities/request/request.model';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

type PaymentType = 'Parcial' | 'Completivo' | 'Sin clasificar';

interface RetreatPaymentRow {
  requestId: string;
  couple: string;
  paymentDate: Date;
  amount: number;
  registrationTime: number;
  originalOrder: number;
  type: PaymentType;
  receipt: PreRetreatPaymentI;
}

@Component({
  selector: 'app-retreat-payments-modal',
  imports: [CommonModule, TableModule, TagModule, DialogModule, SkeletonModule],
  templateUrl: './retreat-payments-modal.html',
  styleUrl: './retreat-payments-modal.scss',
})
export class RetreatPaymentsModal implements OnInit, OnDestroy {
  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);
  payments = signal<RetreatPaymentRow[]>([]);
  total = signal(0);
  receiptPreview = signal<PreRetreatPaymentI | null>(null);
  receiptPreviewUrl = signal<string | null>(null);
  loadingReceipt = signal(false);
  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    const url = this.receiptPreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
    const amountPerCouple = Number(this.config.data.amountPerPerson ?? 0) * 2;
    let originalOrder = 0;
    const rows = ((this.config.data.requests ?? []) as RequestClass[]).flatMap(request =>
      (request.pre_retreat_payments ?? []).map((payment: PreRetreatPaymentI) => {
        const idTime = Number(payment.id.split('-')[0]);
        const paymentDate = new Date(payment.payment_date);
        return {
          requestId: request.id,
          couple: `${request.she.full_name} & ${request.he.full_name}`,
          paymentDate,
          amount: payment.amount,
          registrationTime: Number.isFinite(idTime) && idTime > 0 ? idTime : paymentDate.getTime(),
          originalOrder: originalOrder++,
          type: 'Sin clasificar' as PaymentType,
          receipt: payment,
        };
      })
    ).sort((left, right) => left.paymentDate.getTime() - right.paymentDate.getTime() || left.registrationTime - right.registrationTime || left.originalOrder - right.originalOrder);

    const paidByRequest = new Map<string, number>();
    for (const payment of rows) {
      if (amountPerCouple <= 0) continue;
      const accumulated = (paidByRequest.get(payment.requestId) ?? 0) + payment.amount;
      paidByRequest.set(payment.requestId, accumulated);
      payment.type = accumulated < amountPerCouple ? 'Parcial' : 'Completivo';
    }

    this.payments.set(rows);
    this.total.set(rows.reduce((sum, payment) => sum + payment.amount, 0));
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(amount);
  }

  formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async showReceipt(payment: PreRetreatPaymentI): Promise<void> {
    this.receiptPreview.set(payment);
    this.loadingReceipt.set(true);
    try {
      const url = await this.requestService.loadPreRetreatReceiptPreview(payment);
      if (this.destroyed || this.receiptPreview()?.id !== payment.id) {
        URL.revokeObjectURL(url);
        return;
      }
      const previousUrl = this.receiptPreviewUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.receiptPreviewUrl.set(url);
    } catch (error) {
      console.error('No se pudo cargar el recibo del pago:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      this.receiptPreview.set(null);
      this.loadingReceipt.set(false);
      Ss.toastService.error({ title: 'Recibo no disponible', message: 'No se pudo cargar la imagen del recibo' });
    }
  }

  onReceiptImageLoad(): void {
    this.loadingReceipt.set(false);
  }

  onReceiptImageError(): void {
    this.loadingReceipt.set(false);
    Ss.toastService.error({ title: 'Recibo no disponible', message: 'No se pudo mostrar la imagen del recibo' });
  }

  onReceiptVisibilityChange(visible: boolean): void {
    if (visible) return;
    this.receiptPreview.set(null);
    this.loadingReceipt.set(false);
    const url = this.receiptPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.receiptPreviewUrl.set(null);
  }
}
