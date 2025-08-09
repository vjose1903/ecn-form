import { RequestI, CoupleI, RequestStatus, RequestStatusInfo } from './request.model';
import { Ss } from '@core/services/singleton.service';
import { RequestService } from './request.service';
import { RetreatClass } from '../retreat/retreat.class';
import { fun } from '@core/services/functions.service';
import { RequestView } from 'app/pages/retreat-list/components/retreat-view/requests/request-view/request-view';
import { RetreatService } from '../retreat/retreat.service';
import { inject, runInInjectionContext } from '@angular/core';

export class RequestClass {
  id: string = '';
  is_active: boolean = true;
  how_find_us: string = '';
  retreat: string = '';
  have_wedding_date: boolean = false;
  who_invited_you: string = '';
  who_invited_you_phone: string = '';
  wedding_date: Date | string | null = null;
  dating_period_year: number = 0;
  dating_period_month: number = 0;
  how_find_us_other: string = '';
  she: CoupleI = this.getDefaultCouple();
  he: CoupleI = this.getDefaultCouple();
  status: RequestStatus = RequestStatus.PENDING;

  // Propiedades computadas para optimizar el rendimiento
  private _displayDatingPeriod: string | null = null;
  private _displayWeddingDate: string | null = null;
  private _displayHowFindUs: string | null = null;
  private _retreatData: RetreatClass | null = null;

  get displayCoupleNames(): string {
    return fun.joinWords([this.she.full_name, this.he.full_name]);
  }

  get statusInfo(): RequestStatusInfo {
    const statusConfig = {
      [RequestStatus.PENDING]: { amount: 0, tooltip: 'Pendientes', severity: 'secondary' as const, label: 'Pendiente', labelPlural: 'Pendientes' },
      [RequestStatus.ACCEPTED]: { amount: 0, tooltip: 'Aceptadas', severity: 'success' as const, label: 'Aceptada', labelPlural: 'Aceptadas' },
      [RequestStatus.REJECTED]: { amount: 0, tooltip: 'Rechazadas', severity: 'danger' as const, label: 'Rechazada', labelPlural: 'Rechazadas' },
    };

    return statusConfig[this.status as keyof typeof statusConfig];
  }

  /**
   * Obtiene el rango de fechas formateado
   */
  get displayDatingPeriod(): string {
    if (this._displayDatingPeriod === null) {
      const years = this.dating_period_year && this.dating_period_year > 0 ? this.dating_period_year : null;
      const months = this.dating_period_month && this.dating_period_month > 0 ? this.dating_period_month : null;

      this._displayDatingPeriod = `${years ? `${years} año${years === 1 ? '' : 's'}` : ''} ${years && months ? 'y' : ''} ${months ? `${months} mes${months === 1 ? '' : 'es'}` : ''}`;
      this._displayDatingPeriod = this._displayDatingPeriod
        .split(' ')
        .filter(word => word.trim() !== '')
        .join(' ');
    }
    return this._displayDatingPeriod;
  }

  get displayWeddingDate(): string {
    if (this._displayWeddingDate === null) {
      const weddingDate = new Date(this.wedding_date as string);
      this._displayWeddingDate = weddingDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return this._displayWeddingDate;
  }

  get displayHowFindUs(): string {
    if (this._displayHowFindUs === null) {
      const howFindUs = this.how_find_us || '';
      const howFindUsOther = this.how_find_us_other || '';
      this._displayHowFindUs = howFindUs === 'Otro' ? howFindUsOther : howFindUs;
    }
    return this._displayHowFindUs;
  }

  get retreatData(): RetreatClass | null {
    if (this._retreatData === null) {
      runInInjectionContext(Ss.injector, () => {
        const retreatService = inject(RetreatService);
        const retreat = retreatService.retreats.find((retreat: RetreatClass) => retreat.id === this.retreat);
        this._retreatData = retreat || null;
      });
    }
    return this._retreatData;
  }

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
      age: 0,
      city_of_residence: '',
      are_you_married: false,
      religion: '',
      emergency_full_name: '',
      have_children: false,
      identity_type: '',
      birth_date: new Date(),
      birth_date_display: '',
      church_name: '',
      home_phone: '',
      email: '',
      nickname: '',
      address: '',
      emergency_relationship: '',
      cell_phone: '',
      identity_number: '',
      work_phone: '',
      emergency_phone: '',
      family_information: [
        {
          familiar_phone: '',
          familiar_relationship: '',
          familiar_full_name: '',
        },
        {
          familiar_phone: '',
          familiar_relationship: '',
          familiar_full_name: '',
        },
      ],
    };
  }

  /**
   * Inicializa la instancia desde datos externos
   */
  private initializeFromData(request: RequestI & { retreat?: any }): void {
    this.id = request.id || '';
    this.how_find_us = request.how_find_us || '';
    this.have_wedding_date = request.have_wedding_date || false;
    this.who_invited_you = request.who_invited_you || '';
    this.who_invited_you_phone = request.who_invited_you_phone || '';
    this.wedding_date = fun.convertFirebaseTimestamp(request.wedding_date) || null;
    this.retreat = request.retreat || '';
    this.dating_period_year = request.dating_period_year || 0;
    this.dating_period_month = request.dating_period_month || 0;
    this.how_find_us_other = request.how_find_us_other || '';
    this.she = this.initializeCouple(request.she);
    this.he = this.initializeCouple(request.he);
    this.status = request.status || RequestStatus.PENDING;
  }

  private initializeCouple(couple: CoupleI): CoupleI {
    const birthDate = new Date(fun.convertFirebaseTimestamp(couple.birth_date) as string);

    return {
      full_name: couple.full_name || '',
      age: fun.calculateAge(couple.birth_date) || 0,
      city_of_residence: couple.city_of_residence || '',
      are_you_married: couple.are_you_married || false,
      religion: couple.religion || '',
      emergency_full_name: couple.emergency_full_name || '',
      have_children: couple.have_children || false,
      identity_type: couple.identity_type || '',
      birth_date: birthDate || new Date(),
      birth_date_display: birthDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '',
      church_name: couple.church_name || '',
      home_phone: couple.home_phone || '',
      email: couple.email || '',
      nickname: couple.nickname || '',
      address: couple.address || '',
      emergency_relationship: couple.emergency_relationship || '',
      cell_phone: couple.cell_phone || '',
      identity_number: couple.identity_number || '',
      work_phone: couple.work_phone || '',
      emergency_phone: couple.emergency_phone || '',
      family_information: couple.family_information || [],
    };
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
      who_invited_you_phone: this.who_invited_you_phone,
      wedding_date: this.wedding_date,
      dating_period_year: this.dating_period_year,
      dating_period_month: this.dating_period_month,
      how_find_us_other: this.how_find_us_other,
      she: this.she,
      he: this.he,
      is_active: this.is_active,
    };
  }

  /**
   * Abre la vista detallada del retiro
   */
  openView(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dialogService = Ss.dialogService;

      if (!dialogService) {
        console.error('DialogService no disponible');
        return;
      }

      const dialogRef = dialogService.open(RequestView, {
        header: `Solicitud para el Retiro No. ${this.retreatData?.displayNumber}`,
        width: '90vw',
        modal: true,
        draggable: false,
        resizable: false,
        closable: true,
        focusOnShow: false,
        data: {
          request: this,
          retreat: this.retreatData,
        },
        breakpoints: { '960px': '75vw', '640px': '90vw' },
      });

      // Limpiar referencia cuando se cierre
      dialogRef.onClose.subscribe();
    });
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
    this.have_wedding_date = other.have_wedding_date;
    this.who_invited_you = other.who_invited_you;
    this.who_invited_you_phone = other.who_invited_you_phone;
    this.wedding_date = other.wedding_date;
    this.dating_period_year = other.dating_period_year;
    this.dating_period_month = other.dating_period_month;
    this.how_find_us_other = other.how_find_us_other;
    this.she = other.she;
    this.he = other.he;
    this.is_active = other.is_active;

    this._displayDatingPeriod = null;
  }
}
