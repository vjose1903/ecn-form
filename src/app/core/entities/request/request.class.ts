import { inject, runInInjectionContext } from '@angular/core';
import { RequestI, CoupleI, BirthDate } from './request.model';
import { Ss } from '@core/services/singleton.service';
import { RequestService } from './request.service';
import { RetreatView } from 'app/pages/retreat-list/components/retreat-view/retreat-view';
import { Retreat } from '../retreat/retreat.class';

export class RequestClass {
  id: string = '';
  is_active: boolean = true;
  is_accepted: boolean | null = null;
  how_find_us: string = '';
  retreat: string = '';
  retreatData?: Retreat;
  have_wedding_date: boolean = false;
  who_invited_you: string = '';
  wedding_date: Date | null = null;
  dating_period: string = '';
  how_find_us_other: string = '';
  she: CoupleI = this.getDefaultCouple();
  he: CoupleI = this.getDefaultCouple();
  accept_requests: boolean = true;

  // Propiedades computadas para optimizar el rendimiento
  private _displayDateRange: string | null = null;

  constructor(request?: RequestI & { retreat?: any }) {
    if (request) {
      this.initializeFromData(request);
    }
  }

  /**
   * Obtiene un objeto CoupleI con valores por defecto
   */
  private getDefaultCouple(): CoupleI {
    return {
      full_name: '',
      city_of_residence: '',
      are_you_married: false,
      live_accompanied: false,
      religion: '',
      emergency_full_name: '',
      have_children: false,
      identity_type: '',
      birth_date: new Date(),
      church_name: '',
      home_phone: '',
      companion_phone: '',
      email: '',
      nickname: '',
      address: '',
      emergency_relationship: '',
      cell_phone: '',
      identity_number: '',
      work_phone: '',
      companion_relationship: '',
      companion_full_name: '',
      emergency_phone: '',
    };
  }

  /**
   * Inicializa la instancia desde datos externos
   */
  private initializeFromData(request: RequestI & { retreat?: any }): void {
    this.id = request.id || '';
    this.is_accepted = request.is_accepted || null;
    this.how_find_us = request.how_find_us || '';
    this.have_wedding_date = request.have_wedding_date || false;
    this.who_invited_you = request.who_invited_you || '';
    this.wedding_date = request.wedding_date || null;
    this.dating_period = request.dating_period || '';
    this.how_find_us_other = request.how_find_us_other || '';
    this.she = this.initializeCouple(request.she);
    this.he = this.initializeCouple(request.he);

    this.initializeRetreat(request.retreat);
  }

  private initializeCouple(couple: CoupleI): CoupleI {
    return {
      full_name: couple.full_name || '',
      city_of_residence: couple.city_of_residence || '',
      are_you_married: couple.are_you_married || false,
      live_accompanied: couple.live_accompanied || false,
      religion: couple.religion || '',
      emergency_full_name: couple.emergency_full_name || '',
      have_children: couple.have_children || false,
      identity_type: couple.identity_type || '',
      birth_date: couple.birth_date || new Date(),
      church_name: couple.church_name || '',
      home_phone: couple.home_phone || '',
      companion_phone: couple.companion_phone || '',
      email: couple.email || '',
      nickname: couple.nickname || '',
      address: couple.address || '',
      emergency_relationship: couple.emergency_relationship || '',
      cell_phone: couple.cell_phone || '',
      identity_number: couple.identity_number || '',
      work_phone: couple.work_phone || '',
      companion_relationship: couple.companion_relationship || '',
      companion_full_name: couple.companion_full_name || '',
      emergency_phone: couple.emergency_phone || '',
    };
  }

  /**
   * Inicializa los datos de la casa de retiro
   */
  private initializeRetreat(retreat: any): void {
    if (typeof retreat === 'string') {
      this.retreat = retreat;
    } else if (retreat && typeof retreat === 'object' && retreat.id) {
      this.retreat = retreat.id;
      this.retreatData = new Retreat(retreat);
    } else {
      this.retreat = '';
    }
  }

  /**
   * Convierte la instancia a JSON
   */
  asJson() {
    return {
      id: this.id,
      how_find_us: this.how_find_us,
      retreat: this.retreat,
      retreatData: this.retreatData?.asJson(),
      have_wedding_date: this.have_wedding_date,
      who_invited_you: this.who_invited_you,
      wedding_date: this.wedding_date,
      dating_period: this.dating_period,
      how_find_us_other: this.how_find_us_other,
      she: this.she,
      he: this.he,
      is_active: this.is_active,
    };
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
      header: `Ficha de solicitud`,
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
      const requestService = inject(RequestService);

      // requestService
      //   .toggleRetreatStatus(this)
      //   .then(() => resolve())
      //   .catch(error => reject(error));
    });
  }

  /**
   * Obtiene la referencia del documento en Firebase
   */
  getRetreatReference() {
    return runInInjectionContext(Ss.injector, () => {
      const requestService = inject(RequestService);
      return requestService.getDocumentRef({ id: this.id });
    });
  }

  /**
   * Clona la instancia
   */
  clone(): RequestClass {
    const request = this.asJson();
    request.id = '';

    return new RequestClass(request as any);
  }

  /**
   * Actualiza desde otra instancia
   */
  updateFrom(other: RequestClass): void {
    this.id = other.id;
    this.how_find_us = other.how_find_us;
    this.retreat = other.retreat;
    this.retreatData = other.retreatData;
    this.have_wedding_date = other.have_wedding_date;
    this.who_invited_you = other.who_invited_you;
    this.wedding_date = other.wedding_date;
    this.dating_period = other.dating_period;
    this.how_find_us_other = other.how_find_us_other;
    this.she = other.she;
    this.he = other.he;
    this.is_active = other.is_active;

    // Limpiar caché de propiedades computadas
    this._displayDateRange = null;
  }
}
