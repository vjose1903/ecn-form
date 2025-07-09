import { Ss } from '@core/services/singleton.service';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { RequestClass } from '@core/entities/request/request.class';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ViewItem } from '@core/components/view-item/view-item';
import { CoupleType, RequestStatus } from '@core/entities/request/request.model';
import { CoupleView } from './couple-view/couple-view';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { DynamicDialogRef } from 'primeng/dynamicdialog';

@Component({
  selector: 'app-request-view',
  imports: [CommonModule, TagModule, DividerLine, ButtonModule, ViewItem, CoupleView],
  templateUrl: './request-view.html',
  styleUrl: './request-view.scss',
})
export class RequestView implements OnInit {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  requestService = inject(RequestService);

  loading = signal(false);
  request!: RequestClass;
  retreat!: RetreatClass;
  CoupleType = CoupleType;
  RequestStatus = RequestStatus;

  ngOnInit(): void {
    this.request = this.config.data.request;
    this.retreat = this.config.data.retreat;
  }

  toggleStatus(status: RequestStatus) {
    this.loading.set(true);
    const payload = { id: this.request.id, status };
    this.requestService
      .updateRequest(payload, this.retreat)
      .then(() => {
        if (status === RequestStatus.ACCEPTED) {
          Ss.toastService.success({ message: 'Solicitud aceptada correctamente', title: 'Éxito' });
        } else {
          Ss.toastService.success({ message: 'Solicitud rechazada correctamente', title: 'Éxito' });
        }

        this.loading.set(false);
        this.ref.close();
      })
      .catch(() => {
        Ss.toastService.error({ message: 'Error al actualizar la solicitud', title: 'Error' });
        this.loading.set(false);
      });
  }
}
