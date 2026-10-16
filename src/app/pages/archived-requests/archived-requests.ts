import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { RequestCard } from '@pages/retreat-list/components/retreat-view/requests/request-card/request-card';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Ss } from '@core/services/singleton.service';
import { TransferRequestModal } from '@pages/retreat-list/components/retreat-view/requests/request-view/transfer-request-modal/transfer-request-modal';
import { PdfService } from '@pages/retreat-list/utils/pdf.service';
import { ExcelService } from '@pages/retreat-list/utils/excel.service';
import { ExportType, ReportType } from '@pages/retreat-list/utils/export.utils';
import { ArchivedRequestGridItem, ArchivedRequestItemData, ArchivedRequestListItem } from './components/archived-request-data-item';

@Component({
  selector: 'app-archived-requests',
  imports: [CommonModule, ButtonModule, TooltipModule, MenuModule, DynamicDataviewComponent, RequestCard],
  templateUrl: './archived-requests.html',
  styleUrl: './archived-requests.scss',
})
export class ArchivedRequests implements OnInit {
  private requestService = inject(RequestService);
  private retreatService = inject(RetreatService);

  loading = signal(true);
  loadError = signal(false);
  archivedRequests = signal<RequestClass[]>([]);
  retreats = signal<RetreatClass[]>([]);
  selectionMode = signal(false);
  selectedRequestIds = signal<string[]>([]);
  batchLoading = signal(false);
  private pdfService = inject(PdfService);
  private excelService = inject(ExcelService);

  archivedRequestsWithRetreat = computed<ArchivedRequestItemData[]>(() =>
    this.archivedRequests().map(request => ({
      request,
      retreat: this.retreats().find(retreat => retreat.id === request.relatedRetreatId) ?? null,
    }))
  );
  selectedItems = computed(() => this.archivedRequestsWithRetreat().filter(item => this.selectedRequestIds().includes(item.request.id)));

  bulkExportActions: MenuItem[] = [
    { label: 'Exportar en PDF', icon: 'pi pi-file-pdf', command: () => this.exportSelected(ExportType.PDF) },
    { label: 'Exportar en Excel', icon: 'pi pi-file-excel', command: () => this.exportSelected(ExportType.EXCEL) },
  ];

  private sortOptions = [
    { label: 'Fecha de archivado', value: 'archived_at' },
    { label: 'Pareja', value: 'couple' },
    { label: 'Retiro', value: 'retreat' },
  ];

  filterConfigs: FilterConfig[] = this.buildFilterConfigs();

  dataviewConfig = new DynamicDataviewConfig<ArchivedRequestItemData>({
    listComponent: ArchivedRequestListItem,
    gridComponent: ArchivedRequestGridItem,
    layout: 'grid',
    layoutStorageKey: 'archived_requests',
    componentProps: {
      showRetreatMeta: true,
      afterClose: this.refresh.bind(this),
      selectionMode: () => this.selectionMode(),
      isSelected: (requestId: string) => this.selectedRequestIds().includes(requestId),
      toggleSelection: (request: RequestClass) => this.toggleRequestSelection(request),
    },
    filters: {
      enabled: true,
      configs: this.filterConfigs,
      values: {
        search: '',
        retreat: 'all',
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

  ngOnInit(): void {
    void this.loadData();
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  toggleSelectionMode(): void {
    this.selectionMode.update(active => !active);
    this.selectedRequestIds.set([]);
  }

  toggleRequestSelection(request: RequestClass): void {
    this.selectedRequestIds.update(ids => ids.includes(request.id) ? ids.filter(id => id !== request.id) : [...ids, request.id]);
  }

  clearSelection(): void {
    this.selectedRequestIds.set([]);
  }

  unarchiveSelected(): void {
    const items = this.selectedItems();
    if (!items.length) return;
    Ss.confirmationService.confirm({
      message: `Se desarchivarán ${items.length} solicitudes y volverán a sus retiros originales. ¿Deseas continuar?`,
      header: 'Desarchivar solicitudes',
      icon: 'pi pi-replay',
      acceptLabel: 'Desarchivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        this.batchLoading.set(true);
        const succeeded: string[] = [];
        for (const item of items) {
          if (!item.retreat) continue;
          try {
            await this.requestService.unarchiveRequest({ request: item.request, retreat: item.retreat });
            succeeded.push(item.request.id);
          } catch (error) {
            console.error('Error desarchivando solicitud:', JSON.stringify({ requestId: item.request.id, message: error instanceof Error ? error.message : String(error) }));
          }
        }
        this.selectedRequestIds.update(ids => ids.filter(id => !succeeded.includes(id)));
        this.batchLoading.set(false);
        if (succeeded.length !== items.length) Ss.toastService.warning({ message: `${succeeded.length} de ${items.length} solicitudes desarchivadas`, title: 'Proceso incompleto' });
        await this.refresh();
      },
    });
  }

  transferSelected(): void {
    const dialogService = Ss.dialogService;
    const items = this.selectedItems();
    if (!dialogService || !items.length) return;
    const transferableItems = items.filter(item => item.retreat);
    if (transferableItems.length !== items.length) {
      Ss.toastService.warning({ message: 'No se pudieron identificar todos los retiros de origen', title: 'Solicitudes no disponibles' });
    }
    if (!transferableItems.length) return;
    const origins = Object.fromEntries(transferableItems.map(item => [item.request.id, item.retreat!]));
    const dialogRef = dialogService.open(TransferRequestModal, {
      header: `Transferir ${transferableItems.length} solicitudes`,
      width: '32rem', modal: true, draggable: false, resizable: false, closable: true, focusOnShow: false,
      data: { requests: transferableItems.map(item => item.request), retreat: Object.values(origins)[0], requestOrigins: origins, isArchivedView: true },
      breakpoints: { '960px': '80vw', '640px': '95vw' },
    });
    dialogRef?.onClose.subscribe((result?: { transferredRequestIds?: string[] }) => {
      if (!result?.transferredRequestIds?.length) return;
      this.selectedRequestIds.update(ids => ids.filter(id => !result.transferredRequestIds!.includes(id)));
      void this.refresh();
    });
  }

  async exportSelected(type: ExportType): Promise<void> {
    const items = this.selectedItems();
    let succeeded = 0;
    for (const item of items) {
      if (!item.retreat) continue;
      const retreatInfo = {
        name: item.retreat.displayCommunityName,
        number: item.retreat.displayNumber,
        modality: item.retreat.displayModality,
        dateRange: item.retreat.displayDateRange,
      };
      try {
        const args = { request: item.request, retreatInfo };
        const cityInfo = Ss.authService.current_user()?.cityData;
        if (type === ExportType.PDF) await this.pdfService.generateReport(ReportType.SINGLE_REQUEST_REPORT, args, cityInfo);
        else await this.excelService.generateReport(ReportType.SINGLE_REQUEST_REPORT, args, cityInfo);
        succeeded++;
      } catch (error) {
        console.error('Error exportando solicitud archivada:', JSON.stringify({ requestId: item.request.id, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    const format = type === ExportType.PDF ? 'PDF' : 'Excel';
    if (succeeded === items.length) Ss.toastService.success({ message: `${succeeded} solicitudes exportadas en ${format}`, title: `${format} exportado` });
    else Ss.toastService.warning({ message: `${succeeded} de ${items.length} solicitudes exportadas en ${format}`, title: 'Proceso incompleto' });
  }

  private buildFilterConfigs(): FilterConfig[] {
    return [
      {
        key: 'search',
        label: 'Buscar',
        type: 'search',
        placeholder: 'Buscar por pareja o retiro...',
        defaultValue: '',
      },
      {
        key: 'retreat',
        label: 'Retiro',
        type: 'select',
        options: this.getRetreatOptions(),
        defaultValue: 'all',
        width: 'w-full md:w-72',
      },
      {
        key: 'sort',
        label: 'Ordenar por',
        type: 'sort',
        options: this.sortOptions,
        defaultValue: 'archived_at',
      },
    ];
  }

  private getRetreatOptions() {
    const options = this.retreats()
      .slice()
      .sort((left, right) => left.displayNumber.localeCompare(right.displayNumber))
      .map(retreat => ({
        label: `Retiro #${retreat.displayNumber} - ${retreat.displayCommunityName}`,
        value: retreat.id,
      }));

    return [{ label: 'Todos', value: 'all' }, ...options];
  }

  private refreshFilterConfigs(): void {
    this.filterConfigs = this.buildFilterConfigs();

    const currentFilters = this.dataviewConfig.filters();
    this.dataviewConfig.setFilters({
      ...currentFilters,
      configs: this.filterConfigs,
    });
  }

  private async loadData(): Promise<void> {
    this.loadError.set(false);
    try {
      this.loading.set(true);
      const [retreats, archivedRequests] = await Promise.all([this.retreatService.getAll(), this.requestService.getArchivedRequests()]);

      this.retreats.set(retreats);
      this.archivedRequests.set(archivedRequests);
      this.refreshFilterConfigs();
      this.updateDataviewData();
    } catch (error) {
      this.loadError.set(true);
      console.error('Error cargando solicitudes archivadas:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message, ...('code' in error ? { code: error.code } : {}) } : error));
    } finally {
      this.loading.set(false);
    }
  }

  private onFiltersChanged(filters: { [key: string]: any }): void {
    this.updateDataviewData();
  }

  private onSortingChanged(sorting: { field: string; order: string }): void {
    this.updateDataviewData();
  }

  private updateDataviewData(): void {
    this.dataviewConfig.setData(this.filterAndSortData(this.archivedRequestsWithRetreat()));
  }

  private filterAndSortData(items: ArchivedRequestItemData[]): ArchivedRequestItemData[] {
    let filtered = items.slice();
    const filters = this.dataviewConfig.filters().values;
    const sorting = this.dataviewConfig.sorting();

    if (filters['search']) {
      const search = String(filters['search']).toLowerCase();
      filtered = filtered.filter(item => {
        const retreat = item.retreat;

        return (
          item.request.displayCoupleNames.toLowerCase().includes(search) ||
          retreat?.displayCommunityName.toLowerCase().includes(search) ||
          retreat?.displayNumber.toLowerCase().includes(search) ||
          false
        );
      });
    }

    if (filters['retreat'] !== 'all') {
      filtered = filtered.filter(item => item.retreat?.id === filters['retreat']);
    }

    filtered.sort((left, right) => {
      let leftValue: string | number = '';
      let rightValue: string | number = '';

      switch (sorting.field) {
        case 'couple':
          leftValue = left.request.displayCoupleNames.toLowerCase();
          rightValue = right.request.displayCoupleNames.toLowerCase();
          break;
        case 'retreat':
          leftValue = `${left.retreat?.displayNumber || ''} ${left.retreat?.displayCommunityName || ''}`.toLowerCase();
          rightValue = `${right.retreat?.displayNumber || ''} ${right.retreat?.displayCommunityName || ''}`.toLowerCase();
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
