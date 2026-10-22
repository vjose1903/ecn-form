import { RequestAction, RequestI, CoupleI, PreRetreatPaymentI, RequestStatus, RequestStatusInfo } from './request.model';
import { Ss } from '@core/services/singleton.service';
import { RequestService } from './request.service';
import { RetreatClass } from '../retreat/retreat.class';
import { fun } from '@core/services/functions.service';
import { RequestView } from 'app/pages/retreat-list/components/retreat-view/requests/request-view/request-view';
import { RequestViewHeader } from 'app/pages/retreat-list/components/retreat-view/requests/request-view/request-view-header';
import { RetreatService } from '../retreat/retreat.service';
import { inject, runInInjectionContext } from '@angular/core';

export class RequestClass {
  id: string = '';
  is_active: boolean = true;
  how_find_us: string = '';
  retreat: string = '';
  archived_retreat_id: string = '';
  archived_at: Date | string | null = null;
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
  action: RequestAction = RequestAction.NEW;
  created_at: Date | string | null = null;
  is_informado = false;
  pre_retreat_payments: PreRetreatPaymentI[] = [];

  // Propiedades computadas para optimizar el rendimiento
  private _displayDatingPeriod: string | null = null;
  private _displayWeddingDate: string | null = null;
  private _displayHowFindUs: string | null = null;
  private _retreatData: RetreatClass | null = null;

  get displayCoupleNames(): string {
    return fun.joinWords([this.she.full_name, this.he.full_name]);
  }

  get relatedRetreatId(): string {
    return this.archived_retreat_id || this.retreat;
  }

  get isArchived(): boolean {
    return Boolean(this.archived_at);
  }

  get displayArchivedAt(): string {
    if (!this.archived_at) {
      return 'No disponible';
    }

    return new Date(this.archived_at).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  get statusInfo(): RequestStatusInfo {
    const statusConfig = {
      [RequestStatus.PENDING]: { amount: 0, tooltip: 'Pendientes', severity: 'secondary' as const, label: 'Pendiente', labelPlural: 'Pendientes' },
      [RequestStatus.ACCEPTED]: { amount: 0, tooltip: 'Aceptadas', severity: 'success' as const, label: 'Aceptada', labelPlural: 'Aceptadas' },
      [RequestStatus.REJECTED]: { amount: 0, tooltip: 'Rechazadas', severity: 'danger' as const, label: 'Rechazada', labelPlural: 'Rechazadas' },
      [RequestStatus.ARCHIVED]: { amount: 0, tooltip: 'Archivadas', severity: 'warn' as const, label: 'Archivada', labelPlural: 'Archivadas' },
    };

    return statusConfig[this.status as keyof typeof statusConfig];
  }

  get actionLabel(): string {
    const labels: Record<RequestAction, string> = {
      [RequestAction.NEW]: 'Nueva',
      [RequestAction.UPDATED]: 'Actualizada',
      [RequestAction.ARCHIVED]: 'Archivada',
      [RequestAction.DESARCHIVED]: 'Desarchivada',
      [RequestAction.TRANSFERRED]: 'Transferida',
    };

    return labels[this.action] ?? 'Sin acción';
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
        const retreat = retreatService.retreats.find((retreat: RetreatClass) => retreat.id === this.relatedRetreatId);
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
      religion_other: '',
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
    this.archived_retreat_id = request.archived_retreat_id || '';
    this.archived_at = request.archived_at ? fun.convertFirebaseTimestamp(request.archived_at) : null;
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
    this.action = request.action || RequestAction.NEW;
    this.created_at = request.created_at ? fun.convertFirebaseTimestamp(request.created_at) : null;
    this.is_informado = request.is_informado ?? false;
    this.pre_retreat_payments = (request.pre_retreat_payments ?? []).map(payment => ({
      ...payment,
      payment_date: fun.convertFirebaseTimestamp(payment.payment_date) || payment.payment_date,
    }));
  }

  private initializeCouple(couple?: CoupleI | null): CoupleI {
    const source = couple ?? this.getDefaultCouple();
    const birthDate = new Date(fun.convertFirebaseTimestamp(source.birth_date) as string);

    return {
      full_name: source.full_name || '',
      age: fun.calculateAge(source.birth_date) || 0,
      city_of_residence: source.city_of_residence || '',
      are_you_married: source.are_you_married || false,
      religion: source.religion || '',
      religion_other: source.religion_other || '',
      emergency_full_name: source.emergency_full_name || '',
      have_children: source.have_children || false,
      identity_type: source.identity_type || '',
      birth_date: birthDate || new Date(),
      birth_date_display: birthDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '',
      church_name: source.church_name || '',
      home_phone: source.home_phone || '',
      email: source.email || '',
      nickname: source.nickname || '',
      address: source.address || '',
      emergency_relationship: source.emergency_relationship || '',
      cell_phone: source.cell_phone || '',
      identity_number: source.identity_number || '',
      work_phone: source.work_phone || '',
      emergency_phone: source.emergency_phone || '',
      family_information: source.family_information || [],
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
      wedding_date: this.wedding_date ? new Date(this.wedding_date) : null,
      dating_period_year: this.dating_period_year,
      dating_period_month: this.dating_period_month,
      how_find_us_other: this.how_find_us_other,
      she: {
        ...this.she,
        birth_date: this.she.birth_date ? new Date(fun.convertFirebaseTimestamp(this.she.birth_date)) : new Date(),
      },
      he: {
        ...this.he,
        birth_date: this.he.birth_date ? new Date(fun.convertFirebaseTimestamp(this.he.birth_date)) : new Date(),
      },
      is_active: this.is_active,
      status: this.status,
      action: this.action,
      ...(this.created_at ? { created_at: new Date(this.created_at) } : {}),
      is_informado: this.is_informado,
      pre_retreat_payments: this.pre_retreat_payments.map(payment => ({
        ...payment,
        payment_date: new Date(payment.payment_date),
      })),
      archived_retreat_id: this.archived_retreat_id || undefined,
      archived_at: this.archived_at ? new Date(this.archived_at) : null,
    };
  }

  toFirestoreDocument() {
    const { retreatData, archived_retreat_id, archived_at, ...data } = this.asJson();

    return {
      ...data,
      ...(archived_retreat_id ? { archived_retreat_id } : {}),
      ...(archived_at ? { archived_at } : {}),
    };
  }

  /**
   * Abre la vista detallada del retiro
   */
  openView(args: { retreat?: RetreatClass | null; isArchived?: boolean; actionsOnly?: boolean; menuAnchor?: HTMLElement } = {}): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dialogService = Ss.dialogService;
      const retreat = args.retreat ?? this.retreatData;
      const dialogTitle = retreat
        ? `Solicitud para el Retiro No. ${retreat.displayNumber}`
        : this.isArchived
          ? 'Solicitud archivada'
          : 'Solicitud';

      if (!dialogService) {
        console.error('DialogService no disponible');
        return;
      }

      const dialogRef = dialogService.open(RequestView, {
        header: dialogTitle,
        width: '90vw',
        modal: !args.actionsOnly,
        draggable: false,
        resizable: false,
        closable: !args.actionsOnly,
        showHeader: !args.actionsOnly,
        styleClass: 'request-view-dialog',
        ...(args.actionsOnly ? { style: { width: '0', height: '0', padding: '0', margin: '0', overflow: 'visible' }, contentStyle: { padding: '0', overflow: 'visible' }, styleClass: 'request-actions-menu-host' } : {}),
        focusOnShow: false,
        templates: {
          header: RequestViewHeader,
        },
        data: {
          request: this,
          retreat,
          isArchivedView: args.isArchived ?? this.isArchived,
          actionsOnly: Boolean(args.actionsOnly),
          menuAnchor: args.menuAnchor,
        },
        breakpoints: { '960px': '75vw', '640px': '90vw' },
      });

      if (!dialogRef) {
        resolve();
        return;
      }

      dialogRef.onClose.subscribe(() => resolve());
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
    this.status = other.status;
    this.action = other.action;
    this.is_informado = other.is_informado;
    this.pre_retreat_payments = other.pre_retreat_payments;
    this.archived_retreat_id = other.archived_retreat_id;
    this.archived_at = other.archived_at;

    this._displayDatingPeriod = null;
    this._displayWeddingDate = null;
    this._displayHowFindUs = null;
    this._retreatData = null;
  }
}
