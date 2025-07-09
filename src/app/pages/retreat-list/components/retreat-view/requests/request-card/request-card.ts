import { Component, input,  } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStatus, RequestStatusInfo } from '@core/entities/request/request.model';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'request-card',
  imports: [CardModule, TagModule, SkeletonModule, CommonModule],
  templateUrl: './request-card.html',
  styleUrl: './request-card.scss',
})
export class RequestCard {
  request = input<RequestClass>();
  status = input<RequestStatusInfo>();
  skeleton = input(false);

  onCardClick(): void {
    if (this.request()) {
      console.log(this.request());
    }
  }
}
