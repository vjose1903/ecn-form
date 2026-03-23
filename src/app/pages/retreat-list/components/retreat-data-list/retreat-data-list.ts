import { Component, inject, Input, signal, OnDestroy, OnInit } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DialogService } from 'primeng/dynamicdialog';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'app-retreat-data-list',
  standalone: true,
  imports: [ButtonModule, CardModule, TooltipModule, TagModule],
  templateUrl: './retreat-data-list.html',
  providers: [DialogService],
})
export class RetreatDataList implements OnInit, OnDestroy {
  private retreatService = inject(RetreatService);
  private dialogService = inject(DialogService);
  private destroy$ = new Subject<void>();

  @Input() item!: RetreatClass;
  @Input() showActions: boolean = true;
  @Input() enableSelection: boolean = false;

  loading = signal(false);

  constructor() {}

  ngOnInit(): void {
    // Configurar debounce para evitar múltiples clicks
    this.destroy$.pipe(debounceTime(300)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Obtiene la clase CSS para el estado de carga
   */
  getLoadingClass(): string {
    return this.loading() ? 'opacity-50 pointer-events-none' : '';
  }

  /**
   * Maneja el click en la tarjeta
   */
  onCardClick(event: Event): void {
    if (this.loading()) return;

    // Evitar que se ejecute si se hizo click en un botón
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.p-button')) {
      return;
    }

    this.openRetreatView();
  }

  /**
   * Abre la vista detallada del retiro
   */
  async openRetreatView(): Promise<void> {
    if (this.loading()) return;

    try {
      this.loading.set(true);
      await this.item.openView();
    } catch (error) {
      console.error('Error al abrir vista:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Abre el formulario de edición
   */
  async openEditForm(): Promise<void> {
    if (this.loading()) return;

    try {
      this.loading.set(true);
      await this.item.openForm();
    } catch (error) {
      console.error('Error al abrir formulario:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Confirma el cambio de estado
   */
  async confirmToggleStatus(): Promise<void> {
    if (this.loading()) return;

    try {
      this.loading.set(true);
      await this.item.confirmToggleStatus();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
    } finally {
      this.loading.set(false);
    }
  }
}
