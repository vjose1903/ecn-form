import { FileClass } from '../file/file.class';
import { RetreatHomeI } from './retreat-home.model';
import { CityClass } from '../city/city.class';
import { inject, runInInjectionContext, WritableSignal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { RetreatHomeService } from './retreat-home.service';
import { ToastService } from '@core/services/toast.service';
import { Ss } from '@core/services/singleton.service';
import { RetreatHomeForm } from 'app/pages/retreat-home-list/retreat-home-form/retreat-home-form';

export class RetreatHomeClass {
  id: string = '';
  name: string = '';
  phone: string = '';
  address: string = '';
  location: string = '';
  city: string = '';
  cityData?: CityClass;
  is_active: boolean = true;
  images: Array<FileClass | string> = [];
  imagesData: Array<FileClass> = [];

  // Propiedades computadas para optimizar el rendimiento
  private _displayName: string | null = null;
  private _displayAddress: string | null = null;
  private _displayPhone: string | null = null;
  private _mainImage: FileClass | null = null;

  constructor(retreatHome?: RetreatHomeI & { city?: any; images?: any[] }) {
    if (retreatHome) {
      this.initializeFromData(retreatHome);
    }
  }

  /**
   * Inicializa la instancia desde datos externos
   */
  private initializeFromData(retreatHome: RetreatHomeI & { city?: any; images?: any[] }): void {
    this.id = retreatHome.id || '';
    this.name = retreatHome.name?.trim() || '';
    this.phone = retreatHome.phone?.trim() || '';
    this.address = retreatHome.address?.trim() || '';
    this.location = retreatHome.location?.trim() || '';
    this.is_active = retreatHome.is_active ?? true;

    this.initializeCity(retreatHome.city);
    this.initializeImages(retreatHome.images);
  }

  /**
   * Inicializa los datos de la ciudad
   */
  private initializeCity(city: any): void {
    if (typeof city === 'string') {
      this.city = city;
    } else if (city && typeof city === 'object' && city.id) {
      this.city = city.id;
      this.cityData = new CityClass(city);
    } else {
      this.city = '';
    }
  }

  /**
   * Inicializa las imágenes
   */
  private initializeImages(images: any[] | undefined): void {
    this.images = [];
    this.imagesData = [];
    this._mainImage = null;

    if (images && Array.isArray(images)) {
      images.forEach(image => {
        if (typeof image === 'string') {
          this.images.push(image);
        } else if (image && typeof image === 'object' && image.id) {
          this.images.push(image.id);
          const fileClass = new FileClass(image);
          this.imagesData.push(fileClass);

          // Establecer la primera imagen como principal
          if (!this._mainImage) {
            this._mainImage = fileClass;
          }
        }
      });
    }
  }

  /**
   * Obtiene el nombre para mostrar (con fallback)
   */
  get displayName(): string {
    if (this._displayName === null) {
      this._displayName = this.name || 'Sin Nombre Definido';
    }
    return this._displayName;
  }

  /**
   * Obtiene la dirección para mostrar (con fallback)
   */
  get displayAddress(): string {
    if (this._displayAddress === null) {
      this._displayAddress = this.address || 'Sin dirección definida';
    }
    return this._displayAddress;
  }

  /**
   * Obtiene la dirección para mostrar (con fallback)
   */
  get displayPhone(): string {
    if (this._displayPhone === null) {
      this._displayPhone = this.phone || 'Sin teléfono definido';
    }
    return this._displayPhone;
  }

  /**
   * Obtiene la imagen principal
   */
  get mainImage(): FileClass | null {
    return this._mainImage || (this.imagesData.length > 0 ? this.imagesData[0] : null);
  }

  /**
   * Obtiene la URL de la imagen principal
   */
  get mainImageUrl(): string {
    return this.mainImage?.url || '';
  }

  /**
   * Verifica si tiene imágenes
   */
  get hasImages(): boolean {
    return this.imagesData.length > 0;
  }

  /**
   * Verifica si tiene teléfono
   */
  get hasPhone(): boolean {
    return !!this.phone?.trim();
  }

  /**
   * Verifica si tiene ubicación
   */
  get hasLocation(): boolean {
    return !!this.location?.trim();
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
   * Valida si la instancia es válida
   */
  isValid(): boolean {
    return !!(this.name?.trim() && this.address?.trim() && this.location?.trim());
  }

  /**
   * Obtiene errores de validación
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (!this.name?.trim()) {
      errors.push('El nombre es requerido');
    }
    if (!this.address?.trim()) {
      errors.push('La dirección es requerida');
    }
    if (!this.location?.trim()) {
      errors.push('La ubicación es requerida');
    }

    return errors;
  }

  /**
   * Convierte la instancia a JSON
   */
  asJson() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      address: this.address,
      location: this.location,
      city: this.city,
      cityData: this.cityData?.asJson(),
      is_active: this.is_active,
      images: this.images,
      imagesData: this.imagesData ? this.imagesData.map(img => img!.asJson()) : undefined,
    };
  }

  /**
   * Abre el formulario de edición/creación
   */
  openForm(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dialogService = Ss.dialogService;

      if (!dialogService) {
        reject(new Error('DialogService no disponible'));
        return;
      }

      const ref = dialogService.open(RetreatHomeForm, {
        header: this.id ? 'Editar Casa de Retiro' : 'Nueva Casa de Retiro',
        width: '70%',
        modal: true,
        draggable: false,
        resizable: false,
        closable: true,
        focusOnShow: false,
        data: { retreatHome: this.id ? this : undefined },
        breakpoints: { '960px': '75vw', '640px': '90vw' },
      });

      ref.onClose.subscribe((result: RetreatHomeI) => {
        resolve();
      });
    });
  }

  /**
   * Confirma el cambio de estado
   */
  confirmToggleStatus(retreatHome: RetreatHomeClass): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Ss.confirmationService.confirm({
        message: retreatHome.is_active ? '¿Estás seguro de querer desactivar esta casa de retiro?' : '¿Estás seguro de querer reactivar esta casa de retiro?',
        header: retreatHome.is_active ? 'Desactivar Casa de Retiro' : 'Activar Casa de Retiro',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Si',
        rejectLabel: 'No',
        acceptIcon: 'pi pi-check',
        rejectIcon: 'pi pi-times',
        acceptButtonStyleClass: retreatHome.is_active ? 'p-button-danger' : 'p-button-success',
        rejectButtonStyleClass: 'p-button-secondary',
        accept: () => this.toggleStatus(retreatHome, resolve, reject),
        reject: () => {
          resolve();
        },
      });
    });
  }

  /**
   * Cambia el estado de la casa de retiro
   */
  private toggleStatus(retreatHome: RetreatHomeClass, resolve: Function, reject: Function): void {
    runInInjectionContext(Ss.injector, () => {
      const retreatHomeService = inject(RetreatHomeService);

      retreatHomeService
        .toggleRetreatHomeStatus(retreatHome)
        .then(() => resolve())
        .catch(error => reject(error));
    });
  }

  /**
   * Obtiene la referencia de la casa de retiro
   */
  getRetreatHomeReference() {
    return runInInjectionContext(Ss.injector, () => {
      const retreatHomeService = inject(RetreatHomeService);

      return retreatHomeService.getDocumentRef({ id: this.id });
    });
  }
  /**
   * Abre la ubicación en Google Maps
   */
  openInGoogleMaps(): void {
    if (this.hasLocation) {
      window.open(this.location, '_blank');
    }
  }

  /**
   * Clona la instancia
   */
  clone(): RetreatHomeClass {
    return new RetreatHomeClass(this.asJson());
  }

  /**
   * Actualiza los datos desde otra instancia
   */
  updateFrom(other: RetreatHomeClass): void {
    this.id = other.id;
    this.name = other.name;
    this.phone = other.phone;
    this.address = other.address;
    this.location = other.location;
    this.city = other.city;
    this.cityData = other.cityData;
    this.is_active = other.is_active;
    this.images = [...other.images];
    this.imagesData = [...other.imagesData];

    // Resetear propiedades computadas
    this._displayName = null;
    this._displayAddress = null;
    this._mainImage = other._mainImage;
  }
}
