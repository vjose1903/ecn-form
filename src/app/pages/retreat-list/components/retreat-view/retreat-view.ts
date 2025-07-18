import { Ss } from '@core/services/singleton.service';
import { Component, inject, OnInit, signal, OnDestroy, computed } from '@angular/core';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { CommonModule, LowerCasePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { Subject, takeUntil } from 'rxjs';
import { BadgeModule } from 'primeng/badge';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestStats, RequestStatus, RequestStatusInfo } from '@core/entities/request/request.model';
import { RequestCard } from './requests/request-card/request-card';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { RequestService } from '@core/entities/request/request.service';
import { ViewItem } from '@core/components/view-item/view-item';
import { PdfService, CoupleInfo } from '../../utils/pdf.service';

@Component({
  selector: 'app-retreat-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, DividerLine, BadgeModule, RequestCard, SelectModule, FormsModule, LowerCasePipe, InputTextModule, ViewItem],
  templateUrl: './retreat-view.html',
  styleUrl: './retreat-view.scss',
})
export class RetreatView implements OnInit, OnDestroy {
  requests = signal<RequestClass[]>([]);
  requestsService = inject(RequestService);
  pdfService = inject(PdfService);

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

  retreat!: RetreatClass;
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
    this.requestsService.clearCache();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async getRequests(): Promise<void> {
    try {
      this.fetchingRequests.set(true);
      await this.retreat.getRequests();

      this.requestsService.requests$.pipe(takeUntil(this.destroy$)).subscribe(requests => {
        this.requests.set(requests);
        this.updateRequestStats(requests);
        this.fetchingRequests.set(false);
      });
    } catch (error) {
      Ss.toastService.error({ message: 'Error al obtener las solicitudes', title: 'Error' });
    }
  }

  /**
   * Actualiza las estadísticas de solicitudes
   */
  private updateRequestStats(requests: RequestClass[]): void {
    const stats = requests
      .filter(request => request.status !== RequestStatus.ALL)
      .reduce((acc, request) => {
        const status = request.status as Exclude<RequestStatus, RequestStatus.ALL>;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<RequestStatus, number>);

    this.requestStats.update(prev => ({
      [RequestStatus.PENDING]: { ...prev[RequestStatus.PENDING], amount: stats[RequestStatus.PENDING] || 0 },
      [RequestStatus.ACCEPTED]: { ...prev[RequestStatus.ACCEPTED], amount: stats[RequestStatus.ACCEPTED] || 0 },
      [RequestStatus.REJECTED]: { ...prev[RequestStatus.REJECTED], amount: stats[RequestStatus.REJECTED] || 0 },
    }));
  }

  getRequestStatusInfo(status: string): RequestStatusInfo {
    const stats = this.requestStats();
    const statusInfo = stats[status as keyof typeof stats];

    return statusInfo;
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
      // Recargar las solicitudes para actualizar los stats si es necesario
      await this.getRequests();
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
      await this.retreat.openForm().then(() => {});
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

  async exportCouplesCallInfo(): Promise<void> {
    try {
      // Obtener las solicitudes aceptadas para el reporte
      const acceptedRequests = this.requests()
      // const acceptedRequests = this.requests().filter(request => request.status === RequestStatus.ACCEPTED);
      
      if (acceptedRequests.length === 0) {
        Ss.toastService.warning({ 
          message: 'No hay solicitudes aceptadas para exportar', 
          title: 'Sin datos' 
        });
        return;
      }

      // Convertir las solicitudes a formato de parejas
      const couples: CoupleInfo[] = acceptedRequests.map(request => ({
        novia: {
          name: request.she.full_name,
          familyContact: [
            {
              name: request.she.family_information[0]?.familiar_full_name || '',
              relationship: request.she.family_information[0]?.familiar_relationship || '',
              phone: request.she.family_information[0]?.familiar_phone || ''
            },
            {
              name: request.she.family_information[1]?.familiar_full_name || '',
              relationship: request.she.family_information[1]?.familiar_relationship || '',
              phone: request.she.family_information[1]?.familiar_phone || ''
            }
          ],
          emergencyContact: {
            name: request.she.emergency_full_name || '',
            relationship: request.she.emergency_relationship || '',
            phone: request.she.emergency_phone || ''
          }
        },
        novio: {
          name: request.he.full_name,
          familyContact: [
            {
              name: request.he.family_information[0]?.familiar_full_name || '',
              relationship: request.he.family_information[0]?.familiar_relationship || '',
              phone: request.he.family_information[0]?.familiar_phone || ''
            },
            {
              name: request.he.family_information[1]?.familiar_full_name || '',
              relationship: request.he.family_information[1]?.familiar_relationship || '',
              phone: request.he.family_information[1]?.familiar_phone || ''
            }
          ],
          emergencyContact: {
            name: request.he.emergency_full_name || '',
            relationship: request.he.emergency_relationship || '',
            phone: request.he.emergency_phone || ''
          }
        }
      }));

      // Información del retiro para el reporte
      const retreatInfo = {
        name: this.retreat.displayCommunityName,
        number: this.retreat.displayNumber,
        modality: this.retreat.displayModality,
        dateRange: this.retreat.displayDateRange
      };

      // Obtener información de la ciudad desde el layout
      const cityInfo = Ss.authService.current_user()?.cityData;
      
      // Generar el PDF
      await this.pdfService.generateCouplesReport(couples, retreatInfo, cityInfo);
      
      Ss.toastService.success({ 
        message: `Reporte generado con ${couples.length} parejas`, 
        title: 'PDF Exportado' 
      });
      
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      Ss.toastService.error({ 
        message: 'Error al generar el reporte PDF', 
        title: 'Error' 
      });
    }
  }
}
