import { Ss } from '@core/services/singleton.service';
import { Component, inject, Input, OnInit, signal, OnDestroy, computed } from '@angular/core';
import { Retreat } from '@core/entities/retreat/retreat.class';
import { CommonModule, LowerCasePipe } from '@angular/common';
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
import { BadgeModule } from 'primeng/badge';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStats, RequestStatus, RequestStatusInfo } from '@core/entities/request/request.model';
import { RequestCard } from './requests/request-card/request-card';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-retreat-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, DividerLine, BadgeModule, RequestCard, SelectModule, FormsModule, LowerCasePipe, InputTextModule],
  templateUrl: './retreat-view.html',
  styleUrl: './retreat-view.scss',
})
export class RetreatView implements OnInit, OnDestroy {
  requests = signal<RequestClass[]>([]);
  requestFiltered = computed(() => {
    const word = this.filterWord();
    const status = this.selectedRequestStatus();

    // Primero filtrar por palabra de búsqueda en los nombres completos
    let filteredRequests = this.requests();

    if (word) {
      filteredRequests = filteredRequests.filter(request => {
        const sheName = request.she.full_name.toLowerCase();
        const heName = request.he.full_name.toLowerCase();
        const searchWord = word.toLowerCase();

        return sheName.includes(searchWord) || heName.includes(searchWord);
      });
    }

    // Luego filtrar por estado seleccionado
    if (status === RequestStatus.ALL) {
      return filteredRequests;
    }

    return filteredRequests.filter(request => request.status === status);
  });

  fetchingRequests = signal(true);

  selectedRequestStatus = signal<RequestStatus>(RequestStatus.ALL);
  filterWord = signal<string>('');
  requestStatusOptions = [
    { label: 'Todas', value: RequestStatus.ALL },
    { label: 'Pendientes', value: RequestStatus.PENDING },
    { label: 'Aceptadas', value: RequestStatus.ACCEPTED },
    { label: 'Rechazadas', value: RequestStatus.REJECTED },
  ];

  requestStats = signal<RequestStats>({
    [RequestStatus.PENDING]: { amount: 0, tooltip: 'Pendientes', severity: 'secondary' as const, label: 'Pendiente', labelPlural: 'Pendientes' },
    [RequestStatus.ACCEPTED]: { amount: 0, tooltip: 'Aceptadas', severity: 'success' as const, label: 'Aceptada', labelPlural: 'Aceptadas' },
    [RequestStatus.REJECTED]: { amount: 0, tooltip: 'Rechazadas', severity: 'danger' as const, label: 'Rechazada', labelPlural: 'Rechazadas' },
  });

  RequestStatus = RequestStatus;

  retreat!: Retreat;
  loading = signal(false);

  private destroy$ = new Subject<void>();

  get keys() {
    return Object.keys;
  }

  constructor(public ref: DynamicDialogRef, public config: DynamicDialogConfig) {}

  ngOnInit(): void {
    this.retreat = this.config.data.retreat;
    this.getRequests();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async getRequests(): Promise<void> {
    try {
      const requests = await this.retreat.getRequests();
      this.requests.set(requests);

      requests
        .filter(request => request.status !== RequestStatus.ALL)
        .forEach(request => {
          const status = request.status as Exclude<RequestStatus, RequestStatus.ALL>;
          this.requestStats.update(prev => ({ ...prev, [status]: { ...prev[status], amount: prev[status].amount + 1 } }));
        });

      this.fetchingRequests.set(false);
    } catch (error) {
      Ss.toastService.error({ message: 'Error al obtener las solicitudes', title: 'Error' });
    }
  }

  getRequestStatusInfo(status: string): RequestStatusInfo {
    const stats = this.requestStats();
    const statusInfo = stats[status as keyof typeof stats];

    return statusInfo;
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
      this.ref.close();

      this.loading.set(true);
      await this.retreat.openForm();
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
