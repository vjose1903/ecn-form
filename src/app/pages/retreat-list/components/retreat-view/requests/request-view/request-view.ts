import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Ss } from '@core/services/singleton.service';

import { Component, inject, OnInit, signal, computed, AfterViewInit, ViewChild, DestroyRef } from '@angular/core';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { RequestClass } from '@core/entities/request/request.class';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ViewItem } from '@core/components/view-item/view-item';
import { CoupleType, RequestI, RequestStatus } from '@core/entities/request/request.model';
import { CoupleView } from './couple-view/couple-view';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { FormPage } from '@pages/form-page/form-page';
import { PdfService } from '@pages/retreat-list/utils/pdf.service';
import { ExcelService } from '@pages/retreat-list/utils/excel.service';
import { ExportType, ReportType } from '@pages/retreat-list/utils/export.utils';
import { RequestHistoryModal } from './request-history-modal/request-history-modal';
import { TransferRequestModal } from './transfer-request-modal/transfer-request-modal';
import { PreRetreatPaymentModal } from './pre-retreat-payment-modal/pre-retreat-payment-modal';
import { ConfirmRequestInformationModal } from './confirm-request-information-modal/confirm-request-information-modal';

@Component({
  selector: 'app-request-view',
  imports: [TagModule, DividerLine, ButtonModule, ViewItem, CoupleView, TooltipModule, MenuModule],
  templateUrl: './request-view.html',
  styleUrl: './request-view.scss',
})
export class RequestView implements OnInit, AfterViewInit {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  requestService = inject(RequestService);
  pdfService = inject(PdfService);
  excelService = inject(ExcelService);

  private destroyRef = inject(DestroyRef);
  recentAction = signal('Cargando…');

  loading = signal(false);
  isArchivedView = signal(false);
  private _request = signal<RequestClass | null>(null);
  request = computed(() => this._request());
  retreat: RetreatClass | null = null;
  CoupleType = CoupleType;
  RequestStatus = RequestStatus;

  actions: MenuItem[] = [];
  actionsOnly = false;
  @ViewChild('actionsMenu') private actionsMenu?: Menu;

  ngOnInit(): void {
    this._request.set(this.config.data.request);
    this.retreat = this.config.data.retreat ?? null;
    this.isArchivedView.set(Boolean(this.config.data.isArchivedView));
    this.actionsOnly = Boolean(this.config.data.actionsOnly);
    this.actions = this.buildActions();
    const request = this.request();
    if (!this.actionsOnly && request) {
      this.requestService.watchLatestRequestHistory(request.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: event => this.recentAction.set(event?.message === 'Pago de pre retiro registrado' ? 'Pago registrado' : event?.message || request.actionLabel),
          error: error => {
            this.recentAction.set('No disponible');
            console.error('Error al cargar la acción reciente:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
          },
        });
    }
  }

  ngAfterViewInit(): void {
    const anchor = this.config.data.menuAnchor as HTMLElement | undefined;
    if (!this.actionsOnly || !this.actionsMenu || !anchor) return;
    this.actionsMenu.toggle({ currentTarget: anchor, target: anchor } as unknown as MouseEvent);
  }

  closeActionsMenu(): void {
    if (this.actionsOnly) setTimeout(() => this.ref.close(), 0);
  }

  refreshActions(): void {
    this.actions = this.buildActions();
  }

  private buildActions(): MenuItem[] {
    const exportActions: MenuItem = {
      label: 'Exportar',
      items: [
        {
          label: 'Exportar en PDF',
          icon: 'pi pi-file-pdf',
          command: () => this.exportSingleRequestReport({ request: this.request()!, type: ExportType.PDF }),
        },
        {
          label: 'Exportar en Excel',
          icon: 'pi pi-file-excel',
          command: () => this.exportSingleRequestReport({ request: this.request()!, type: ExportType.EXCEL }),
        },
      ],
    };

    const preRetreatActions: MenuItem[] = !this.isArchivedView() && this.canShowPreRetreat()
      ? [
          {
            label: 'Pre Retiro',
            items: [
              {
                label: this.request()?.is_informado ? 'Marcar como no informado' : 'Marcar como informado',
                icon: this.request()?.is_informado ? 'pi pi-eye-slash' : 'pi pi-check-circle',
                visible: Boolean(this.request()?.canReadDetailSection('informed') && this.request()?.canEditDetailSection('informed')),
                command: () => void this.togglePreRetreatInformed(),
              },
              {
                label: 'Pagos',
                icon: 'pi pi-wallet',
                command: () => this.openPreRetreatPayments(),
              },
            ],
          },
          { separator: true },
        ]
      : [];

    if (this.isArchivedView()) {
      return [
        {
          label: 'Acciones',
          items: [
            { label: 'Transferir solicitud', icon: 'pi pi-send', command: () => this.openTransferModal() },
            { label: 'Desarchivar solicitud', icon: 'pi pi-replay', command: () => this.unarchiveRequest() },
          ],
        },
        { separator: true },
        exportActions,
      ];
    }

    return [
      ...preRetreatActions,
      {
        label: 'Acciones',
        items: [
          {
            label: this.request()?.isConfirmed ? 'Editar información confirmada' : 'Confirmar información',
            icon: 'pi pi-id-card',
            visible: this.canShowConfirmInformation(),
            command: () => this.openConfirmInformationModal(),
          },
          {
            label: 'Editar solicitud',
            icon: 'pi pi-pencil',
            command: () => this.editRequest(),
          },
          {
            label: 'Archivar solicitud',
            icon: 'pi pi-inbox',
            command: () => this.archiveRequest(),
          },
          {
            label: 'Transferir solicitud',
            icon: 'pi pi-send',
            command: () => this.openTransferModal(),
          },
          {
            label: 'Copiar link de ficha',
            icon: 'pi pi-link',
            command: () => this.copyRequestLink(),
          },
        ],
      },
      {
        separator: true,
      },
      exportActions,
    ];
  }

  private canShowPreRetreat(): boolean {
    if (!this.retreat?.start_date) return false;

    const startDate = new Date(this.retreat.start_date);
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return today <= startDate;
  }

  private canShowConfirmInformation(): boolean {
    const request = this.request();
    if (this.isArchivedView() || !request || !this.retreat?.start_date
      || !request.canReadDetailSection('couple_basic') || !request.canEditDetailSection('couple_basic')
      || !request.canReadDetailSection('contact') || !request.canEditDetailSection('contact')) return false;
    const startDate = this.dateInSantoDomingo(this.retreat.start_date);
    const today = this.dateInSantoDomingo(new Date());
    return Boolean(startDate && today && today <= startDate);
  }

  private dateInSantoDomingo(value: Date | string): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
  }

  openConfirmInformationModal(): void {
    if (!this.canShowConfirmInformation()) return;
    const dialogService = Ss.dialogService;
    const request = this.request();
    if (!dialogService || !request || !this.retreat) return;
    const dialogRef = dialogService.open(ConfirmRequestInformationModal, {
      header: 'Confirmar información de la pareja',
      width: '48rem',
      styleClass: 'confirm-request-information-dialog',
      modal: true,
      appendTo: 'body',
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {request, retreat: this.retreat},
      breakpoints: {'768px': '95vw'},
    });
    dialogRef?.onClose.subscribe((updated?: RequestI) => {
      if (!updated) return;
      const current = this.request();
      const confirmed = new RequestClass({...updated, readableSections: current?.readableSections ?? null, editableSections: current?.editableSections ?? null});
      this._request.set(confirmed);
      this.config.data.request = confirmed;
      this.actions = this.buildActions();
    });
  }

  async togglePreRetreatInformed(): Promise<void> {
    const currentRequest = this.request();
    if (this.loading() || !currentRequest || !this.retreat
      || !currentRequest.canReadDetailSection('informed') || !currentRequest.canEditDetailSection('informed')) return;

    const isInformado = !currentRequest.is_informado;
    this.loading.set(true);
    try {
      const updated = await this.requestService.updatePreRetreatRequest(
        { id: currentRequest.id, is_informado: isInformado },
        this.retreat,
        this.isArchivedView()
      );
      this._request.set(new RequestClass({ ...updated, readableSections: currentRequest.readableSections, editableSections: currentRequest.editableSections }));
      this.config.data.request = this._request();
      this.actions = this.buildActions();
      Ss.toastService.success({
        message: isInformado ? 'La pareja fue marcada como informada' : 'La pareja fue marcada como no informada',
        title: 'Pre Retiro',
      });
    } catch (error) {
      console.error('Error al actualizar el estado de informado:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error));
      Ss.toastService.error({ message: 'No se pudo actualizar el estado de informado', title: 'Error' });
    } finally {
      this.loading.set(false);
    }
  }

  openPreRetreatPayments(): void {
    const dialogService = Ss.dialogService;
    const request = this.request();
    if (!dialogService || !request || !this.retreat) return;

    const dialogRef = dialogService.open(PreRetreatPaymentModal, {
      header: 'Pagos',
      width: '34rem',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: { request, retreat: this.retreat, isArchivedView: this.isArchivedView() },
      breakpoints: { '640px': '95vw' },
    });

    dialogRef?.onClose.subscribe((updated?: RequestI) => {
      if (!updated) return;
      this._request.set(new RequestClass({ ...updated, readableSections: this.request()?.readableSections ?? null, editableSections: this.request()?.editableSections ?? null }));
      this.config.data.request = this._request();
    });
  }

  toggleStatus(status: RequestStatus) {
    this.loading.set(true);
    const currentRequest = this.request();
    if (!currentRequest) {
      this.loading.set(false);
      return;
    }
    if (!this.retreat) {
      Ss.toastService.error({ message: 'No se encontró el retiro asociado a la solicitud', title: 'Error' });
      this.loading.set(false);
      return;
    }
    const payload = { id: currentRequest.id, status };

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

  unarchiveRequest() {
    const currentRequest = this.request();

    if (!currentRequest || !this.retreat) {
      Ss.toastService.error({ message: 'No se encontró la información necesaria para desarchivar la solicitud', title: 'Error' });
      return;
    }

    Ss.confirmationService.confirm({
      message: 'La solicitud volverá al retiro original y se eliminará de solicitudes archivadas. ¿Deseas continuar?',
      header: 'Desarchivar solicitud',
      icon: 'pi pi-replay',
      acceptLabel: 'Desarchivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-text',
      accept: async () => {
        this.loading.set(true);

        try {
          await this.requestService.unarchiveRequest({ request: currentRequest, retreat: this.retreat! });
          this.ref.close({ desarchived: true, requestId: currentRequest.id });
        } catch (error) {
          console.error('Error desarchivando la solicitud:', error);
        } finally {
          this.loading.set(false);
        }
      },
    });
  }

  openHistoryModal() {
    const dialogService = Ss.dialogService;

    if (!dialogService || !this.request()) {
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
        request: this.request(),
        retreat: this.retreat,
        isArchivedView: this.isArchivedView(),
      },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
  }

  openTransferModal() {
    const dialogService = Ss.dialogService;

    if (!dialogService || !this.request() || !this.retreat) {
      return;
    }

    const dialogRef = dialogService.open(TransferRequestModal, {
      header: 'Transferir solicitud',
      width: '32rem',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        request: this.request(),
        retreat: this.retreat,
        isArchivedView: this.isArchivedView(),
      },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });

    dialogRef?.onClose.subscribe((result?: { transferred?: boolean }) => {
      if (result?.transferred) {
        this.ref.close(result);
      }
    });
  }

  async copyRequestLink(): Promise<void> {
    const currentRequest = this.request();

    if (!currentRequest || !this.retreat) {
      Ss.toastService.error({ message: 'No se encontró la información necesaria para copiar el link', title: 'Error' });
      return;
    }

    const link = new URL('/retiros', window.location.origin);
    link.searchParams.set('openRetreat', '1');
    link.searchParams.set('retreatId', this.retreat.id);
    link.searchParams.set('openRequest', '1');
    link.searchParams.set('requestId', currentRequest.id);

    try {
      await Ss.copyToClipboardService.copyText(link.toString());
      Ss.toastService.info({ message: 'Link copiado al portapapeles', title: 'Link de Ficha' });
    } catch (error) {
      console.error('Error copiando el link de la ficha:', error);
      Ss.toastService.error({ message: 'No se pudo copiar el link de la ficha', title: 'Error' });
    }
  }

  archiveRequest() {
    const currentRequest = this.request();

    if (!currentRequest || !this.retreat) {
      Ss.toastService.error({ message: 'No se encontró la información necesaria para archivar la solicitud', title: 'Error' });
      return;
    }

    Ss.confirmationService.confirm({
      message: 'La solicitud se moverá a solicitudes archivadas y dejará de aparecer en este retiro. ¿Deseas continuar?',
      header: 'Archivar solicitud',
      icon: 'pi pi-inbox',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-secondary',
      rejectButtonStyleClass: 'p-button-text',
      accept: async () => {
        this.loading.set(true);

        try {
          await this.requestService.archiveRequest({ request: currentRequest, retreat: this.retreat! });
          this.ref.close({ archived: true, requestId: currentRequest.id });
        } catch (error) {
          console.error('Error archivando la solicitud:', error);
        } finally {
          this.loading.set(false);
        }
      },
    });
  }

  editRequest() {
    const dialogService = Ss.dialogService;
    const cityId = this.retreat?.city_id;

    if (!dialogService) {
      console.error('DialogService no disponible');
      return;
    }
    if (!cityId) {
      Ss.toastService.error({ message: 'No se encontró la ciudad de la solicitud', title: 'Error' });
      return;
    }

    const dialogRef = dialogService.open(FormPage, {
      header: `Editar Solicitud`,
      width: '70vw',
      modal: true,
      appendTo: 'body',
      draggable: false,
      resizable: false,
      closable: true,
      contentStyle: { padding: '0' },
      focusOnShow: false,
      data: {
        request: this.request(),
        formType: 'update',
        cityId,
        retreat: this.retreat,
      },
      breakpoints: { '960px': '80vw', '640px': '90vw' },
    });

    if (!dialogRef) {
      return;
    }

    dialogRef.onClose.subscribe((result: RequestI | undefined) => {
      if (result) {
        if (result && result.id) {
          const newRequest = new RequestClass({ ...result, readableSections: this.request()?.readableSections ?? null, editableSections: this.request()?.editableSections ?? null });
          this._request.set(newRequest);
          this.config.data.request = newRequest;
        }
      }
    });
  }

  async exportSingleRequestReport(args: { request: RequestClass; type: ExportType }): Promise<void> {
    const { request, type } = args;
    try {
      if (!this.retreat) {
        Ss.toastService.warning({
          message: 'No se pudo obtener el retiro asociado para exportar este reporte',
          title: 'Retiro no disponible',
        });
        return;
      }

      // Información del retiro para el reporte
      const retreatInfo = {
        name: this.retreat.displayCommunityName,
        number: this.retreat.displayNumber,
        modality: this.retreat.displayModality,
        dateRange: this.retreat.displayDateRange,
      };

      // Obtener información de la ciudad desde el layout
      const cityInfo = Ss.authService.current_user()?.cityData;

      // Generar el reporte según el tipo
      if (type === ExportType.EXCEL) {
        await this.excelService.generateReport(ReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: 'Reporte de solicitud individual generado',
          title: 'Excel Exportado',
        });
      } else {
        await this.pdfService.generateReport(ReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: 'Reporte de solicitud individual generado',
          title: 'PDF Exportado',
        });
      }
    } catch (error) {
      console.error(`Error al exportar ${type === ExportType.EXCEL ? 'Excel' : 'PDF'}:`, error);
      Ss.toastService.error({
        message: `Error al generar el reporte ${type === ExportType.EXCEL ? 'Excel' : 'PDF'}`,
        title: 'Error',
      });
    }
  }
}
