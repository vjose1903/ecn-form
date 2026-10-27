import { Component, input, output, OnDestroy } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStatusInfo } from '@core/entities/request/request.model';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';

import { RetreatClass } from '@core/entities/retreat/retreat.class';

@Component({
  selector: 'request-card',
  imports: [CardModule, TagModule, SkeletonModule],
  templateUrl: './request-card.html',
  styleUrl: './request-card.scss',
})
export class RequestCard implements OnDestroy {
  request = input<RequestClass>();
  retreat = input<RetreatClass | null>();
  status = input<RequestStatusInfo>();
  skeleton = input(false);
  archived = input(false);
  showStatus = input(true);
  showRetreatMeta = input(false);
  selectionMode = input(false);
  selected = input(false);
  selectionChange = output<RequestClass>();
  afterClose = input<(() => void | Promise<void>) | undefined>();
  private holdTimer?: ReturnType<typeof setTimeout>;
  private holdTriggered = false;
  private suppressClick = false;

  getPaymentStatus(): 'none' | 'paid' | 'partial' | 'complete' {
    const payments = this.request()?.pre_retreat_payments ?? [];
    const paid = payments.reduce((total, payment) => total + payment.amount, 0);
    if (paid <= 0) return 'none';

    const amountPerPerson = this.retreat()?.amount_per_person ?? 0;
    if (amountPerPerson <= 0) return 'paid';
    return paid >= amountPerPerson * 2 ? 'complete' : 'partial';
  }

  showPreRetreatIndicators(): boolean {
    const startDate = this.retreat()?.start_date?.slice(0, 10);
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
    const todayDate = this.todayInSantoDomingo();
    return todayDate <= startDate;
  }

  showInformedStatus(): boolean {
    const startDate = this.retreat()?.start_date?.slice(0, 10);
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
    return this.todayInSantoDomingo() < startDate;
  }

  confirmationStatus(): 'confirmed' | 'unconfirmed' | null {
    const retreat = this.retreat();
    const startDate = retreat?.start_date?.slice(0, 10);
    const endDate = retreat?.end_date?.slice(0, 10);
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;

    const today = this.todayInSantoDomingo();
    const lastVisibleDate = new Date(`${endDate}T00:00:00Z`);
    lastVisibleDate.setUTCDate(lastVisibleDate.getUTCDate() + 7);
    const lastVisibleDateText = lastVisibleDate.toISOString().slice(0, 10);
    if (today < startDate || today > lastVisibleDateText) return null;

    return this.request()?.isConfirmed === true ? 'confirmed' : 'unconfirmed';
  }

  private todayInSantoDomingo(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.request() || this.skeleton() || this.selectionMode()) return;
    const menuAnchor = event.currentTarget as HTMLElement;
    this.holdTriggered = false;
    this.holdTimer = setTimeout(() => {
      this.holdTriggered = true;
      this.suppressClick = true;
      void this.request()?.openView({
        retreat: this.retreat(),
        isArchived: this.archived(),
        actionsOnly: true,
        menuAnchor,
      });
    }, 250);
  }

  onPointerUp(): void {
    this.clearHoldTimer();
    if (this.holdTriggered) setTimeout(() => (this.suppressClick = false));
  }

  onPointerCancel(): void {
    this.clearHoldTimer();
    this.holdTriggered = false;
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (!this.selectionMode() || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const request = this.request();
    if (request) this.selectionChange.emit(request);
  }

  ngOnDestroy(): void {
    this.clearHoldTimer();
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  async onCardClick(event?: MouseEvent): Promise<void> {
    if (this.selectionMode()) {
      event?.preventDefault();
      const request = this.request();
      if (request) this.selectionChange.emit(request);
      return;
    }
    if (this.suppressClick) {
      this.suppressClick = false;
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    if (this.request()) {
      await this.request()?.openView({
        retreat: this.retreat(),
        isArchived: this.archived(),
      });
      await this.afterClose()?.();
    }
  }
}
