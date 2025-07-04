import { Component, inject, Input, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { TagModule } from 'primeng/tag';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeView } from '../retreat-home-view/retreat-home-view';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-home-data-grid',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule],
  templateUrl: './retreat-home-data-grid.html',
  providers: [DialogService],
})
export class RetreatHomeDataGrid implements OnInit, OnDestroy {
  private retreatHomeService = inject(RetreatHomeService);
  private dialogService = inject(DialogService);
  private destroy$ = new Subject<void>();

  @Input() item!: RetreatHome;
  @Input() showActions: boolean = true;
  @Input() enableSelection: boolean = false;

  loading = signal(false);
  imageLoaded = signal(false);
  imageError = signal(false);
  dialogRef: DynamicDialogRef | undefined;

  constructor() {}

  ngOnInit(): void {
    // Preload de imagen para mejor UX
    this.preloadImage();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Cerrar dialog si está abierto
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  /**
   * Precarga la imagen principal
   */
  private preloadImage(): void {
    if (!this.item.mainImageUrl) {
      this.imageLoaded.set(true);
      return;
    }

    const img = new Image();
    img.onload = () => {
      this.imageLoaded.set(true);
    };
    img.onerror = () => {
      this.imageError.set(true);
      this.imageLoaded.set(true);
    };
    img.src = this.item.mainImageUrl;
  }

  /**
   * Abre la vista detallada de la casa de retiro
   */
  openRetreatHomeView(): void {
    if (this.loading()) return;

    this.dialogRef = this.dialogService.open(RetreatHomeView, {
      header: this.item.displayName,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreatHome: this.item,
      },
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    // Limpiar referencia cuando se cierre
    this.dialogRef.onClose.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.dialogRef = undefined;
    });
  }

  /**
   * Confirma el cambio de estado con debounce
   */
  confirmToggleStatus(retreatHome: RetreatHome): void {
    if (this.loading()) return;

    // Debounce para evitar múltiples clicks
    this.loading.set(true);

    setTimeout(() => {
      retreatHome.confirmToggleStatus(retreatHome).finally(() => this.loading.set(false));
    }, 100);
  }

  /**
   * Abre el formulario de edición
   */
  openEditForm(): void {
    if (this.loading()) return;

    this.item.openForm().catch(error => {
      console.error('Error al abrir formulario:', error);
    });
  }

  /**
   * Maneja el click en la tarjeta
   */
  onCardClick(event: Event): void {
    // Evitar abrir vista si se hizo click en un botón
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.p-button')) {
      return;
    }

    this.openRetreatHomeView();
  }

  /**
   * Obtiene la clase CSS para el estado de carga
   */
  getLoadingClass(): string {
    return this.loading() ? 'opacity-50 pointer-events-none' : '';
  }

  /**
   * Obtiene el texto del botón de estado
   */
  getStatusButtonText(): string {
    if (this.loading()) {
      return this.item.is_active ? 'Desactivando...' : 'Activando...';
    }
    return this.item.is_active ? 'Desactivar' : 'Reactivar';
  }

  /**
   * Obtiene el icono del botón de estado
   */
  getStatusButtonIcon(): string {
    if (this.loading()) {
      return 'pi pi-spinner pi-spin';
    }
    return this.item.is_active ? 'pi pi-trash' : 'pi pi-undo';
  }

  /**
   * Obtiene la severidad del botón de estado
   */
  getStatusButtonSeverity(): 'danger' | 'success' {
    return this.item.is_active ? 'danger' : 'success';
  }
}
