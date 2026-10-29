import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { MenuItem } from 'primeng/api';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { RequestCard } from '../requests/request-card/request-card';
import { ArchivedRequestGridItem, ArchivedRequestItemData, ArchivedRequestListItem } from '@pages/archived-requests/components/archived-request-data-item';
import { PdfService } from '@pages/retreat-list/utils/pdf.service';
import { ExcelService } from '@pages/retreat-list/utils/excel.service';
import { ExportType, ReportType } from '@pages/retreat-list/utils/export.utils';
import { TransferRequestModal } from '../requests/request-view/transfer-request-modal/transfer-request-modal';

@Component({
  selector: 'app-archived-requests-modal',
  imports: [CommonModule, ButtonModule, MenuModule, TooltipModule, DynamicDataviewComponent, RequestCard],
  templateUrl: './archived-requests-modal.html',
  styleUrl: './archived-requests-modal.scss',
})
export class ArchivedRequestsModal implements OnInit {
  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);

  retreat!: RetreatClass;
  loading = signal(true);
  archivedRequests = signal<RequestClass[]>([]);
  selectionMode = signal(false);
  selectedRequestIds = signal<string[]>([]);
  batchLoading = signal(false);
  private pdfService = inject(PdfService);
  private excelService = inject(ExcelService);
  selectedRequests = computed(() => this.archivedRequests().filter(request => this.selectedRequestIds().includes(request.id)));
  bulkExportActions: MenuItem[] = [
    { label: 'Exportar en PDF', icon: 'pi pi-file-pdf', command: () => this.exportSelected(ExportType.PDF) },
    { label: 'Exportar en Excel', icon: 'pi pi-file-excel', command: () => this.exportSelected(ExportType.EXCEL) },
  ];

  archivedRequestItems = computed<ArchivedRequestItemData[]>(() =>
    this.archivedRequests().map(request => ({
      request,
      retreat: this.retreat,
    }))
  );

  private sortOptions = [
    { label: 'Fecha de archivado', value: 'archived_at' },
    { label: 'Pareja', value: 'couple' },
  ];

  filterConfigs: FilterConfig[] = [
    {
      key: 'search',
      label: 'Buscar',
      type: 'search',
      placeholder: 'Buscar por pareja...',
      defaultValue: '',
    },
    {
      key: 'sort',
      label: 'Ordenar por',
      type: 'sort',
      options: this.sortOptions,
      defaultValue: 'archived_at',
    },
  ];

  dataviewConfig = new DynamicDataviewConfig<ArchivedRequestItemData>({
    listComponent: ArchivedRequestListItem,
    gridComponent: ArchivedRequestGridItem,
    layout: 'grid',
    layoutStorageKey: 'archived_requests',
    componentProps: {
      showRetreatMeta: false,
      afterClose: this.loadArchivedRequests.bind(this),
      selectionMode: () => this.selectionMode(),
      isSelected: (requestId: string) => this.selectedRequestIds().includes(requestId),
      toggleSelection: (request: RequestClass) => this.toggleRequestSelection(request),
    },
    filters: {
      enabled: true,
      configs: this.filterConfigs,
      values: {
        search: '',
        sort: 'archived_at',
      },
      onFilterChange: filters => this.onFiltersChanged(filters),
    },
    sorting: {
      enabled: true,
      field: 'archived_at',
      order: 'desc',
      options: this.sortOptions,
      onSortChange: sorting => this.onSortingChanged(sorting),
    },
  });

  visibleArchivedCount = computed(() => this.dataviewConfig.data().length);

  ngOnInit(): void {
    this.retreat = this.config.data.retreat;
    void this.loadArchivedRequests();
  }

  async loadArchivedRequests(): Promise<void> {
    try {
      this.loading.set(true);
      const archivedRequests = await this.requestService.getArchivedRequests({
        retreatId: this.retreat.id,
      });
      const summaries = await this.requestService.getPaymentSummariesForRequests(archivedRequests.map(request => request.id));
      archivedRequests.forEach(request => {
        if (summaries[request.id]) request.payments_summary = summaries[request.id] ?? {};
      });
      this.archivedRequests.set(archivedRequests);
      this.updateDataviewData();
    } catch (error) {
      console.error('Error al obtener solicitudes archivadas del retiro:', error);
      Ss.toastService.error({
        message: 'No se pudieron cargar las solicitudes archivadas de este retiro',
        title: 'Error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  toggleSelectionMode(): void {
    this.selectionMode.update(active => !active);
    this.selectedRequestIds.set([]);
  }

  toggleRequestSelection(request: RequestClass): void {
    this.selectedRequestIds.update(ids => ids.includes(request.id) ? ids.filter(id => id !== request.id) : [...ids, request.id]);
  }

  unarchiveSelected(): void {
    const requests = this.selectedRequests();
    if (!requests.length) return;
    Ss.confirmationService.confirm({
      message: `Se desarchivarán ${requests.length} solicitudes y volverán a este retiro. ¿Deseas continuar?`,
      header: 'Desarchivar solicitudes',
      icon: 'pi pi-replay',
      acceptLabel: 'Desarchivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        this.batchLoading.set(true);
        const succeeded: string[] = [];
        for (const request of requests) {
          try {
            await this.requestService.unarchiveRequest({ request, retreat: this.retreat });
            succeeded.push(request.id);
          } catch (error) {
            console.error('Error desarchivando solicitud:', JSON.stringify({ requestId: request.id, message: error instanceof Error ? error.message : String(error) }));
          }
        }
        this.selectedRequestIds.update(ids => ids.filter(id => !succeeded.includes(id)));
        this.batchLoading.set(false);
        if (succeeded.length !== requests.length) Ss.toastService.warning({ message: `${succeeded.length} de ${requests.length} solicitudes desarchivadas`, title: 'Proceso incompleto' });
        await this.loadArchivedRequests();
      },
    });
  }

  transferSelected(): void {
    const dialogService = Ss.dialogService;
    const requests = this.selectedRequests();
    if (!dialogService || !requests.length) return;
    const dialogRef = dialogService.open(TransferRequestModal, {
      header: `Transferir ${requests.length} solicitudes`,
      width: '32rem', modal: true, draggable: false, resizable: false, closable: true, focusOnShow: false,
      data: { requests, retreat: this.retreat, isArchivedView: true },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
    dialogRef?.onClose.subscribe((result?: { transferredRequestIds?: string[] }) => {
      if (!result?.transferredRequestIds?.length) return;
      this.selectedRequestIds.update(ids => ids.filter(id => !result.transferredRequestIds!.includes(id)));
      void this.loadArchivedRequests();
    });
  }

  async exportSelected(type: ExportType): Promise<void> {
    const requests = this.selectedRequests();
    let succeeded = 0;
    const retreatInfo = {
      name: this.retreat.displayCommunityName,
      number: this.retreat.displayNumber,
      modality: this.retreat.displayModality,
      dateRange: this.retreat.displayDateRange,
    };
    for (const request of requests) {
      try {
        const args = { request, retreatInfo };
        const cityInfo = Ss.authService.current_user()?.cityData;
        if (type === ExportType.PDF) await this.pdfService.generateReport(ReportType.SINGLE_REQUEST_REPORT, args, cityInfo);
        else await this.excelService.generateReport(ReportType.SINGLE_REQUEST_REPORT, args, cityInfo);
        succeeded++;
      } catch (error) {
        console.error('Error exportando solicitud archivada:', JSON.stringify({ requestId: request.id, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    const format = type === ExportType.PDF ? 'PDF' : 'Excel';
    if (succeeded === requests.length) Ss.toastService.success({ message: `${succeeded} solicitudes exportadas en ${format}`, title: `${format} exportado` });
    else Ss.toastService.warning({ message: `${succeeded} de ${requests.length} solicitudes exportadas en ${format}`, title: 'Proceso incompleto' });
  }

  private onFiltersChanged(filters: { [key: string]: any }): void {
    this.updateDataviewData();
  }

  private onSortingChanged(sorting: { field: string; order: string }): void {
    this.updateDataviewData();
  }

  private updateDataviewData(): void {
    this.dataviewConfig.setData(this.filterAndSortData(this.archivedRequestItems()));
  }

  private filterAndSortData(items: ArchivedRequestItemData[]): ArchivedRequestItemData[] {
    let filtered = items.slice();
    const filters = this.dataviewConfig.filters().values;
    const sorting = this.dataviewConfig.sorting();

    if (filters['search']) {
      const search = String(filters['search']).toLowerCase();
      filtered = filtered.filter(item => item.request.displayCoupleNames.toLowerCase().includes(search));
    }

    filtered.sort((left, right) => {
      let leftValue: string | number = '';
      let rightValue: string | number = '';

      switch (sorting.field) {
        case 'couple':
          leftValue = left.request.displayCoupleNames.toLowerCase();
          rightValue = right.request.displayCoupleNames.toLowerCase();
          break;
        case 'archived_at':
        default:
          leftValue = new Date(left.request.archived_at || 0).getTime();
          rightValue = new Date(right.request.archived_at || 0).getTime();
          break;
      }

      if (sorting.order === 'asc') {
        return leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0;
      }

      return leftValue < rightValue ? 1 : leftValue > rightValue ? -1 : 0;
    });

    return filtered;
  }
}
