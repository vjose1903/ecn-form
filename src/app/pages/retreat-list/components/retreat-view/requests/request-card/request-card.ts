import { Component, input } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStatus, RequestStatusInfo } from '@core/entities/request/request.model';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-request-card',
  imports: [CardModule, TagModule],
  templateUrl: './request-card.html',
  styleUrl: './request-card.scss',
})
export class RequestCard {
  request = input.required<RequestClass>();
  status = input.required<RequestStatusInfo>();

  onCardClick(): void {
    console.log(this.request());
  }
}
