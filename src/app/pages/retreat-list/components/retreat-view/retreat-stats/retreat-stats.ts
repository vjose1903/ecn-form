import { Component, computed, input, output } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { Ss } from '@core/services/singleton.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatPaymentsModal } from './retreat-payments-modal/retreat-payments-modal';

@Component({
  selector: 'app-retreat-stats',
  standalone: true,
  templateUrl: './retreat-stats.html',
  styleUrl: './retreat-stats.scss',
})
export class RetreatStats {
  requests = input<RequestClass[]>([]);
  amountPerPerson = input<number | null>(null);
  retreat = input.required<RetreatClass>();
  close = output<void>();
  canReadInformed = computed(() => this.requests().some(request => request.canReadDetailSection('informed')));

  stats = computed(() => {
    const requests = this.requests();
    const target = (this.amountPerPerson() ?? 0) * 2;
    return requests.reduce((result, request) => {
      result.informed += Number(request.is_informado === true);
      const paid = (request.pre_retreat_payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
      result.amountPaid += paid;
      if (paid > 0) {
        result.paid += 1;
        if (target > 0) result[paid >= target ? 'complete' : 'partial'] += 1;
      } else {
        result.unpaid += 1;
      }
      return result;
    }, { informed: 0, amountPaid: 0, paid: 0, complete: 0, partial: 0, unpaid: 0 });
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
