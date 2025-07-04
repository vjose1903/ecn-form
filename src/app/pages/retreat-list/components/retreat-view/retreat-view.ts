import { Component, inject, Input, OnInit, signal, OnDestroy } from '@angular/core';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { ConfirmationService } from 'primeng/api';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { ToastService } from '@core/services/toast.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, DividerLine],
  templateUrl: './retreat-view.html',
  styleUrl: './retreat-view.scss',
})
export class RetreatView implements OnInit, OnDestroy {
  private retreatService = inject(RetreatService);
  private confirmationService = inject(ConfirmationService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  retreat!: Retreat;
  loading = signal(false);

  constructor(public ref: DynamicDialogRef, public config: DynamicDialogConfig) {}

  ngOnInit(): void {
    this.retreat = this.config.data.retreat;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Obtiene el texto de información de contacto
   */
  getContactInfoText(): string {
    if (this.retreat.hasRetreatHome) {
      return this.retreat.retreatHomeName;
    }
    return 'Casa de retiro no asignada';
  }

  /**
   * Obtiene el texto del botón de estado
   */
  getStatusButtonText(): string {
    if (this.loading()) {
      return 'Procesando...';
    }
    return this.retreat.is_active ? 'Desactivar' : 'Activar';
  }

  /**
   * Obtiene la severidad del botón de estado
   */
  getStatusButtonSeverity(): 'danger' | 'success' | 'secondary' {
    if (this.loading()) {
      return 'secondary';
    }
    return this.retreat.is_active ? 'danger' : 'success';
  }

  /**
   * Obtiene el icono del botón de estado
   */
  getStatusButtonIcon(): string {
    if (this.loading()) {
      return 'pi pi-spinner pi-spin';
    }
    return this.retreat.is_active ? 'pi pi-trash' : 'pi pi-undo';
  }

  /**
   * Confirma el cambio de estado
   */
  async confirmToggleStatus(): Promise<void> {
    try {
      this.loading.set(true);
      await this.retreat.confirmToggleStatus();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Abre el formulario de edición
   */
  async openEditForm(): Promise<void> {
    try {
      this.loading.set(true);
      await this.retreat.openForm();
      
      // Cerrar la vista después de editar
      this.ref.close();
    } catch (error) {
      console.error('Error al abrir formulario:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Obtiene la fecha límite formateada
   */
  getMaxRequestDateFormatted(): string {
    if (this.retreat.max_request_date) {
      return new Date(this.retreat.max_request_date).toLocaleDateString();
    }
    return 'No definida';
  }

  /**
   * Cierra la vista
   */
  closeView(): void {
    this.ref.close();
  }
} 