import { Ss } from '@core/services/singleton.service';
import { Component, inject, OnInit, signal, OnDestroy, computed } from '@angular/core';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Subject, takeUntil } from 'rxjs';
import { BadgeModule } from 'primeng/badge';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStats, RequestStatus, RequestStatusInfo } from '@core/entities/request/request.model';
import { RequestCard } from './requests/request-card/request-card';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { RequestService } from '@core/entities/request/request.service';
import { ViewItem } from '@core/components/view-item/view-item';
import { PdfService, CoupleInfo } from '../../utils/pdf.service';
import { ExcelService } from '../../utils/excel.service';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { PopoverModule } from 'primeng/popover';
import { ExportType, ReportType } from '@pages/retreat-list/utils/export.utils';
import { ArchivedRequestsModal } from './archived-requests-modal/archived-requests-modal';
import { TransferRequestModal } from './requests/request-view/transfer-request-modal/transfer-request-modal';
import { RetreatStats } from './retreat-stats/retreat-stats';

@Component({
  selector: 'app-retreat-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, BadgeModule, RequestCard, SelectModule, FormsModule, InputTextModule, ViewItem, MenuModule, PopoverModule, RetreatStats],
  templateUrl: './retreat-view.html',
  styleUrl: './retreat-view.scss',
})
export class RetreatView implements OnInit, OnDestroy {
  requests = signal<RequestClass[]>([]);
  selectionMode = signal(false);
  selectedRequestIds = signal<string[]>([]);
  selectedRequests = computed(() => this.requests().filter(request => this.selectedRequestIds().includes(request.id)));
  private requestCreationDates = new Map<string, number>();
  batchLoading = signal(false);
  requestsService = inject(RequestService);
  pdfService = inject(PdfService);
  excelService = inject(ExcelService);

  requestFiltered = computed(() => {
    const word = this.filterWord();
    const status = this.selectedRequestStatus();
    const payments = this.selectedPaymentFilter();
    const informed = this.selectedInformedFilter();

    // Primero filtrar por palabra de búsqueda en los nombres completos
    let filteredRequests = this.requests();

    if (word) {
      filteredRequests = filteredRequests.filter(request => {
        const sheName = request.she.full_name.toLowerCase();
        const heName = request.he.full_name.toLowerCase();
        const searchWord = word.toLowerCase();

        return sheName.includes(searchWord) || heName.includes(searchWord);
      });
    }

    return filteredRequests.filter(request =>
      (status === RequestStatus.ALL || request.status === status) &&
      (payments === 'all' || (payments === 'paid'
        ? this.getPaymentStatus(request) !== 'none'
        : this.getPaymentStatus(request) === payments)) &&
      (informed === 'all' || (informed === 'yes') === !!request.is_informado)
    ).sort((left, right) => this.getRequestCreationTime(right) - this.getRequestCreationTime(left));
  });

  fetchingRequests = signal(true);

  selectedRequestStatus = signal<RequestStatus>(RequestStatus.ALL);
  selectedPaymentFilter = signal<'all' | 'none' | 'paid' | 'partial' | 'complete'>('all');
  selectedInformedFilter = signal<'all' | 'yes' | 'no'>('all');
  activeFilterCount = computed(() =>
    Number(this.selectedRequestStatus() !== RequestStatus.ALL) +
    Number(this.selectedPaymentFilter() !== 'all') +
    Number(this.selectedInformedFilter() !== 'all')
  );
  filterWord = signal<string>('');
  requestStatusOptions = [
    { label: 'Todas', value: RequestStatus.ALL },
    { label: 'Pendientes', value: RequestStatus.PENDING },
    { label: 'Aceptadas', value: RequestStatus.ACCEPTED },
    { label: 'Rechazadas', value: RequestStatus.REJECTED },
  ];
  get paymentFilterOptions() {
    const canClassify = !!this.retreat?.amount_per_person;
    return [
      { label: 'Todos', value: 'all' },
      { label: 'Sin pagos', value: 'none' },
      { label: 'Con pagos', value: 'paid' },
      ...(canClassify ? [
        { label: 'Pago parcial', value: 'partial' },
        { label: 'Pago completo', value: 'complete' },
      ] : []),
    ];
  }
  informedFilterOptions = [
    { label: 'Todas', value: 'all' },
    { label: 'Informadas', value: 'yes' },
    { label: 'Sin informar', value: 'no' },
  ];

  clearFilters(): void {
    this.selectedRequestStatus.set(RequestStatus.ALL);
    this.selectedPaymentFilter.set('all');
    this.selectedInformedFilter.set('all');
  }

  getPaymentStatus(request: RequestClass): 'none' | 'paid' | 'partial' | 'complete' {
    const paid = (request.pre_retreat_payments ?? []).reduce((total, payment) => total + payment.amount, 0);
    if (paid <= 0) return 'none';
    const amountPerPerson = this.retreat?.amount_per_person ?? 0;
    if (amountPerPerson <= 0) return 'paid';
    const coupleTotal = amountPerPerson * 2;
    return paid >= coupleTotal ? 'complete' : 'partial';
  }

  formatRetreatAmount(amount: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'DOP', maximumFractionDigits: 2,
    }).format(amount);
  }

  requestStats = signal<RequestStats>({
    [RequestStatus.PENDING]: { amount: 0, tooltip: 'Pendientes', severity: 'secondary' as const, label: 'Pendiente', labelPlural: 'Pendientes' },
    [RequestStatus.ACCEPTED]: { amount: 0, tooltip: 'Aceptadas', severity: 'success' as const, label: 'Aceptada', labelPlural: 'Aceptadas' },
    [RequestStatus.REJECTED]: { amount: 0, tooltip: 'Rechazadas', severity: 'danger' as const, label: 'Rechazada', labelPlural: 'Rechazadas' },
    informed: { amount: 0, tooltip: 'Informadas', severity: 'info' as const, label: 'Informada', labelPlural: 'Informadas' },
    uninformed: { amount: 0, tooltip: 'Sin informar', severity: 'warn' as const, label: 'Sin informar', labelPlural: 'Sin informar' },
  });

  RequestStatus = RequestStatus;
  ExportType = ExportType;

  retreat!: RetreatClass;
  loading = signal(false);

  exportActions: MenuItem[] = [
    {
      label: 'Exportar',
      items: [
        {
          label: 'Exportar en PDF',
          icon: 'pi pi-file-pdf',
          command: () => this.exportCouplesCallInfo({ type: ExportType.PDF }),
        },
        {
          label: 'Exportar en Excel',
          icon: 'pi pi-file-excel',
          command: () => this.exportCouplesCallInfo({ type: ExportType.EXCEL }),
        },
      ],
    },
  ];

  bulkExportActions: MenuItem[] = [
    { label: 'Exportar selección en PDF', icon: 'pi pi-file-pdf', command: () => this.exportSelected(ExportType.PDF) },
    { label: 'Exportar selección en Excel', icon: 'pi pi-file-excel', command: () => this.exportSelected(ExportType.EXCEL) },
  ];

  private destroy$ = new Subject<void>();
  private autoOpenRequestId: string | null = null;
  private autoOpenHandled = false;

  get keys() {
    return Object.keys;
  }

  constructor(public ref: DynamicDialogRef, public config: DynamicDialogConfig) {}

  ngOnInit(): void {
    this.retreat = this.config.data.retreat;
    this.autoOpenRequestId = this.config.data.autoOpenRequestId ?? null;
    this.getRequests();
  }

  ngOnDestroy(): void {
    this.requestsService.clearCache();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async getRequests(): Promise<void> {
    try {
      this.fetchingRequests.set(true);
      const requests = await this.retreat.getRequests();
      try {
        this.requestCreationDates = await this.requestsService.getRequestCreationDates(requests.map(request => request.id));
      } catch (error) {
        console.warn('No se pudieron cargar las fechas originales de las solicitudes:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      }

      this.requestsService.requests$.pipe(takeUntil(this.destroy$)).subscribe(requests => {
        this.requests.set(requests);
        this.updateRequestStats(requests);
        this.fetchingRequests.set(false);
        this.tryAutoOpenRequest(requests);
      });
    } catch (error) {
      Ss.toastService.error({ message: 'Error al obtener las solicitudes', title: 'Error' });
    }
  }

  private getRequestCreationTime(request: RequestClass): number {
    const createdAt = request.created_at ? new Date(request.created_at).getTime() : Number.NaN;
    return Number.isFinite(createdAt) ? createdAt : this.requestCreationDates.get(request.id) ?? 0;
  }

  private tryAutoOpenRequest(requests: RequestClass[]): void {
    if (this.autoOpenHandled || !this.autoOpenRequestId) {
      return;
    }

    const requestToOpen = requests.find(request => request.id === this.autoOpenRequestId);
    this.autoOpenHandled = true;

    if (!requestToOpen) {
      Ss.toastService.warning({
        title: 'Solicitud no encontrada',
        message: 'La solicitud enlazada no está disponible en este retiro.',
      });
      return;
    }

    queueMicrotask(() => {
      void requestToOpen.openView();
    });
  }

  /**
   * Actualiza las estadísticas de solicitudes
   */
  private updateRequestStats(requests: RequestClass[]): void {
    const stats = requests
      .filter(request => request.status !== RequestStatus.ALL)
      .reduce((acc, request) => {
        const status = request.status as Exclude<RequestStatus, RequestStatus.ALL>;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<RequestStatus, number>);

    this.requestStats.update(prev => ({
      [RequestStatus.PENDING]: { ...prev[RequestStatus.PENDING], amount: stats[RequestStatus.PENDING] || 0 },
      [RequestStatus.ACCEPTED]: { ...prev[RequestStatus.ACCEPTED], amount: stats[RequestStatus.ACCEPTED] || 0 },
      [RequestStatus.REJECTED]: { ...prev[RequestStatus.REJECTED], amount: stats[RequestStatus.REJECTED] || 0 },
      informed: { ...prev['informed'], amount: requests.filter(request => request.is_informado === true).length },
      uninformed: { ...prev['uninformed'], amount: requests.filter(request => request.is_informado !== true).length },
    }));
  }

  getRequestStatusInfo(status: string): RequestStatusInfo {
    const stats = this.requestStats();
    const statusInfo = stats[status as keyof typeof stats];

    return statusInfo;
  }

  /**
   * Obtiene el texto del botón de estado
   */
  getStatusButtonText(): string {
    if (this.loading()) {
      return 'Procesando...';
    }
    return this.retreat.is_active ? 'Desactivar' : 'Activar';
  }

  /**
   * Obtiene la severidad del botón de estado
   */
  getStatusButtonSeverity(): 'danger' | 'success' | 'secondary' {
    if (this.loading()) {
      return 'secondary';
    }
    return this.retreat.is_active ? 'danger' : 'success';
  }

  /**
   * Obtiene el icono del botón de estado
   */
  getStatusButtonIcon(): string {
    if (this.loading()) {
      return 'pi pi-spinner pi-spin';
    }
    return this.retreat.is_active ? 'pi pi-trash' : 'pi pi-undo';
  }

  /**
   * Confirma el cambio de estado
   */
  async confirmToggleStatus(): Promise<void> {
    try {
      this.loading.set(true);
      await this.retreat.confirmToggleStatus();
      // Recargar las solicitudes para actualizar los stats si es necesario
      await this.getRequests();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Abre el formulario de edición
   */
  async openEditForm(): Promise<void> {
    try {
      this.ref.close();

      this.loading.set(true);
      await this.retreat.openForm().then(() => {});
    } catch (error) {
      console.error('Error al abrir formulario:', error);
    } finally {
      this.loading.set(false);
    }
  }

  openArchivedRequestsModal(): void {
    const dialogService = Ss.dialogService;

    if (!dialogService) {
      console.error('DialogService no disponible');
      return;
    }

    dialogService.open(ArchivedRequestsModal, {
      header: `Solicitudes archivadas - Retiro No. ${this.retreat.displayNumber}`,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreat: this.retreat,
      },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
  }

  /**
   * Obtiene la fecha límite formateada
   */
  getMaxRequestDateFormatted(): string {
    if (this.retreat.max_request_date) {
      return new Date(this.retreat.max_request_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return 'No definida';
  }

  async exportCouplesCallInfo(args: { type: ExportType; requests?: RequestClass[] }): Promise<void> {
    const { type } = args;
    try {
      const exportRequests = args.requests ?? this.requests().filter(request => request.status === RequestStatus.ACCEPTED);

      if (exportRequests.length === 0) {
        Ss.toastService.warning({ message: 'No hay solicitudes aceptadas para exportar', title: 'Sin datos' });
        return;
      }

      // Convertir las solicitudes a formato de parejas
      const couples: CoupleInfo[] = exportRequests.map(request => ({
        novia: {
          name: request.she.full_name,
          familyContact: [
            {
              name: request.she.family_information[0]?.familiar_full_name || '',
              relationship: request.she.family_information[0]?.familiar_relationship || '',
              phone: request.she.family_information[0]?.familiar_phone || '',
            },
            {
              name: request.she.family_information[1]?.familiar_full_name || '',
              relationship: request.she.family_information[1]?.familiar_relationship || '',
              phone: request.she.family_information[1]?.familiar_phone || '',
            },
          ],
          emergencyContact: {
            name: request.she.emergency_full_name || '',
            relationship: request.she.emergency_relationship || '',
            phone: request.she.emergency_phone || '',
          },
        },
        novio: {
          name: request.he.full_name,
          familyContact: [
            {
              name: request.he.family_information[0]?.familiar_full_name || '',
              relationship: request.he.family_information[0]?.familiar_relationship || '',
              phone: request.he.family_information[0]?.familiar_phone || '',
            },
            {
              name: request.he.family_information[1]?.familiar_full_name || '',
              relationship: request.he.family_information[1]?.familiar_relationship || '',
              phone: request.he.family_information[1]?.familiar_phone || '',
            },
          ],
          emergencyContact: {
            name: request.he.emergency_full_name || '',
            relationship: request.he.emergency_relationship || '',
            phone: request.he.emergency_phone || '',
          },
        },
      }));

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
        await this.excelService.generateReport(ReportType.COUPLES_REPORT, { couples, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: `Reporte Excel generado con ${couples.length} parejas`,
          title: 'Excel Exportado',
        });
      } else {
        await this.pdfService.generateReport(ReportType.COUPLES_REPORT, { couples, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: `Reporte generado con ${couples.length} parejas`,
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

  toggleSelectionMode(): void {
    this.selectionMode.update(active => !active);
    this.selectedRequestIds.set([]);
  }

  toggleRequestSelection(request: RequestClass): void {
    this.selectedRequestIds.update(ids => ids.includes(request.id) ? ids.filter(id => id !== request.id) : [...ids, request.id]);
  }

  private canManagePreRetreat(): boolean {
    if (!this.retreat?.start_date) return false;
    const start = new Date(this.retreat.start_date);
    const today = new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return today <= start;
  }

  get canManagePreRetreatActions(): boolean {
    return this.canManagePreRetreat();
  }

  async setSelectedInformed(isInformed: boolean): Promise<void> {
    if (!this.canManagePreRetreat() || !this.selectedRequests().length) return;
    const requests = this.selectedRequests().filter(request => request.is_informado !== isInformed);
    if (!requests.length) {
      Ss.toastService.info({ message: `Todas las solicitudes seleccionadas ya están ${isInformed ? 'informadas' : 'sin informar'}`, title: 'Sin cambios' });
      return;
    }

    this.batchLoading.set(true);
    let succeeded = 0;
    for (const request of requests) {
      try {
        await this.requestsService.updatePreRetreatRequest({ id: request.id, is_informado: isInformed }, this.retreat);
        succeeded++;
      } catch (error) {
        console.error(`Error actualizando la solicitud ${request.id}:`, error);
      }
    }
    this.batchLoading.set(false);
    const result = { message: `${succeeded} de ${requests.length} solicitudes ${isInformed ? 'marcadas como informadas' : 'marcadas como no informadas'}`, title: succeeded === requests.length ? 'Cambios guardados' : 'Proceso incompleto' };
    if (succeeded === requests.length) Ss.toastService.success(result);
    else Ss.toastService.warning(result);
  }

  archiveSelected(): void {
    const requests = this.selectedRequests();
    if (!requests.length) return;
    Ss.confirmationService.confirm({
      message: `Se archivarán ${requests.length} solicitudes y dejarán de aparecer en este retiro. ¿Deseas continuar?`,
      header: 'Archivar solicitudes',
      icon: 'pi pi-inbox',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-secondary',
      rejectButtonStyleClass: 'p-button-text',
      accept: async () => {
        this.batchLoading.set(true);
        let succeeded = 0;
        for (const request of requests) {
          try {
            await this.requestsService.archiveRequest({ request, retreat: this.retreat });
            succeeded++;
          } catch (error) {
            console.error(`Error archivando la solicitud ${request.id}:`, error);
          }
        }
        this.selectedRequestIds.update(ids => ids.filter(id => this.requests().some(request => request.id === id)));
        this.batchLoading.set(false);
        const result = { message: `${succeeded} de ${requests.length} solicitudes archivadas`, title: succeeded === requests.length ? 'Proceso completado' : 'Proceso incompleto' };
        if (succeeded === requests.length) Ss.toastService.success(result);
        else Ss.toastService.warning(result);
      },
    });
  }

  transferSelected(): void {
    const dialogService = Ss.dialogService;
    const requests = this.selectedRequests();
    if (!dialogService || !requests.length) return;
    const dialogRef = dialogService.open(TransferRequestModal, {
      header: `Transferir ${requests.length} solicitudes`,
      width: '32rem',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: { requests, retreat: this.retreat },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
    dialogRef?.onClose.subscribe((result?: { transferredRequestIds?: string[] }) => {
      if (result?.transferredRequestIds?.length) {
        this.selectedRequestIds.update(ids => ids.filter(id => !result.transferredRequestIds!.includes(id)));
      }
    });
  }

  exportSelected(type: ExportType): void {
    void this.exportCouplesCallInfo({ type, requests: this.selectedRequests() });
  }
}
