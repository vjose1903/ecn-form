import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { PreRetreatPaymentI, RequestHistoryChangeI, RequestHistoryI, RequestAction } from '@core/entities/request/request.model';
import { RequestClass } from '@core/entities/request/request.class';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-request-history-modal',
  imports: [CommonModule, TagModule, DialogModule, ButtonModule, TooltipModule, SkeletonModule],
  templateUrl: './request-history-modal.html',
  styleUrl: './request-history-modal.scss',
})
export class RequestHistoryModal implements OnInit, OnDestroy {
  protected readonly RequestAction = RequestAction;

  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);
  private get receiptContext() {
    const request = this.config.data.request as RequestClass;
    const retreat = this.config.data.retreat as RetreatClass | null;
    if (!retreat?.city_id) throw new Error('No se encontró la ciudad del retiro');
    return {cityId: retreat.city_id, requestId: request.id};
  }

  loading = signal(true);
  history = signal<RequestHistoryI[]>([]);
  receiptPreview = signal<RequestHistoryI | null>(null);
  receiptPreviewUrls = signal<Record<string, string>>({});
  loadingReceiptPreviews = signal(false);
  openedReceiptPreviewUrl = signal<string | null>(null);
  deletingEventId = signal<string | null>(null);
  private destroyed = false;

  ngOnInit(): void {
    void this.loadHistory();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    Object.values(this.receiptPreviewUrls()).forEach(URL.revokeObjectURL);
  }

  private async loadHistory(): Promise<void> {
    const request = this.config.data.request;

    try {
      this.loading.set(true);
      const history = (await this.requestService.getRequestHistory(request.id)).map(item => this.hydratePaymentReceipt(item, request.pre_retreat_payments ?? []));
      this.history.set(history);
      void this.loadReceiptPreviews(history);
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

  getActionLabel(item: RequestHistoryI): string {
    if (item.message === 'Pago de pre retiro registrado') return 'Pago';
    if (item.message === 'Pareja marcada como informada') return 'Informada';
    if (item.message === 'Pareja marcada como no informada') return 'No informada';

    const labels: Record<RequestAction, string> = {
      [RequestAction.NEW]: 'Nueva',
      [RequestAction.UPDATED]: 'Actualizada',
      [RequestAction.ARCHIVED]: 'Archivada',
      [RequestAction.DESARCHIVED]: 'Desarchivada',
      [RequestAction.TRANSFERRED]: 'Transferida',
    };

    return labels[item.action];
  }

  getActionSeverity(item: RequestHistoryI): 'secondary' | 'info' | 'warn' | 'success' {
    if (item.message === 'Pago de pre retiro registrado') return 'warn';
    if (this.isInformationStatusChange(item)) return 'info';

    const severities: Record<RequestAction, 'secondary' | 'info' | 'warn' | 'success'> = {
      [RequestAction.NEW]: 'success',
      [RequestAction.UPDATED]: 'info',
      [RequestAction.ARCHIVED]: 'warn',
      [RequestAction.DESARCHIVED]: 'success',
      [RequestAction.TRANSFERRED]: 'secondary',
    };

    return severities[item.action];
  }

  getActionCardClass(item: RequestHistoryI): string {
    if (item.message === 'Pago de pre retiro registrado') return 'history-card--payment';
    if (item.message === 'Pareja marcada como informada') return 'history-card--informed';
    if (item.message === 'Pareja marcada como no informada') return 'history-card--not-informed';

    const classes: Record<RequestAction, string> = {
      [RequestAction.NEW]: 'history-card--new',
      [RequestAction.UPDATED]: 'history-card--updated',
      [RequestAction.ARCHIVED]: 'history-card--archived',
      [RequestAction.DESARCHIVED]: 'history-card--desarchived',
      [RequestAction.TRANSFERRED]: 'history-card--transferred',
    };

    return classes[item.action];
  }

  isInformationStatusChange(item: RequestHistoryI): boolean {
    return item.message === 'Pareja marcada como informada' || item.message === 'Pareja marcada como no informada';
  }

  isPaymentEvent(item: RequestHistoryI): boolean {
    return item.message === 'Pago de pre retiro registrado';
  }

  canRevertInformation(item: RequestHistoryI): boolean {
    const latestInformationEvent = this.history().find(event => this.isInformationStatusChange(event));
    return item.message === 'Pareja marcada como informada'
      && latestInformationEvent?.id === item.id
      && Boolean(this.config.data.request.is_informado);
  }

  confirmRemoveEvent(item: RequestHistoryI): void {
    const isPayment = this.isPaymentEvent(item);
    Ss.confirmationService.confirm({
      header: isPayment ? 'Eliminar pago' : 'Revertir información',
      message: isPayment
        ? 'Se eliminará el pago, su movimiento del trazo y la imagen del recibo. ¿Deseas continuar?'
        : 'La pareja volverá a quedar como no informada y se eliminará este movimiento del trazo. ¿Deseas continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: isPayment ? 'Eliminar pago' : 'Revertir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => void this.removeHistoryEvent(item),
    });
  }

  private async removeHistoryEvent(item: RequestHistoryI): Promise<void> {
    const request = this.config.data.request as RequestClass;
    this.deletingEventId.set(item.id);
    try {
      const result = await this.requestService.removeHistoryEvent({
        request,
        retreat: this.config.data.retreat as RetreatClass | null,
        event: item,
        isArchived: Boolean(this.config.data.isArchivedView),
      });
      if (!result.deleted) {
        Ss.toastService.error({ title: 'No se eliminó el pago', message: 'El recibo no pudo borrarse. El pago sigue registrado; puedes intentar de nuevo.' });
        return;
      }
      Object.assign(request, new RequestClass(result.request));
      const previewUrl = this.receiptPreviewUrls()[item.id];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      this.receiptPreviewUrls.update(previews => {
        const { [item.id]: _removed, ...remaining } = previews;
        return remaining;
      });
      this.history.update(items => items.filter(event => event.id !== item.id));
      Ss.toastService.success({
        title: 'Trazo actualizado',
        message: this.isPaymentEvent(item) ? 'El pago y su movimiento fueron eliminados' : 'La pareja quedó como no informada y se revirtió el movimiento',
      });
    } catch (error) {
      console.error('Error al revertir el movimiento del trazo:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error));
      Ss.toastService.error({ title: 'No se pudo completar la acción', message: 'El movimiento no fue eliminado' });
    } finally {
      this.deletingEventId.set(null);
    }
  }

  getChangeValue(item: RequestHistoryI, label: string): string {
    const change = item.changes?.find((entry): entry is RequestHistoryChangeI => typeof entry !== 'string' && entry.label === label);
    return change?.next_value || 'No disponible';
  }

  formatPaymentAmount(item: RequestHistoryI): string {
    const value = this.getChangeValue(item, 'Monto');
    const amount = Number(value);
    return value !== 'No disponible' && Number.isFinite(amount)
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)
      : value;
  }

  formatReceiptDialogTitle(item: RequestHistoryI): string {
    const amount = Number(this.getChangeValue(item, 'Monto'));
    const formattedAmount = Number.isFinite(amount)
      ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(amount)
      : this.getChangeValue(item, 'Monto');
    return `${formattedAmount} · ${this.getChangeValue(item, 'Fecha del pago')}`;
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

  async showReceipt(item: RequestHistoryI): Promise<void> {
    try {
      let previewUrl = this.receiptPreviewUrls()[item.id];
      if (!previewUrl) {
        previewUrl = await this.requestService.loadPreRetreatReceiptPreview({...item, id: item.payment_id || item.id}, this.receiptContext);
        if (this.destroyed) {
          URL.revokeObjectURL(previewUrl);
          return;
        }
        this.receiptPreviewUrls.update(previews => ({ ...previews, [item.id]: previewUrl }));
      }
      this.openedReceiptPreviewUrl.set(previewUrl);
      this.receiptPreview.set(item);
    } catch (error) {
      console.error('No se pudo cargar el recibo del pago:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      Ss.toastService.error({ title: 'Recibo no disponible', message: 'No se pudo cargar la imagen del recibo' });
    }
  }

  onReceiptVisibilityChange(visible: boolean): void {
    if (!visible) {
      this.receiptPreview.set(null);
      this.openedReceiptPreviewUrl.set(null);
    }
  }

  private async loadReceiptPreviews(history: RequestHistoryI[]): Promise<void> {
    this.loadingReceiptPreviews.set(true);
    try {
      const previews = await Promise.all(history.filter(item => item.receipt_path || item.receipt_url).map(async item => {
        try {
          return [item.id, await this.requestService.loadPreRetreatReceiptPreview({...item, id: item.payment_id || item.id}, this.receiptContext)] as const;
        } catch (error) {
          console.error('No se pudo cargar la vista previa del recibo:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
          return null;
        }
      }));
      const loaded = Object.fromEntries(previews.filter((preview): preview is readonly [string, string] => preview !== null));
      if (this.destroyed) Object.values(loaded).forEach(URL.revokeObjectURL);
      else this.receiptPreviewUrls.set(loaded);
    } finally {
      this.loadingReceiptPreviews.set(false);
    }
  }

  private hydratePaymentReceipt(item: RequestHistoryI, payments: PreRetreatPaymentI[]): RequestHistoryI {
    if (item.receipt_path || item.receipt_url || item.message !== 'Pago de pre retiro registrado') return item;
    const changes = item.changes?.filter((change): change is RequestHistoryChangeI => typeof change !== 'string') ?? [];
    const value = (label: string) => changes.find(change => change.label === label)?.next_value;
    const payment = payments.find(payment => payment.receipt_name === value('Recibo') && String(payment.amount) === value('Monto') && this.formatPaymentDate(payment.payment_date) === value('Fecha del pago'));
    return payment ? { ...item, receipt_path: payment.receipt_path, receipt_url: payment.receipt_url, receipt_name: payment.receipt_name, payment_id: payment.id } : item;
  }

  private formatPaymentDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
}
