import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStatus } from '@core/entities/request/request.model';
import { Ss } from '@core/services/singleton.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatPaymentsModal } from './retreat-payments-modal/retreat-payments-modal';
import { RequestService } from '@core/entities/request/request.service';

@Component({
  selector: 'app-retreat-stats',
  standalone: true,
  templateUrl: './retreat-stats.html',
  styleUrl: './retreat-stats.scss',
})
export class RetreatStats {
  private requestService = inject(RequestService);
  private loadSequence = 0;
  loading = signal(true);
  archivedCount = signal(0);
  archivedRequests = signal<RequestClass[]>([]);
  requests = input<RequestClass[]>([]);
  amountPerPerson = input<number | null>(null);
  retreat = input.required<RetreatClass>();
  close = output<void>();
  canReadInformed = computed(() => this.requests().some(request => request.canReadDetailSection('informed')));

  constructor() {
    effect(() => {
      const retreat = this.retreat();
      const sequence = ++this.loadSequence;
      this.loading.set(true);
      void Promise.all([
        this.requestService.getArchivedRequestCountsForRetreats([retreat]),
        this.requestService.getArchivedRequests({retreatId: retreat.id}),
      ]).then(async ([counts, archivedRequests]) => {
        if (sequence !== this.loadSequence) return;
        const summaries = await this.requestService.getPaymentSummariesForRequests(archivedRequests.map(request => request.id));
        if (sequence !== this.loadSequence) return;
        archivedRequests.forEach(request => {
          if (summaries[request.id]) request.payments_summary = summaries[request.id] ?? {};
        });
        this.archivedCount.set(counts[retreat.id] ?? 0);
        this.archivedRequests.set(archivedRequests);
      }).catch((error: unknown) => {
        console.error('No se pudo cargar la cantidad de solicitudes archivadas:', JSON.stringify(error instanceof Error ? {name: error.name, message: error.message} : error));
      }).finally(() => {
        if (sequence === this.loadSequence) this.loading.set(false);
      });
    });
  }

  paymentSummary = computed(() => {
    const requests = [...this.requests(), ...this.archivedRequests()];
    const paidTotal = requests.reduce((sum, request) => sum + (request.pre_retreat_payments ?? []).reduce((requestSum, payment) => requestSum + payment.amount, 0), 0);
    const paidCouples = requests.filter(request => (request.pre_retreat_payments ?? []).some(payment => payment.amount > 0)).length;
    const returnedTotal = requests.reduce((sum, request) => sum + Math.max(0, Number(request.payments_summary.refund_recorded_total ?? 0)), 0);
    const retainedTotal = requests.reduce((sum, request) => sum + Math.max(0, Number(request.payments_summary.refund_retained_amount ?? 0)), 0);
    const pendingRefundAmount = requests.reduce((sum, request) => {
      const summary = request.payments_summary;
      return sum + Math.max(0, Number(summary.refund_due_amount ?? 0) - Number(summary.refund_recorded_total ?? 0));
    }, 0);
    const hasRetentionOrPendingRefund = requests.filter(request => request.status === RequestStatus.ARCHIVED).some(request => {
      const summary = request.payments_summary;
      const returned = Math.max(0, Number(summary.refund_recorded_total ?? 0));
      const due = Math.max(0, Number(summary.refund_due_amount ?? 0));
      const retained = Math.max(0, Number(summary.refund_retained_amount ?? 0));
      return retained > 0 || returned > 0 || Math.max(0, due - returned) > 0;
    });
    return {paidTotal, paidCouples, returnedTotal, retainedTotal, pendingRefundAmount, receivedTotal: Math.max(0, paidTotal - returnedTotal), hasRetentionOrPendingRefund};
  });

  stats = computed(() => {
    const requests = this.requests();
    const paymentRequests = [...requests, ...this.archivedRequests()];
    const target = (this.amountPerPerson() ?? 0) * 2;
    const result = requests.reduce((result, request) => {
      result.informed += Number(request.is_informado === true);
      return result;
    }, { informed: 0, amountPaid: 0, paid: 0, complete: 0, partial: 0, unpaid: 0 });
    paymentRequests.forEach(request => {
      const paid = (request.pre_retreat_payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
      result.amountPaid += paid;
      if (paid > 0) {
        result.paid += 1;
        if (target > 0) result[paid >= target ? 'complete' : 'partial'] += 1;
      } else {
        result.unpaid += 1;
      }
    });
    result.amountPaid = this.paymentSummary().receivedTotal;
    return result;
  });

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(amount);
  }

  openPayments(): void {
    Ss.dialogService?.open(RetreatPaymentsModal, {
      header: 'Pagos recibidos',
      width: 'min(60rem, 92vw)',
      style: { maxHeight: 'calc(100dvh - 2rem)' },
      contentStyle: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: { requests: this.requests(), amountPerPerson: this.amountPerPerson(), retreat: this.retreat() },
      breakpoints: { '640px': '96vw' },
    });
  }
}
