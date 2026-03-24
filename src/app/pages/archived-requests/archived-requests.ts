import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { RequestCard } from '@pages/retreat-list/components/retreat-view/requests/request-card/request-card';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Ss } from '@core/services/singleton.service';
import { ArchivedRequestGridItem, ArchivedRequestItemData, ArchivedRequestListItem } from './components/archived-request-data-item';

@Component({
  selector: 'app-archived-requests',
  imports: [CommonModule, ButtonModule, TooltipModule, DynamicDataviewComponent, RequestCard],
  templateUrl: './archived-requests.html',
  styleUrl: './archived-requests.scss',
})
export class ArchivedRequests implements OnInit {
  private requestService = inject(RequestService);
  private retreatService = inject(RetreatService);

  loading = signal(true);
  archivedRequests = signal<RequestClass[]>([]);
  retreats = signal<RetreatClass[]>([]);

  archivedRequestsWithRetreat = computed<ArchivedRequestItemData[]>(() =>
    this.archivedRequests().map(request => ({
      request,
      retreat: this.retreats().find(retreat => retreat.id === request.relatedRetreatId) ?? null,
    }))
  );

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
    try {
      this.loading.set(true);
      const [retreats, archivedRequests] = await Promise.all([this.retreatService.getAll(), this.requestService.getArchivedRequests()]);

      this.retreats.set(retreats);
      this.archivedRequests.set(archivedRequests);
      this.refreshFilterConfigs();
      this.updateDataviewData();
    } catch (error) {
      console.error('Error cargando solicitudes archivadas:', error);
      Ss.toastService.error({
        message: 'No se pudieron cargar las solicitudes archivadas',
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
