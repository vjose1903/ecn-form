
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { DynamicDataviewComponent, DynamicDataviewConfig, FilterConfig } from '@core/components/dynamic-dataview';
import { RetreatHomeDataList } from './components/retreat-home-data-list/retreat-home-data-list';
import { RetreatHomeDataGrid } from './components/retreat-home-data-grid/retreat-home-data-grid';
import { RetreatHomeAssignmentOverview, RetreatHomeAssignmentPermissions, RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { RetreatHomeClass } from '@core/entities/retreat-home/retreat-home.class';
import { Subject, takeUntil } from 'rxjs';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-retreat-home-list',
  imports: [ButtonModule, DialogModule, DynamicDataviewComponent],
  templateUrl: './retreat-home-list.html',
  styleUrl: './retreat-home-list.scss',
})
export class RetreatHomeList implements OnInit, OnDestroy {
  private retreatHomeService = inject(RetreatHomeService);
  private destroy$ = new Subject<void>();

  ref: DynamicDialogRef | undefined;
  loading = signal(false);
  assignmentDialogVisible = signal(false);
  assignmentLoading = signal(false);
  assignmentLinksLoading = signal(false);
  assignmentSaving = signal(false);
  assignmentError = signal('');
  assignmentMode = signal<'associate' | 'unassociate'>('associate');
  assignmentPermissions = signal<RetreatHomeAssignmentPermissions>({canAssign: false, canUnassign: false});
  assignmentOverview = signal<RetreatHomeAssignmentOverview>({homes: [], cities: [], assignments: []});
  selectedHomeIds = signal<string[]>([]);
  selectedCityIds = signal<string[]>([]);
  homeSearch = signal('');
  citySearch = signal('');

  get isSuperAdmin(): boolean {
    return Ss.authService.isSuperAdmin();
  }

  get canManageAssignments(): boolean {
    return this.isSuperAdmin || this.assignmentPermissions().canAssign || this.assignmentPermissions().canUnassign;
  }

  get filteredAssignmentHomes(): RetreatHomeAssignmentOverview['homes'] {
    const search = this.homeSearch().trim().toLocaleLowerCase();
    return this.assignmentOverview().homes.filter(home => !search || `${home.name} ${home.address}`.toLocaleLowerCase().includes(search));
  }

  get filteredAssignmentCities(): RetreatHomeAssignmentOverview['cities'] {
    const search = this.citySearch().trim().toLocaleLowerCase();
    return this.assignmentOverview().cities.filter(city => !search || city.label.toLocaleLowerCase().includes(search));
  }

  get selectedRelationCount(): number {
    const existing = new Set(this.assignmentOverview().assignments);
    return this.selectedCityIds().reduce((count, cityId) => count + this.selectedHomeIds().filter(homeId => {
      const isAssigned = existing.has(`${cityId}/${homeId}`);
      return this.assignmentMode() === 'associate' ? !isAssigned : isAssigned;
    }).length, 0);
  }

  // Opciones para filtros
  statusOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Activos', value: 'active' },
    { label: 'Inactivos', value: 'inactive' },
  ];

  sortOptions = [
    { label: 'Nombre', value: 'name' },
    { label: 'Dirección', value: 'address' },
    { label: 'Estado', value: 'status' },
  ];

  // Configuración de filtros
  filterConfigs: FilterConfig[] = [
    {
      type: 'search',
      key: 'search',
      label: 'Buscar',
      placeholder: 'Buscar por nombre, dirección o teléfono...',
      defaultValue: '',
    },
    {
      type: 'select',
      key: 'status',
      label: 'Estado',
      placeholder: '...',
      options: this.statusOptions,
      defaultValue: 'all',
      width: 'w-full md:w-48',
    },
    {
      type: 'sort',
      key: 'sort',
      label: 'Ordenar por',
      placeholder: '...',
      options: this.sortOptions,
      defaultValue: 'name',
    },
  ];

  dataviewConfig = new DynamicDataviewConfig({
    listComponent: RetreatHomeDataList,
    gridComponent: RetreatHomeDataGrid,
    layout: 'list',
    layoutStorageKey: 'retreat_homes',
    componentProps: {
      showActions: true,
      enableSelection: false,
      onAssignmentRequest: (homeId: string) => this.showAssignmentDialog(homeId),
    },
    filters: {
      enabled: true,
      configs: this.filterConfigs,
      values: {
        search: '',
        status: 'all',
        sort: 'name',
      },
      onFilterChange: filters => this.onFiltersChanged(filters),
    },
    sorting: {
      enabled: true,
      field: 'name',
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.ref) {
      this.ref.close();
    }
  }

  /**
   * Inicializa los datos
   */
  private async initializeData(): Promise<void> {
    try {
      this.loading.set(true);
      this.assignmentPermissions.set(await this.retreatHomeService.getRetreatHomeAssignmentPermissions());
      this.dataviewConfig.setComponentProps({
        showActions: true,
        enableSelection: false,
        canAssignHomes: this.assignmentPermissions().canAssign,
        canUnassignHomes: this.assignmentPermissions().canUnassign,
        onAssignmentRequest: (homeId: string) => this.showAssignmentDialog(homeId),
      });
      await this.getRetreatHomes();
    } catch (error) {
      console.error('Error al inicializar datos:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Configura las suscripciones
   */
  private setupSubscriptions(): void {
    // Suscripción a cambios en el servicio
    this.retreatHomeService.retreatHomes$.pipe(takeUntil(this.destroy$)).subscribe(retreats => {
      this.updateDataviewData(retreats);
    });

    // Suscripción al estado de carga
    this.retreatHomeService.loadingRetreatHomes$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.loading.set(loading);
    });
  }

  /**
   * Obtiene las casas de retiro
   */
  async getRetreatHomes(): Promise<void> {
    try {
      const retreats = await this.retreatHomeService.getAll();
      this.updateDataviewData(retreats);
    } catch (error) {
      console.error('Error al obtener casas de retiro:', error);
    }
  }

  /**
   * Actualiza los datos del dataview
   */
  private updateDataviewData(retreats: RetreatHomeClass[]): void {
    const filteredData = this.filterAndSortData(retreats);
    this.dataviewConfig.setData(filteredData);
  }

  /**
   * Maneja cambios en los filtros
   */
  private onFiltersChanged(filters: { [key: string]: any }): void {
    const retreats = this.retreatHomeService.retreatHomes;
    this.updateDataviewData(retreats);
  }

  /**
   * Maneja cambios en el ordenamiento
   */
  private onSortingChanged(sorting: { field: string; order: 'asc' | 'desc' }): void {
    const retreats = this.retreatHomeService.retreatHomes;
    this.updateDataviewData(retreats);
  }

  /**
   * Filtra y ordena los datos
   */
  private filterAndSortData(retreats: RetreatHomeClass[]): RetreatHomeClass[] {
    let filtered = retreats;
    const filters = this.dataviewConfig.filters().values;
    const sorting = this.dataviewConfig.sorting();

    // Aplicar filtro de búsqueda
    if (filters['search']) {
      const search = filters['search'].toLowerCase();
      filtered = filtered.filter(retreat => retreat.displayName.toLowerCase().includes(search) || retreat.displayAddress.toLowerCase().includes(search) || retreat.phone.toLowerCase().includes(search));
    }

    // Aplicar filtro de estado
    if (filters['status'] !== 'all') {
      const isActive = filters['status'] === 'active';
      filtered = filtered.filter(retreat => retreat.is_active === isActive);
    }

    // Aplicar ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sorting.field) {
        case 'name':
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
          break;
        case 'address':
          aValue = a.displayAddress.toLowerCase();
          bValue = b.displayAddress.toLowerCase();
          break;
        case 'status':
          aValue = a.is_active ? 1 : 0;
          bValue = b.is_active ? 1 : 0;
          break;
        default:
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
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
      this.loading.set(true);
      await this.retreatHomeService.refresh();
    } catch (error) {
      console.error('Error al refrescar datos:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Muestra el diálogo para crear nueva casa de retiro
   */
  showNewRetreatDialog(): void {
    if (this.loading()) return;

    new RetreatHomeClass().openForm();
  }

  async showAssignmentDialog(homeId?: string): Promise<void> {
    this.assignmentLoading.set(true);
    this.assignmentLinksLoading.set(false);
    this.assignmentError.set('');
    try {
      const permissions = await this.retreatHomeService.getRetreatHomeAssignmentPermissions();
      if (!permissions.canAssign && !permissions.canUnassign) return;
      this.assignmentPermissions.set(permissions);
      this.assignmentDialogVisible.set(true);
      const options = await this.retreatHomeService.getRetreatHomeAssignmentOptions();
      this.assignmentOverview.set({...options, assignments: []});
      this.assignmentMode.set(permissions.canAssign ? 'associate' : 'unassociate');
      this.selectedHomeIds.set(homeId && options.homes.some(home => home.id === homeId) ? [homeId] : []);
      this.selectedCityIds.set(this.isSuperAdmin ? [] : options.cities.map(city => city.id));
      this.homeSearch.set('');
      this.citySearch.set('');
      void this.loadAssignmentLinks(options.cities.map(city => city.id));
    } catch (error) {
      console.error('Error al cargar asignaciones de casas:', JSON.stringify(error));
      Ss.toastService.error({title: 'Error', message: 'No se pudieron cargar las casas y ciudades.'});
      this.assignmentDialogVisible.set(false);
    } finally {
      this.assignmentLoading.set(false);
    }
  }

  private async loadAssignmentLinks(cityIds: string[]): Promise<void> {
    this.assignmentLinksLoading.set(true);
    this.assignmentError.set('');
    try {
      const assignments = await this.retreatHomeService.getRetreatHomeAssignments(cityIds);
      this.assignmentOverview.update(overview => ({...overview, assignments}));
    } catch (error) {
      console.error('Error al cargar las relaciones de casas:', JSON.stringify(error));
      this.assignmentError.set('No se pudieron cargar las relaciones actuales. Reintenta antes de guardar cambios.');
    } finally {
      this.assignmentLinksLoading.set(false);
    }
  }

  retryAssignmentLinks(): void {
    void this.loadAssignmentLinks(this.assignmentOverview().cities.map(city => city.id));
  }

  toggleHome(homeId: string, checked: boolean): void {
    this.selectedHomeIds.update(ids => checked ? [...ids, homeId] : ids.filter(id => id !== homeId));
  }

  toggleCity(cityId: string, checked: boolean): void {
    this.selectedCityIds.update(ids => checked ? [...ids, cityId] : ids.filter(id => id !== cityId));
  }

  selectVisibleHomes(): void {
    this.selectedHomeIds.update(ids => [...new Set([...ids, ...this.filteredAssignmentHomes.map(home => home.id)])]);
  }

  selectVisibleCities(): void {
    this.selectedCityIds.update(ids => [...new Set([...ids, ...this.filteredAssignmentCities.map(city => city.id)])]);
  }

  async saveAssignments(): Promise<void> {
    if (!this.selectedRelationCount || this.assignmentSaving()) return;
    try {
      this.assignmentSaving.set(true);
      const changed = await this.retreatHomeService.updateRetreatHomeAssignments(
        this.selectedHomeIds(),
        this.selectedCityIds(),
        this.assignmentMode() === 'associate',
      );
      this.assignmentDialogVisible.set(false);
      Ss.toastService.success({
        title: this.assignmentMode() === 'associate' ? 'Asociaciones creadas' : 'Asociaciones eliminadas',
        message: `${changed} relación${changed === 1 ? '' : 'es'} actualizada${changed === 1 ? '' : 's'}.`,
      });
      const activeCityId = Ss.authService.activeCityId() || Ss.authService.current_user()?.city;
      if (activeCityId && this.selectedCityIds().includes(activeCityId)) await this.refreshData();
    } catch (error) {
      console.error('Error al actualizar asociaciones de casas:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo completar', message: error instanceof Error ? error.message : 'No se actualizaron las asociaciones.'});
    } finally {
      this.assignmentSaving.set(false);
    }
  }
}
