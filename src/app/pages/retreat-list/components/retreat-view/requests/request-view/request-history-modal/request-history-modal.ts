import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RequestHistoryChangeI, RequestHistoryI, RequestAction } from '@core/entities/request/request.model';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-request-history-modal',
  imports: [CommonModule, TagModule],
  templateUrl: './request-history-modal.html',
  styleUrl: './request-history-modal.scss',
})
export class RequestHistoryModal implements OnInit {
  protected readonly RequestAction = RequestAction;

  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);

  loading = signal(true);
  history = signal<RequestHistoryI[]>([]);

  ngOnInit(): void {
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const request = this.config.data.request;

    try {
      this.loading.set(true);
      this.history.set(await this.requestService.getRequestHistory(request.id));
    } catch (error) {
      console.error('Error cargando trazo de la solicitud:', error);
      Ss.toastService.error({
        message: 'No se pudo cargar el trazo de la solicitud',
        title: 'Error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  getActionLabel(action: RequestAction): string {
    const labels: Record<RequestAction, string> = {
      [RequestAction.NEW]: 'Nueva',
      [RequestAction.UPDATED]: 'Actualizada',
      [RequestAction.ARCHIVED]: 'Archivada',
      [RequestAction.DESARCHIVED]: 'Desarchivada',
      [RequestAction.TRANSFERRED]: 'Transferida',
    };

    return labels[action];
  }

  getActionSeverity(action: RequestAction): 'secondary' | 'info' | 'warn' | 'success' {
    const severities: Record<RequestAction, 'secondary' | 'info' | 'warn' | 'success'> = {
      [RequestAction.NEW]: 'success',
      [RequestAction.UPDATED]: 'info',
      [RequestAction.ARCHIVED]: 'warn',
      [RequestAction.DESARCHIVED]: 'success',
      [RequestAction.TRANSFERRED]: 'secondary',
    };

    return severities[action];
  }

  getActionCardClass(action: RequestAction): string {
    const classes: Record<RequestAction, string> = {
      [RequestAction.NEW]: 'history-card--new',
      [RequestAction.UPDATED]: 'history-card--updated',
      [RequestAction.ARCHIVED]: 'history-card--archived',
      [RequestAction.DESARCHIVED]: 'history-card--desarchived',
      [RequestAction.TRANSFERRED]: 'history-card--transferred',
    };

    return classes[action];
  }

  formatHappenedAt(value: RequestHistoryI['happened_at']): string {
    if (!value) {
      return 'Fecha no disponible';
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Fecha no disponible';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const hours24 = date.getHours();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    const hours = String(hours12).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes} ${period}`;
  }

  shouldShowRetreat(item: RequestHistoryI): boolean {
    return item.action !== RequestAction.DESARCHIVED && item.action !== RequestAction.TRANSFERRED && item.action !== RequestAction.UPDATED && Boolean(item.retreat_label);
  }

  isTransferred(item: RequestHistoryI): boolean {
    return item.action === RequestAction.TRANSFERRED;
  }

  isDetailedChange(change: string | RequestHistoryChangeI): change is RequestHistoryChangeI {
    return typeof change !== 'string';
  }
}
