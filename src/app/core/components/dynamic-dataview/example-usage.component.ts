import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DynamicDataviewComponent, DynamicDataviewConfig, ListItemComponent, GridItemComponent } from './index';

@Component({
  selector: 'example-usage',
  standalone: true,
  imports: [CommonModule, DynamicDataviewComponent, ListItemComponent, GridItemComponent],
  template: `
    <div class="p-4">
      <h2>Ejemplo de uso del Dynamic Dataview con Signals</h2>
      
      <dynamic-dataview [config]="dataviewConfig"></dynamic-dataview>
      
      <div class="mt-4">
        <h3>Controles de ejemplo:</h3>
        <button (click)="updateData()" class="p-button p-button-primary mr-2">
          Actualizar Datos
        </button>
        <button (click)="toggleLayout()" class="p-button p-button-secondary mr-2">
          Cambiar Layout
        </button>
        <button (click)="updatePagination()" class="p-button p-button-success">
          Cambiar Paginación
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `]
})
export class ExampleUsageComponent {
  dataviewConfig = new DynamicDataviewConfig({
    listComponent: ListItemComponent,
    gridComponent: GridItemComponent,
    data: [
      {
        id: 1,
        title: 'Elemento 1',
        description: 'Descripción del primer elemento',
        category: 'Categoría A'
      },
      {
        id: 2,
        title: 'Elemento 2',
        description: 'Descripción del segundo elemento',
        category: 'Categoría B'
      },
      {
        id: 3,
        title: 'Elemento 3',
        description: 'Descripción del tercer elemento',
        category: 'Categoría A'
      },
      {
        id: 4,
        title: 'Elemento 4',
        description: 'Descripción del cuarto elemento',
        category: 'Categoría C'
      }
    ],
    layout: 'list',
    componentProps: {
      showActions: true,
      enableSelection: false
    },
    pagination: {
      enabled: true,
      rows: 5,
      totalRecords: 4
    },
    sortField: 'title',
    sortOrder: 1
  });

  updateData() {
    const newData = [
      { id: 5, title: 'Nuevo Elemento', description: 'Descripción actualizada', category: 'Nueva Categoría' },
      { id: 6, title: 'Otro Elemento', description: 'Otra descripción', category: 'Categoría B' }
    ];
    this.dataviewConfig.setData(newData);
  }

  toggleLayout() {
    const currentLayout = this.dataviewConfig.layout();
    this.dataviewConfig.setLayout(currentLayout === 'list' ? 'grid' : 'list');
  }

  updatePagination() {
    this.dataviewConfig.setPagination({
      enabled: true,
      rows: 3,
      totalRecords: 6
    });
  }
} 