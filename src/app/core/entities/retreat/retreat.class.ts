import { inject, runInInjectionContext } from '@angular/core';
import { RetreatI, RetreatModality, RetreatModalityType } from './retreat.model';
import { Ss } from '@core/services/singleton.service';
import { RetreatService } from './retreat.service';
import { RetreatHome } from '../retreat-home/retreat-home.class';
import { RetreatForm } from 'app/pages/retreat-list/retreat-form/retreat-form';
import { RetreatView } from 'app/pages/retreat-list/components/retreat-view/retreat-view';
import { fun } from '@core/services/functions.service';

export class Retreat {
  id: string = '';
  number: number = 0;
  community_name: string = '';
  start_date: string = '';
  end_date: string = '';
  max_request_date: string = '';
  retreat_home: string = '';
  retreatHomeData?: RetreatHome;
  modality: RetreatModality = RetreatModality.PRESENCIAL;
  mixedModalityData: { [date: string]: RetreatModalityType } = {};
  is_active: boolean = true;
  accept_requests: boolean = true;

  // Propiedades computadas para optimizar el rendimiento
  private _displayNumber: string | null = null;
  private _displayCommunityName: string | null = null;
  private _displayDateRange: string | null = null;
  private _displayModality: string | null = null;

  constructor(retreat?: RetreatI & { retreat_home?: any }) {
    if (retreat) {
      this.initializeFromData(retreat);
    }
  }

  /**
   * Inicializa la instancia desde datos externos
   */
  private initializeFromData(retreat: RetreatI & { retreat_home?: any }): void {
    this.id = retreat.id || '';
    this.number = retreat.number || 0;
    this.community_name = retreat.community_name || '';
    this.start_date = fun.convertFirebaseTimestamp(retreat.start_date);
    this.end_date = fun.convertFirebaseTimestamp(retreat.end_date);
    this.max_request_date = fun.convertFirebaseTimestamp(retreat.max_request_date);
    this.modality = retreat.modality || RetreatModality.PRESENCIAL;
    this.mixedModalityData = retreat.mixedModalityData || {};
    this.is_active = retreat.is_active ?? true;
    this.accept_requests = retreat.accept_requests ?? true;

    this.initializeRetreatHome(retreat.retreat_home);
  }

  /**
   * Inicializa los datos de la casa de retiro
   */
  private initializeRetreatHome(retreatHome: any): void {
    if (typeof retreatHome === 'string') {
      this.retreat_home = retreatHome;
    } else if (retreatHome && typeof retreatHome === 'object' && retreatHome.id) {
      this.retreat_home = retreatHome.id;
      this.retreatHomeData = new RetreatHome(retreatHome);
    } else {
      this.retreat_home = '';
    }
  }

  /**
   * Obtiene el número formateado para mostrar
   */
  get displayNumber(): string {
    if (this._displayNumber === null) {
      this._displayNumber = this.number.toString();
    }
    return this._displayNumber;
  }

  /**
   * Obtiene el número formateado para mostrar
   */
  get displayCommunityName(): string {
    if (this._displayCommunityName === null) {
      this._displayCommunityName = this.community_name || 'Nombre sin definir';
    }
    return this._displayCommunityName;
  }

  /**
   * Obtiene el rango de fechas formateado
   */
  get displayDateRange(): string {
    if (this._displayDateRange === null) {
      if (this.start_date && this.end_date) {
        const startDate = new Date(this.start_date);
        const endDate = new Date(this.end_date);
        this._displayDateRange = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
      } else {
        this._displayDateRange = 'Fechas no definidas';
      }
    }
    return this._displayDateRange;
  }

  /**
   * Obtiene la modalidad formateada para mostrar
   */
  get displayModality(): string {
    if (this._displayModality === null) {
      switch (this.modality) {
        case RetreatModality.PRESENCIAL:
          this._displayModality = 'Presencial';
          break;
        case RetreatModality.VIRTUAL:
          this._displayModality = 'Virtual';
          break;
        case RetreatModality.MIXTO:
          this._displayModality = 'Mixto';
          break;
        default:
          this._displayModality = 'No definida';
      }
    }
    return this._displayModality;
  }

  /**
   * Obtiene el nombre de la casa de retiro
   */
  get retreatHomeName(): string {
    return this.retreatHomeData?.displayName || 'Casa de retiro no definida';
  }

  /**
   * Verifica si tiene casa de retiro asignada
   */
  get hasRetreatHome(): boolean {
    return !!this.retreat_home && !!this.retreatHomeData;
  }

  /**
   * Verifica si tiene fechas definidas
   */
  get hasDates(): boolean {
    return !!(this.start_date && this.end_date);
  }

  /**
   * Verifica si tiene modalidad definida
   */
  get hasModality(): boolean {
    return !!this.modality;
  }

  /**
   * Verifica si es modalidad mixta
   */
  get isMixedModality(): boolean {
    return this.modality === RetreatModality.MIXTO;
  }

  /**
   * Obtiene el estado formateado
   */
  get statusText(): string {
    return this.is_active ? 'Activo' : 'Inactivo';
  }

  /**
   * Obtiene la severidad del estado para PrimeNG
   */
  get statusSeverity(): 'success' | 'danger' {
    return this.is_active ? 'success' : 'danger';
  }

  /**
   * Obtiene el estado de solicitudes
   */
  get requestsStatusText(): string {
    return this.accept_requests ? 'Acepta Solicitudes' : 'No Acepta Solicitudes';
  }

  /**
   * Obtiene la severidad del estado de solicitudes
   */
  get requestsStatusSeverity(): 'success' | 'warning' {
    return this.accept_requests ? 'success' : 'warning';
  }

  /**
   * Obtiene las fechas para modalidad mixta
   */
  get mixedModalityDates(): { date: string; label: string; modality: RetreatModalityType }[] {
    if (!this.isMixedModality || !this.hasDates) {
      return [];
    }

    const dates: { date: string; label: string; modality: RetreatModalityType }[] = [];
    const startDate = new Date(this.start_date);
    const endDate = new Date(this.end_date);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split('T')[0];
      const day = d.getDate();
      const month = d.toLocaleDateString('es-ES', { month: 'short' });
      const label = `${day} ${month}`;
      const modality = this.mixedModalityData[dateString] || RetreatModalityType.PRESENCIAL;

      dates.push({ date: dateString, label, modality });
    }

    return dates;
  }

  /**
   * Valida si la instancia es válida
   */
  isValid(): boolean {
    return !!(this.number > 0 && this.start_date && this.end_date && this.max_request_date && this.retreat_home && this.modality);
  }

  /**
   * Obtiene errores de validación
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (!this.number || this.number <= 0) {
      errors.push('El número de retiro es requerido y debe ser mayor a 0');
    }
    if (!this.start_date) {
      errors.push('La fecha de inicio es requerida');
    }
    if (!this.end_date) {
      errors.push('La fecha de fin es requerida');
    }
    if (!this.max_request_date) {
      errors.push('La fecha límite de solicitudes es requerida');
    }
    if (!this.retreat_home) {
      errors.push('La casa de retiro es requerida');
    }
    if (!this.modality) {
      errors.push('La modalidad es requerida');
    }

    return errors;
  }

  /**
   * Convierte la instancia a JSON
   */
  asJson() {
    return {
      id: this.id,
      number: this.number,
      start_date: this.start_date,
      end_date: this.end_date,
      max_request_date: this.max_request_date,
      retreat_home: this.retreat_home,
      retreatHomeData: this.retreatHomeData?.asJson(),
      modality: this.modality,
      mixedModalityData: this.mixedModalityData,
      is_active: this.is_active,
      accept_requests: this.accept_requests,
    };
  }

  /**
   * Abre el formulario de edición
   */
  async openForm(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dialogService = Ss.dialogService;

      if (!dialogService) {
        reject(new Error('DialogService no disponible'));
        return;
      }

      const ref = dialogService.open(RetreatForm, {
        header: this.id ? 'Editar Retiro' : 'Nuevo Retiro',
        width: '60vw',
        modal: true,
        draggable: false,
        resizable: false,
        closable: true,
        focusOnShow: false,
        data: { retreat: this.id ? this : undefined },
        breakpoints: { '960px': '75vw', '640px': '90vw' },
      });

      ref.onClose.subscribe((result: RetreatI) => {
        // runInInjectionContext(Ss.injector, () => {
        //   const retreatService = inject(RetreatService);
        //   retreatService.refresh();
        resolve();
        // });
      });
    });
  }

  /**
   * Abre la vista detallada del retiro
   */
  openView(): void {
    const dialogService = Ss.dialogService;

    if (!dialogService) {
      console.error('DialogService no disponible');
      return;
    }

    const dialogRef = dialogService.open(RetreatView, {
      header: `Retiro No. ${this.displayNumber}  Comunidad: ${this.displayCommunityName}`,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreat: this,
      },
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    // Limpiar referencia cuando se cierre
    dialogRef.onClose.subscribe();
  }

  /**
   * Confirma el cambio de estado
   */
  confirmToggleStatus(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Ss.confirmationService.confirm({
        message: this.is_active ? '¿Estás seguro de querer desactivar este retiro?' : '¿Estás seguro de querer reactivar este retiro?',
        header: this.is_active ? 'Desactivar Retiro' : 'Activar Retiro',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Si',
        rejectLabel: 'No',
        acceptIcon: 'pi pi-check',
        rejectIcon: 'pi pi-times',
        acceptButtonStyleClass: this.is_active ? 'p-button-danger' : 'p-button-success',
        rejectButtonStyleClass: 'p-button-secondary',
        accept: () => this.toggleStatus(resolve, reject),
        reject: () => resolve(),
      });
    });
  }

  /**
   * Cambia el estado del retiro
   */
  private toggleStatus(resolve: Function, reject: Function): void {
    runInInjectionContext(Ss.injector, () => {
      const retreatService = inject(RetreatService);

      retreatService
        .toggleRetreatStatus(this)
        .then(() => resolve())
        .catch(error => reject(error));
    });
  }

  /**
   * Obtiene la referencia del documento en Firebase
   */
  getRetreatReference() {
    return runInInjectionContext(Ss.injector, () => {
      const retreatService = inject(RetreatService);
      return retreatService.getDocumentRef({ id: this.id });
    });
  }

  /**
   * Obtiene la referencia de la casa de retiro
   */
  async getRetreatHomeReference() {
    if (this.retreatHomeData) {
      return this.retreatHomeData.getRetreatHomeReference();
    }
    return null;
  }

  /**
   * Clona la instancia
   */
  clone(): Retreat {
    return new Retreat(this.asJson());
  }

  /**
   * Actualiza desde otra instancia
   */
  updateFrom(other: Retreat): void {
    this.id = other.id;
    this.number = other.number;
    this.start_date = other.start_date;
    this.end_date = other.end_date;
    this.max_request_date = other.max_request_date;
    this.retreat_home = other.retreat_home;
    this.retreatHomeData = other.retreatHomeData;
    this.modality = other.modality;
    this.mixedModalityData = other.mixedModalityData;
    this.is_active = other.is_active;
    this.accept_requests = other.accept_requests;

    // Limpiar caché de propiedades computadas
    this._displayNumber = null;
    this._displayDateRange = null;
    this._displayModality = null;
  }
}
