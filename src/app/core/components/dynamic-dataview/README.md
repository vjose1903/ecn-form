# Dynamic Dataview Component

Este componente proporciona una implementación dinámica del `p-dataview` de PrimeNG que permite configurar qué componentes usar para las vistas de lista y grid. Utiliza `p-selectButton` para cambiar entre los layouts de lista y grid.

## Características

- ✅ Vista dinámica de lista y grid
- ✅ Componentes configurables para cada vista
- ✅ Propiedades dinámicas para los componentes
- ✅ Paginación configurable
- ✅ Ordenamiento y filtros
- ✅ Cambio de layout dinámico
- ✅ Gestión automática del ciclo de vida de componentes

## Uso Básico

### 1. Importar el componente

```typescript
import { DynamicDataviewComponent, DynamicDataviewConfig } from './core/components/dynamic-dataview';
```

### 2. Crear componentes para lista y grid

```typescript
// list-item.component.ts
@Component({
  selector: 'list-item',
  standalone: true,
  template: `
    <div class="list-item">
      <h4>{{ item.title }}</h4>
      <p>{{ item.description }}</p>
    </div>
  `
})
export class ListItemComponent {
  @Input() item: any;
}

// grid-item.component.ts
@Component({
  selector: 'grid-item',
  standalone: true,
  template: `
    <div class="grid-item">
      <h5>{{ item.title }}</h5>
      <p>{{ item.description }}</p>
    </div>
  `
})
export class GridItemComponent {
  @Input() item: any;
}
```

### 3. Configurar y usar el componente

```typescript
@Component({
  selector: 'my-component',
  template: `
    <dynamic-dataview [config]="dataviewConfig"></dynamic-dataview>
  `,
  imports: [DynamicDataviewComponent]
})
export class MyComponent {
  dataviewConfig: DynamicDataviewConfig = {
    listComponent: ListItemComponent,
    gridComponent: GridItemComponent,
    data: [
      { title: 'Elemento 1', description: 'Descripción 1' },
      { title: 'Elemento 2', description: 'Descripción 2' }
    ],
    layout: 'list',
    componentProps: {
      showActions: true,
      enableSelection: false
    },
    pagination: {
      enabled: true,
      rows: 10
    }
  };
}
```

## Configuración

### DynamicDataviewConfig

```typescript
interface DynamicDataviewConfig<T = any> {
  // Componente a usar para la vista de lista
  listComponent: Type<any>;
  
  // Componente a usar para la vista de grid
  gridComponent: Type<any>;
  
  // Datos a mostrar
  data: T[];
  
  // Layout inicial ('list' | 'grid')
  layout?: 'list' | 'grid';
  
  // Propiedades adicionales para los componentes
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
```

## Propiedades de los Componentes

Los componentes que uses para lista y grid recibirán automáticamente:

- `item`: El elemento actual de los datos
- Todas las propiedades definidas en `componentProps`

```typescript
@Component({
  template: `
    <div>
      <h4>{{ item.title }}</h4>
      <p>{{ item.description }}</p>
      <button *ngIf="showActions">Acción</button>
    </div>
  `
})
export class MyListItemComponent {
  @Input() item: any;
  @Input() showActions: boolean = false; // Desde componentProps
}
```

## Eventos

El componente maneja automáticamente:

- Cambio de layout (list/grid)
- Carga lazy de datos
- Destrucción de componentes al cambiar de vista

## Estilos

El componente incluye estilos básicos que puedes personalizar:

```scss
.p-dataview-dynamic {
  .p-dataview-header {
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
  }
  
  .p-dataview-content {
    min-height: 200px;
  }
}
```

## Ejemplo Completo

Ver `example-usage.component.ts` para un ejemplo completo de implementación. 