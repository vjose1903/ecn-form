import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
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
      <div class="request-view-header__copy">
        <span class="request-view-header__eyebrow">Vista general</span>
        <h2 class="request-view-header__title">{{ config.header }}</h2>
        <p class="request-view-header__description">Datos de la pareja y seguimiento de su solicitud.</p>
      </div>
      <p-button icon="pi pi-history" severity="secondary" pTooltip="Ver trazo de la solicitud" (click)="openHistoryModal()" />
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; width: 100%; }
    .request-view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; min-width: 0; width: 100%; }
    .request-view-header__copy { position: relative; min-width: 0; padding-left: .9rem; }
    .request-view-header__copy::before { position: absolute; inset: 0 auto 0 0; width: 4px; border-radius: 999px; background: #c12c3b; content: ''; }
    .request-view-header__eyebrow { display: block; margin-bottom: .25rem; color: #c12c3b; font-size: .68rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .request-view-header__title { margin: 0; color: #172033; font-size: clamp(1.3rem, 2.2vw, 1.9rem); font-weight: 800; letter-spacing: -.04em; line-height: 1.15; overflow-wrap: anywhere; }
    .request-view-header__description { margin: .35rem 0 0; color: #64748b; font-size: .8rem; font-weight: 400; }

  `,
})
export class RequestViewHeader {
  protected config = inject(DynamicDialogConfig<{ request: RequestClass; retreat?: RetreatClass | null; isArchivedView?: boolean }>);

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
        retreat: this.config.data.retreat,
        isArchivedView: this.config.data.isArchivedView,
      },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
  }
}
