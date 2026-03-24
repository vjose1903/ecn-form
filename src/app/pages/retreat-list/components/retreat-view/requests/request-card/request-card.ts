import { Component, input } from '@angular/core';
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
export class RequestCard {
  request = input<RequestClass>();
  retreat = input<RetreatClass | null>();
  status = input<RequestStatusInfo>();
  skeleton = input(false);
  archived = input(false);
  showStatus = input(true);
  showRetreatMeta = input(false);
  afterClose = input<(() => void | Promise<void>) | undefined>();

  async onCardClick(): Promise<void> {
    if (this.request()) {
      await this.request()?.openView({
        retreat: this.retreat(),
        isArchived: this.archived(),
      });
      await this.afterClose()?.();
    }
  }
}
