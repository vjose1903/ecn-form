import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeForm } from './retreat-home-form/retreat-home-form';
import { DynamicDataviewComponent, DynamicDataviewConfig } from '@core/components/dynamic-dataview';
import { RetreatHomeDataList } from './components/retreat-home-data-list/retreat-home-data-list';
import { RetreatHomeDataGrid } from './components/retreat-home-data-grid/retreat-home-data-grid';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-retreat-home-list',
  imports: [CommonModule, ButtonModule, DynamicDataviewComponent, InputTextModule, TooltipModule],
  templateUrl: './retreat-home-list.html',
  styleUrl: './retreat-home-list.scss',
})
export class RetreatHomeList implements OnInit, OnDestroy {
  private retreatHomeService = inject(RetreatHomeService);
  private dialogService = inject(DialogService);
  private destroy$ = new Subject<void>();

  ref: DynamicDialogRef | undefined;
  loading = signal(false);
  searchTerm = signal('');
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  sortBy = signal<'name' | 'address' | 'status'>('name');
  sortOrder = signal<'asc' | 'desc'>('asc');

  dataviewConfig = new DynamicDataviewConfig({
    listComponent: RetreatHomeDataList,
    gridComponent: RetreatHomeDataGrid,
    layout: 'list',
    componentProps: { showActions: true, enableSelection: false },
    pagination: { enabled: true, rows: 10, totalRecords: 0 },
    sortField: 'name',
    sortOrder: 1,
  });

  // Opciones para filtros
  statusOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Activos', value: 'active' },
    { label: 'Inactivos', value: 'inactive' }
  ];

  sortOptions = [
    { label: 'Nombre', value: 'name' },
    { label: 'Dirección', value: 'address' },
    { label: 'Estado', value: 'status' }
  ];

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
    // Suscripción a cambios de recarga
    this.retreatHomeService.reload$
      .pipe(takeUntil(this.destroy$))
      .subscribe(reload => {
        if (reload) {
          this.getRetreatHomes();
          this.retreatHomeService.setReload(false);
        }
      });

    // Suscripción a cambios en el servicio
    this.retreatHomeService.retreatHomes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(retreats => {
        this.updateDataviewData(retreats);
      });

    // Suscripción al estado de carga
    this.retreatHomeService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
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
  private updateDataviewData(retreats: RetreatHome[]): void {
    const filteredData = this.filterAndSortData(retreats);
    this.dataviewConfig.setData(filteredData);
  }

  /**
   * Filtra y ordena los datos
   */
  private filterAndSortData(retreats: RetreatHome[]): RetreatHome[] {
    let filtered = retreats;

    // Aplicar filtro de búsqueda
    if (this.searchTerm()) {
      const search = this.searchTerm().toLowerCase();
      filtered = filtered.filter(retreat => 
        retreat.displayName.toLowerCase().includes(search) ||
        retreat.displayAddress.toLowerCase().includes(search) ||
        retreat.phone.toLowerCase().includes(search)
      );
    }

    // Aplicar filtro de estado
    if (this.statusFilter() !== 'all') {
      const isActive = this.statusFilter() === 'active';
      filtered = filtered.filter(retreat => retreat.is_active === isActive);
    }

    // Aplicar ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (this.sortBy()) {
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

      if (this.sortOrder() === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }

  /**
   * Maneja el cambio en el término de búsqueda
   */
  onSearchChange(event: any): void {
    this.searchTerm.set(event.target.value);
    this.applyFilters();
  }

  /**
   * Maneja el cambio en el filtro de estado
   */
  onStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter.set(target.value as 'all' | 'active' | 'inactive');
    this.applyFilters();
  }

  /**
   * Maneja el cambio en el ordenamiento
   */
  onSortChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sortBy.set(target.value as 'name' | 'address' | 'status');
    this.applyFilters();
  }

  /**
   * Cambia el orden de clasificación
   */
  toggleSortOrder(): void {
    this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    this.applyFilters();
  }

  /**
   * Aplica los filtros
   */
  private applyFilters(): void {
    const retreats = this.retreatHomeService.retreatHomes;
    this.updateDataviewData(retreats);
  }

  /**
   * Limpia los filtros
   */
  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
    this.sortBy.set('name');
    this.sortOrder.set('asc');
    this.applyFilters();
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

    this.ref = this.dialogService.open(RetreatHomeForm, {
      header: 'Nueva Casa de Retiro',
      width: '70%',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      maximizable: true,
      modal: true,
      breakpoints: { '960px': '75vw', '640px': '90vw' },
      data: { retreatHome: undefined },
    });

    this.ref.onClose
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result) {
          this.retreatHomeService.setReload(true);
        }
        this.ref = undefined;
      });
  }

  /**
   * Obtiene estadísticas
   */
  getStats(): { total: number; active: number; inactive: number } {
    return this.retreatHomeService.getStats();
  }

  /**
   * Obtiene el icono de ordenamiento
   */
  getSortIcon(): string {
    return this.sortOrder() === 'asc' ? 'pi pi-sort-up' : 'pi pi-sort-down';
  }

  /**
   * Verifica si hay filtros activos
   */
  get hasActiveFilters(): boolean {
    return this.searchTerm() !== '' || this.statusFilter() !== 'all';
  }

  /**
   * Obtiene el texto del filtro de estado
   */
  getStatusFilterText(): string {
    const option = this.statusOptions.find(opt => opt.value === this.statusFilter());
    return option ? option.label : 'Todos';
  }

  /**
   * Obtiene el texto del ordenamiento
   */
  getSortText(): string {
    const option = this.sortOptions.find(opt => opt.value === this.sortBy());
    return option ? option.label : 'Nombre';
  }
}
