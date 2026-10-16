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
