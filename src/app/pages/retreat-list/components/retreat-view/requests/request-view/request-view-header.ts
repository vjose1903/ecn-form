import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Ss } from '@core/services/singleton.service';
import { RequestHistoryModal } from './request-history-modal/request-history-modal';

@Component({
  selector: 'app-request-view-header',
  imports: [CommonModule, ButtonModule, TooltipModule],
  template: `
    <div class="request-view-header">
      <span class="request-view-header__title">{{ config.header }}</span>
      <p-button icon="pi pi-history" severity="secondary" pTooltip="Ver trazo de la solicitud" (click)="openHistoryModal()" />
    </div>
  `,
  styles: `
    .request-view-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }

    .request-view-header__title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: var(--p-dialog-title-font-weight);
      font-size: var(--p-dialog-title-font-size);
    }
  `,
})
export class RequestViewHeader {
  protected config = inject(DynamicDialogConfig<{ request: RequestClass }>);

  openHistoryModal(): void {
    const dialogService = Ss.dialogService;
    const request = this.config.data?.request;

    if (!dialogService || !request) {
      return;
    }

    dialogService.open(RequestHistoryModal, {
      header: 'Trazo de la solicitud',
      width: '40rem',
      styleClass: 'request-history-dialog',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        request,
      },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
  }
}
