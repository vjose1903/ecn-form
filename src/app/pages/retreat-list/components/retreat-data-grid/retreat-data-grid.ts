import { Component, inject, Input, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { RetreatView } from '../retreat-view/retreat-view';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { Subject, debounceTime, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-data-grid',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule],
  templateUrl: './retreat-data-grid.html',
  providers: [DialogService],
})
export class RetreatDataGrid implements OnInit, OnDestroy {
  private retreatService = inject(RetreatService);
  private dialogService = inject(DialogService);
  private destroy$ = new Subject<void>();

  @Input() item!: Retreat;
  @Input() showActions: boolean = true;
  @Input() enableSelection: boolean = false;

  loading = signal(false);
  dialogRef: DynamicDialogRef | undefined;

  constructor() {}

  ngOnInit(): void {
    // Configurar debounce para evitar múltiples clicks
    this.destroy$.pipe(debounceTime(300)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.dialogRef) {
      this.dialogRef.close();
    }
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
  openRetreatView(): void {
    if (this.loading()) return;

    this.dialogRef = this.dialogService.open(RetreatView, {
      header: this.item.displayNumber,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreat: this.item,
      },
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    // Limpiar referencia cuando se cierre
    this.dialogRef.onClose.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.dialogRef = undefined;
    });
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
