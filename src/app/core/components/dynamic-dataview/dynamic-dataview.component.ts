import { Component, input, OnInit, ViewChildren, QueryList, OnDestroy, signal, computed, effect, AfterViewInit, ChangeDetectorRef, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DynamicDataviewConfig } from './dynamic-dataview.config';
import { DynamicListDirective } from './directives/dynamic-list.directive';
import { DynamicGridDirective } from './directives/dynamic-grid.directive';

@Component({
  selector: 'dynamic-dataview',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectButtonModule, DynamicListDirective, DynamicGridDirective],
  templateUrl: './dynamic-dataview.component.html',
  styleUrl: './dynamic-dataview.component.scss',
})
export class DynamicDataviewComponent implements OnInit, AfterViewInit, OnDestroy {
  config = input.required<DynamicDataviewConfig>();

  @ViewChildren(DynamicListDirective) listDirectives!: QueryList<DynamicListDirective>;
  @ViewChildren(DynamicGridDirective) gridDirectives!: QueryList<DynamicGridDirective>;

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

  // Signal para controlar cuando intentar cargar componentes
  private loadTrigger = signal(0);

  layoutOptions = [
    { label: 'Lista', value: 'list', icon: 'pi pi-list' },
    { label: 'Grid', value: 'grid', icon: 'pi pi-th-large' },
  ];

  private componentRefs: any[] = [];
  private cdr = inject(ChangeDetectorRef);
  private subscriptions: any[] = [];

  constructor() {
    // Effect para manejar la carga de componentes
    effect(() => {
      const currentData = this.data();
      const currentLayout = this.layout();
      const trigger = this.loadTrigger();

      if (currentData && currentData.length > 0) {
        this.tryLoadComponents();
      }
    });
  }

  ngOnInit() {
    const configLayout = this.config().layout();
    if (configLayout) {
      this.layout.set(configLayout);
    }
  }

  ngAfterViewInit() {
    // Suscribirse a cambios en las directivas
    this.subscriptions.push(
      this.listDirectives.changes.subscribe(() => {
        this.loadTrigger.update(v => v + 1);
      })
    );

    this.subscriptions.push(
      this.gridDirectives.changes.subscribe(() => {
        this.loadTrigger.update(v => v + 1);
      })
    );

    // Trigger inicial
    this.loadTrigger.update(v => v + 1);
  }

  ngOnDestroy() {
    this.destroyAllComponents();
    // Limpiar suscripciones
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  onLayoutChange(event: any) {
    this.layout.set(event.value);
    this.loadTrigger.update(v => v + 1);
  }

  private tryLoadComponents() {
    const currentData = this.data();
    const currentLayout = this.layout();

    if (currentData && currentData.length > 0) {
      const directives = currentLayout === 'list' ? this.listDirectives : this.gridDirectives;

      if (directives && directives.length > 0) {
        this.loadComponents(currentData, currentLayout);
      } else {
      }
    } else {
    }
  }

  private loadComponents(items: any[], layout: 'list' | 'grid') {
    this.destroyAllComponents();

    const directives = layout === 'list' ? this.listDirectives : this.gridDirectives;
    const componentType = layout === 'list' ? this.listComponent() : this.gridComponent();

    if (directives.length === 0) {
      console.error('No directives available for layout:', layout);
      return;
    }

    if (!componentType) {
      console.error('Component type not available for layout:', layout);
      return;
    }

    // Crear un componente por cada directiva disponible
    directives.forEach((directive, index) => {
      const item = items[index];
      if (item) {
        const componentRef = directive.viewContainerRef.createComponent(componentType);
        this.setComponentProperties(componentRef, item);
        this.componentRefs.push(componentRef);
      }
    });

    this.cdr.detectChanges();
  }

  private setComponentProperties(componentRef: any, item: any) {
    const props = this.componentProps();

    // Pasar el item como dato al componente hijo
    (componentRef.instance as any).item = item;

    // Pasar las propiedades adicionales
    if (props) {
      Object.keys(props).forEach(key => {
        (componentRef.instance as any)[key] = props[key];
      });
    }
  }

  private destroyAllComponents() {
    this.componentRefs.forEach(ref => {
      if (ref) {
        ref.destroy();
      }
    });
    this.componentRefs = [];
  }

  onLazyLoad(event: any) {
    // Aquí puedes manejar la carga lazy si es necesaria
  }

  // Método para preparar los inputs de los componentes hijos
  getComponentInputs(item: any) {
    return {
      item: item,
      ...this.componentProps(),
    };
  }

  // Método para crear un componente hijo con datos
  createChildComponent(container: ViewContainerRef, componentType: any, item: any, props: any = {}) {
    const componentRef = container.createComponent(componentType);

    // Pasar el item como dato al componente hijo
    (componentRef.instance as any).item = item;

    // Pasar las propiedades adicionales
    if (props) {
      Object.keys(props).forEach(key => {
        (componentRef.instance as any)[key] = props[key];
      });
    }

    return componentRef;
  }
}
