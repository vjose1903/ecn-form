import { Component, inject, Input, signal, OnDestroy, OnInit } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeClass } from '@core/entities/retreat-home/retreat-home.class';
import { RetreatHomeView } from '../retreat-home-view/retreat-home-view';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-home-data-list',
  standalone: true,
  imports: [ButtonModule, TooltipModule, TagModule],
  templateUrl: './retreat-home-data-list.html',
  styleUrl: './retreat-home-data-list.scss',
  providers: [DialogService],
})
export class RetreatHomeDataList implements OnInit, OnDestroy {
  private retreatHomeService = inject(RetreatHomeService);
  private dialogService = inject(DialogService);
  private destroy$ = new Subject<void>();

  @Input() item!: RetreatHomeClass;
  @Input() showActions: boolean = true;
  @Input() enableSelection: boolean = false;
  @Input() canAssignHomes: boolean = false;
  @Input() canUnassignHomes: boolean = false;
  @Input() onAssignmentRequest?: (homeId: string) => void;

  loading = signal(false);
  imageLoaded = signal(false);
  imageError = signal(false);
  dialogRef: DynamicDialogRef | null = null;

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

    const dialogRef = this.dialogService.open(RetreatHomeView, {
      header: this.item.displayName,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreatHome: this.item,
        onAssignmentRequest: this.onAssignmentRequest,
        canAssignHomes: this.canAssignHomes,
        canUnassignHomes: this.canUnassignHomes,
      },
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    this.dialogRef = dialogRef;

    if (!dialogRef) {
      return;
    }

    dialogRef.onClose.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.dialogRef = null;
    });
  }

  /**
   * Confirma el cambio de estado con debounce
   */
  confirmToggleStatus(retreatHome: RetreatHomeClass): void {
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
   * Maneja el click en botones con prevención de propagación
   */
  onButtonClick(event: Event, action: () => void): void {
    event.stopPropagation();
    action();
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
