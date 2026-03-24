import { Type, signal, Signal } from '@angular/core';

// Interfaces para los filtros
export interface FilterOption {
  label: string;
  value: any;
}

export interface FilterConfig {
  type: 'search' | 'select' | 'sort';
  key: string;
  label: string;
  placeholder?: string;
  options?: FilterOption[];
  defaultValue?: any;
  width?: string;
}

export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

export interface DynamicDataviewConfigData<T = any> {
  // Componente a usar para la vista de lista
  listComponent: Type<any>;
  
  // Componente a usar para la vista de grid
  gridComponent: Type<any>;
  
  // Datos a mostrar
  data: T[];
  
  // Configuración adicional del dataview
  layout?: 'list' | 'grid';

  // Clave para persistir el layout en localStorage
  layoutStorageKey?: string;
  
  // Propiedades adicionales que se pasarán a los componentes
  componentProps?: {
    [key: string]: any;
  };
  
  // Configuración de filtros
  filters?: {
    enabled: boolean;
    configs: FilterConfig[];
    values: { [key: string]: any };
    onFilterChange?: (filters: { [key: string]: any }) => void;
  };
  
  // Configuración de ordenamiento
  sorting?: {
    enabled: boolean;
    field: string;
    order: 'asc' | 'desc';
    options?: FilterOption[];
    onSortChange?: (sorting: SortConfig) => void;
  };
  
  // Configuración de paginación
  pagination?: {
    enabled: boolean;
    rows?: number;
    totalRecords?: number;
  };
}

export class DynamicDataviewConfig<T = any> {
  // Signals para cada propiedad
  readonly listComponent = signal<Type<any>>(null!);
  readonly gridComponent = signal<Type<any>>(null!);
  readonly data = signal<T[]>([]);
  readonly layout = signal<'list' | 'grid'>('list');
  readonly layoutStorageKey = signal<string | null>(null);
  readonly componentProps = signal<{[key: string]: any}>({});
  
  // Signals para filtros
  readonly filters = signal<{
    enabled: boolean;
    configs: FilterConfig[];
    values: { [key: string]: any };
    onFilterChange?: (filters: { [key: string]: any }) => void;
  }>({ enabled: false, configs: [], values: {} });
  
  // Signals para ordenamiento
  readonly sorting = signal<{
    enabled: boolean;
    field: string;
    order: 'asc' | 'desc';
    options?: FilterOption[];
    onSortChange?: (sorting: SortConfig) => void;
  }>({ enabled: false, field: '', order: 'asc' });
  
  // Signals para paginación
  readonly pagination = signal<{
    enabled: boolean;
    rows?: number;
    totalRecords?: number;
  }>({ enabled: false });

  constructor(config?: Partial<DynamicDataviewConfigData<T>>) {
    if (config) {
      this.updateConfig(config);
    }
  }

  // Método para actualizar toda la configuración
  updateConfig(config: Partial<DynamicDataviewConfigData<T>>): void {
    if (config.listComponent !== undefined) {
      this.listComponent.set(config.listComponent);
    }
    if (config.gridComponent !== undefined) {
      this.gridComponent.set(config.gridComponent);
    }
    if (config.data !== undefined) {
      this.data.set(config.data);
    }
    if (config.layout !== undefined) {
      this.layout.set(config.layout);
    }
    if (config.layoutStorageKey !== undefined) {
      this.layoutStorageKey.set(config.layoutStorageKey);
    }
    if (config.componentProps !== undefined) {
      this.componentProps.set(config.componentProps);
    }
    if (config.filters !== undefined) {
      this.filters.set(config.filters);
    }
    if (config.sorting !== undefined) {
      this.sorting.set(config.sorting);
    }
    if (config.pagination !== undefined) {
      this.pagination.set(config.pagination);
    }
  }

  // Métodos para actualizar propiedades individuales
  setListComponent(component: Type<any>): void {
    this.listComponent.set(component);
  }

  setGridComponent(component: Type<any>): void {
    this.gridComponent.set(component);
  }

  setData(data: T[]): void {
    this.data.set(data);
  }

  setLayout(layout: 'list' | 'grid'): void {
    this.layout.set(layout);
  }

  setLayoutStorageKey(key: string | null): void {
    this.layoutStorageKey.set(key);
  }

  setComponentProps(props: {[key: string]: any}): void {
    this.componentProps.set(props);
  }

  setFilters(filters: {
    enabled: boolean;
    configs: FilterConfig[];
    values: { [key: string]: any };
    onFilterChange?: (filters: { [key: string]: any }) => void;
  }): void {
    this.filters.set(filters);
  }

  setSorting(sorting: {
    enabled: boolean;
    field: string;
    order: 'asc' | 'desc';
    options?: FilterOption[];
    onSortChange?: (sorting: SortConfig) => void;
  }): void {
    this.sorting.set(sorting);
  }

  setPagination(pagination: {enabled: boolean; rows?: number; totalRecords?: number}): void {
    this.pagination.set(pagination);
  }

  // Métodos para actualizar valores de filtros
  updateFilterValue(key: string, value: any): void {
    const currentFilters = this.filters();
    const newValues = { ...currentFilters.values, [key]: value };
    this.filters.set({ ...currentFilters, values: newValues });
    
    if (currentFilters.onFilterChange) {
      currentFilters.onFilterChange(newValues);
    }
  }

  updateSorting(field: string, order: 'asc' | 'desc'): void {
    const currentSorting = this.sorting();
    const newSorting = { ...currentSorting, field, order };
    this.sorting.set(newSorting);
    
    if (currentSorting.onSortChange) {
      currentSorting.onSortChange(newSorting);
    }
  }

  clearFilters(): void {
    const currentFilters = this.filters();
    const clearedValues: { [key: string]: any } = {};
    
    // Resetear a valores por defecto
    currentFilters.configs.forEach(config => {
      clearedValues[config.key] = config.defaultValue || '';
    });
    
    this.filters.set({ ...currentFilters, values: clearedValues });
    
    if (currentFilters.onFilterChange) {
      currentFilters.onFilterChange(clearedValues);
    }
  }
} 
