import { Component, input, OnInit, ViewChild, ViewContainerRef, ComponentRef, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataViewModule } from 'primeng/dataview';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DynamicDataviewConfig } from './dynamic-dataview.config';

@Component({
  selector: 'dynamic-dataview',
  standalone: true,
  imports: [CommonModule, FormsModule, DataViewModule, SelectButtonModule],
  templateUrl: './dynamic-dataview.component.html',
  styleUrl: './dynamic-dataview.component.scss',
})
export class DynamicDataviewComponent implements OnInit, OnDestroy {
  config = input.required<DynamicDataviewConfig>();
  @ViewChild('listContainer', { read: ViewContainerRef }) listContainer!: ViewContainerRef;
  @ViewChild('gridContainer', { read: ViewContainerRef }) gridContainer!: ViewContainerRef;

  // Signals computados para acceder a los valores de configuración
  readonly listComponent = computed(() => this.config().listComponent());
  readonly gridComponent = computed(() => this.config().gridComponent());
  readonly data = computed(() => this.config().data());
  readonly componentProps = computed(() => this.config().componentProps());
  readonly pagination = computed(() => this.config().pagination());
  readonly sortField = computed(() => this.config().sortField());
  readonly sortOrder = computed(() => this.config().sortOrder());
  readonly filters = computed(() => this.config().filters());

  // Signal para el layout actual
  layout = signal<'list' | 'grid'>('list');

  listComponentRef?: ComponentRef<any>;
  gridComponentRef?: ComponentRef<any>;

  layoutOptions = [
    { label: 'Lista', value: 'list', icon: 'pi pi-list' },
    { label: 'Grid', value: 'grid', icon: 'pi pi-th-large' },
  ];

  ngOnInit() {
    const configLayout = this.config().layout();
    if (configLayout) {
      this.layout.set(configLayout);
    }
  }

  ngOnDestroy() {
    this.destroyComponents();
  }

  onLayoutChange(event: any) {
    this.layout.set(event.value);
    this.loadComponent();
  }

  loadComponent() {
    this.destroyComponents();

    if (this.layout() === 'list') {
      this.loadListComponent();
    } else {
      this.loadGridComponent();
    }
  }

  private loadListComponent() {
    if (this.listContainer && this.listComponent()) {
      this.listComponentRef = this.listContainer.createComponent(this.listComponent());
      this.setComponentProperties(this.listComponentRef);
    }
  }

  private loadGridComponent() {
    if (this.gridContainer && this.gridComponent()) {
      this.gridComponentRef = this.gridContainer.createComponent(this.gridComponent());
      this.setComponentProperties(this.gridComponentRef);
    }
  }

  private setComponentProperties(componentRef: ComponentRef<any>) {
    const props = this.componentProps();
    if (props) {
      Object.keys(props).forEach(key => {
        componentRef.instance[key] = props[key];
      });
    }
  }

  private destroyComponents() {
    if (this.listComponentRef) {
      this.listComponentRef.destroy();
      this.listComponentRef = undefined;
    }
    if (this.gridComponentRef) {
      this.gridComponentRef.destroy();
      this.gridComponentRef = undefined;
    }
  }

  onLazyLoad(event: any) {
    // Aquí puedes manejar la carga lazy si es necesaria
    console.log('Lazy load event:', event);
  }
}
