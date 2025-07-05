import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatForm } from './retreat-form/retreat-form';
import { RetreatI } from '@core/entities/retreat/retreat.model';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { RetreatDataList } from './components/retreat-data-list/retreat-data-list';
import { RetreatDataGrid } from './components/retreat-data-grid/retreat-data-grid';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-list',
  imports: [CommonModule, ButtonModule, DynamicDataviewComponent],
  templateUrl: './retreat-list.html',
  styleUrl: './retreat-list.scss',
})
export class RetreatList implements OnInit, OnDestroy {
  private retreatService = inject(RetreatService);
  private destroy$ = new Subject<void>();

  loading = signal(false);
  ref: DynamicDialogRef | undefined;

  // Configuración de filtros
  filterConfigs: FilterConfig[] = [
    {
      key: 'search',
      label: 'Buscar',
      type: 'search',
      placeholder: 'Buscar por número, nombre de la comunidad, casa de retiro...',
      defaultValue: '',
    },
    {
      key: 'status',
      label: 'Estado',
      type: 'select',
      options: [
        { label: 'Todos', value: 'all' },
        { label: 'Activos', value: 'active' },
        { label: 'Inactivos', value: 'inactive' },
      ],
      defaultValue: 'all',
    },
    {
      key: 'requests',
      label: 'Solicitudes',
      type: 'select',
      options: [
        { label: 'Todos', value: 'all' },
        { label: 'Acepta Solicitudes', value: 'accepts' },
        { label: 'No Acepta Solicitudes', value: 'not_accepts' },
      ],
      defaultValue: 'all',
    },
  ];

  // Opciones de ordenamiento
  sortOptions = [
    { label: 'Número (A-Z)', value: 'number' },
    { label: 'Número (Z-A)', value: 'number_desc' },
    { label: 'Modalidad (A-Z)', value: 'modality' },
    { label: 'Modalidad (Z-A)', value: 'modality_desc' },
    { label: 'Fecha de Inicio', value: 'start_date' },
    { label: 'Estado', value: 'status' },
  ];

  dataviewConfig = new DynamicDataviewConfig({
    listComponent: RetreatDataList,
    gridComponent: RetreatDataGrid,
    layout: 'list',
    componentProps: { showActions: true, enableSelection: false },
    filters: {
      enabled: true,
      configs: this.filterConfigs,
      values: {
        search: '',
        status: 'all',
        requests: 'all',
      },
      onFilterChange: filters => this.onFiltersChanged(filters),
    },
    sorting: {
      enabled: true,
      field: 'number',
      order: 'asc',
      options: this.sortOptions,
      onSortChange: sorting => this.onSortingChanged(sorting),
    },
    pagination: { enabled: true, rows: 10, totalRecords: 0 },
  });

  constructor() {}

  ngOnInit(): void {
    this.initializeData();
    this.setupSubscriptions();
    // Limpiar filtros al inicializar para asegurar que no haya filtros activos
    this.dataviewConfig.clearFilters();

    // Debug: verificar valores de filtros después de limpiar
    setTimeout(() => {
      const filters = this.dataviewConfig.filters();
      console.log('Filtros después de limpiar:', filters.values);
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.ref) {
      this.ref.close();
    }
  }

  /**
   * Configura las suscripciones
   */
  private setupSubscriptions(): void {
    // Suscribirse a cambios en el caché de retiros para actualizar el dataview automáticamente
    this.retreatService.retreats$.pipe(takeUntil(this.destroy$)).subscribe(retreats => {
      this.updateDataviewData(retreats);
    });

    // Suscribirse al estado de carga
    this.retreatService.loadingRetreats$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.loading.set(loading);
    });
  }

  /**
   * Inicializa los datos
   */
  private async initializeData(): Promise<void> {
    try {
      // El observable retreats$ emitirá automáticamente cuando se carguen los datos
      // El observable loadingRetreats$ se encargará de mostrar el estado de carga
      await this.retreatService.getAll();
    } catch (error) {
      console.error('Error al inicializar datos:', error);
    }
  }

  /**
   * Actualiza los datos del dataview
   */
  private updateDataviewData(retreats: Retreat[]): void {
    const filteredData = this.filterAndSortData(retreats);
    this.dataviewConfig.setData(filteredData);
  }

  /**
   * Maneja cambios en los filtros
   */
  private onFiltersChanged(filters: { [key: string]: any }): void {
    const retreats = this.retreatService.retreats;
    this.updateDataviewData(retreats);
  }

  /**
   * Maneja cambios en el ordenamiento
   */
  private onSortingChanged(sorting: { field: string; order: string }): void {
    const retreats = this.retreatService.retreats;
    this.updateDataviewData(retreats);
  }

  /**
   * Filtra y ordena los datos
   */
  private filterAndSortData(retreats: Retreat[]): Retreat[] {
    let filtered = retreats;
    const filters = this.dataviewConfig.filters().values;
    const sorting = this.dataviewConfig.sorting();

    // Aplicar filtro de búsqueda
    if (filters['search']) {
      const search = filters['search'].toLowerCase();
      filtered = filtered.filter(
        retreat => retreat.displayNumber.toLowerCase().includes(search) || retreat.displayCommunityName.toLowerCase().includes(search) || retreat.retreatHomeName.toLowerCase().includes(search) || retreat.displayModality.toLowerCase().includes(search)
      );
    }

    // Aplicar filtro de estado
    if (filters['status'] !== 'all') {
      const isActive = filters['status'] === 'active';
      filtered = filtered.filter(retreat => retreat.is_active === isActive);
    }

    // Aplicar filtro de solicitudes
    if (filters['requests'] !== 'all') {
      const acceptsRequests = filters['requests'] === 'accepts';
      filtered = filtered.filter(retreat => retreat.accept_requests === acceptsRequests);
    }

    // Aplicar ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sorting.field) {
        case 'number':
          aValue = a.number;
          bValue = b.number;
          break;
        case 'number_desc':
          aValue = b.number;
          bValue = a.number;
          break;
        case 'modality':
          aValue = a.displayModality;
          bValue = b.displayModality;
          break;
        case 'modality_desc':
          aValue = b.displayModality;
          bValue = a.displayModality;
          break;
        case 'start_date':
          aValue = new Date(a.start_date).getTime();
          bValue = new Date(b.start_date).getTime();
          break;
        case 'status':
          aValue = a.is_active ? 1 : 0;
          bValue = b.is_active ? 1 : 0;
          break;
        default:
          aValue = a.number;
          bValue = b.number;
      }

      if (sorting.order === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }

  /**
   * Refresca los datos
   */
  async refreshData(): Promise<void> {
    try {
      // El observable loadingRetreats$ se encargará de mostrar el estado de carga
      await this.retreatService.refresh();
    } catch (error) {
      console.error('Error al refrescar datos:', error);
    }
  }

  /**
   * Copia el link del formulario
   */
  copyLink() {
    const user = Ss.authService.current_user();
    if (!user) {
      Ss.toastService.error({ message: 'No se pudo obtener el usuario' });
      Ss.authService.logout();
      return;
    }

    user.copyFormLink();
  }

  /**
   * Muestra el diálogo de nuevo retiro
   */
  showNewRetreatDialog() {
    if (this.loading()) return;

    new Retreat().openForm();
  }

  /**
   * Obtiene estadísticas
   */
  getStats(): { total: number; active: number; inactive: number } {
    return this.retreatService.getStats();
  }
}
