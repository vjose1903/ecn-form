import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { RequestCard } from '../requests/request-card/request-card';
import { ArchivedRequestGridItem, ArchivedRequestItemData, ArchivedRequestListItem } from '@pages/archived-requests/components/archived-request-data-item';

@Component({
  selector: 'app-archived-requests-modal',
  imports: [CommonModule, DynamicDataviewComponent, RequestCard],
  templateUrl: './archived-requests-modal.html',
  styleUrl: './archived-requests-modal.scss',
})
export class ArchivedRequestsModal implements OnInit {
  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);

  retreat!: RetreatClass;
  loading = signal(true);
  archivedRequests = signal<RequestClass[]>([]);

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
