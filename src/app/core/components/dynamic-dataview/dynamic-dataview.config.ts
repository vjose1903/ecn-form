import { Type, signal, Signal } from '@angular/core';

export interface DynamicDataviewConfigData<T = any> {
  // Componente a usar para la vista de lista
  listComponent: Type<any>;
  
  // Componente a usar para la vista de grid
  gridComponent: Type<any>;
  
  // Datos a mostrar
  data: T[];
  
  // Configuración adicional del dataview
  layout?: 'list' | 'grid';
  
  // Propiedades adicionales que se pasarán a los componentes
  componentProps?: {
    [key: string]: any;
  };
  
  // Configuración de paginación
  pagination?: {
    enabled: boolean;
    rows?: number;
    totalRecords?: number;
  };
  
  // Configuración de ordenamiento
  sortField?: string;
  sortOrder?: number;
  
  // Configuración de filtros
  filters?: any;
}

export class DynamicDataviewConfig<T = any> {
  // Signals para cada propiedad
  readonly listComponent = signal<Type<any>>(null!);
  readonly gridComponent = signal<Type<any>>(null!);
  readonly data = signal<T[]>([]);
  readonly layout = signal<'list' | 'grid'>('list');
  readonly componentProps = signal<{[key: string]: any}>({});
  readonly pagination = signal<{
    enabled: boolean;
    rows?: number;
    totalRecords?: number;
  }>({ enabled: false });
  readonly sortField = signal<string>('');
  readonly sortOrder = signal<number>(1);
  readonly filters = signal<any>(null);

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
    if (config.componentProps !== undefined) {
      this.componentProps.set(config.componentProps);
    }
    if (config.pagination !== undefined) {
      this.pagination.set(config.pagination);
    }
    if (config.sortField !== undefined) {
      this.sortField.set(config.sortField);
    }
    if (config.sortOrder !== undefined) {
      this.sortOrder.set(config.sortOrder);
    }
    if (config.filters !== undefined) {
      this.filters.set(config.filters);
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

  setComponentProps(props: {[key: string]: any}): void {
    this.componentProps.set(props);
  }

  setPagination(pagination: {enabled: boolean; rows?: number; totalRecords?: number}): void {
    this.pagination.set(pagination);
  }

  setSorting(sortField: string, sortOrder: number): void {
    this.sortField.set(sortField);
    this.sortOrder.set(sortOrder);
  }

  setFilters(filters: any): void {
    this.filters.set(filters);
  }
} 