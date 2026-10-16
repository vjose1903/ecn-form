import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { PreRetreatPaymentI } from '@core/entities/request/request.model';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TableModule } from 'primeng/table';
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
}

@Component({
  selector: 'app-retreat-payments-modal',
  imports: [CommonModule, TableModule, TagModule],
  templateUrl: './retreat-payments-modal.html',
  styleUrl: './retreat-payments-modal.scss',
})
export class RetreatPaymentsModal implements OnInit {
  private config = inject(DynamicDialogConfig);
  payments = signal<RetreatPaymentRow[]>([]);
  total = signal(0);

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
}
