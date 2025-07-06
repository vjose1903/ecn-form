import { inject, runInInjectionContext } from '@angular/core';
import { RequestI } from './request.model';
import { Ss } from '@core/services/singleton.service';
import { RequestService } from './request.service';
import { RetreatView } from 'app/pages/retreat-list/components/retreat-view/retreat-view';
import { Retreat } from '../retreat/retreat.class';

export class Request {
  id: string = '';
  retreat: string = '';
  retreatData?: Retreat;
  is_active: boolean = true;
  accept_requests: boolean = true;

  // Propiedades computadas para optimizar el rendimiento
  private _displayDateRange: string | null = null;

  constructor(request?: RequestI & { retreat?: any }) {
    if (request) {
      this.initializeFromData(request);
    }
  }

  /**
   * Inicializa la instancia desde datos externos
   */
  private initializeFromData(request: RequestI & { retreat?: any }): void {
    this.id = request.id || '';

    this.initializeRetreat(request.retreat);
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
      retreat: this.retreat,
      retreatData: this.retreatData?.asJson(),
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
  clone(): Request {
    const request = this.asJson();
    request.id = '';

    return new Request(request);
  }

  /**
   * Actualiza desde otra instancia
   */
  updateFrom(other: Request): void {
    this.id = other.id;
    this.retreat = other.retreat;
    this.retreatData = other.retreatData;
    this.is_active = other.is_active;

    // Limpiar caché de propiedades computadas
    this._displayDateRange = null;
  }
}
