import { Component, input } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStatusInfo } from '@core/entities/request/request.model';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { CommonModule } from '@angular/common';
import { RetreatClass } from '@core/entities/retreat/retreat.class';

@Component({
  selector: 'request-card',
  imports: [CardModule, TagModule, SkeletonModule, CommonModule],
  templateUrl: './request-card.html',
  styleUrl: './request-card.scss',
})
export class RequestCard {
  request = input<RequestClass>();
  retreat = input<RetreatClass>();
  status = input<RequestStatusInfo>();
  skeleton = input(false);

  onCardClick(): void {
    if (this.request()) {
      this.request()?.openView();
    }
  }
}
