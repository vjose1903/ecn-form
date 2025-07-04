import { FileClass } from '../file/file.class';
import { RetreatHomeI } from './retreat-home.model';
import { City } from '../city/city.class';
import { inject, runInInjectionContext, WritableSignal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { RetreatHomeService } from './retreat-home.service';
import { ToastService } from '@core/services/toast.service';
import { Ss } from '@core/services/singleton.service';
import { RetreatHomeForm } from 'app/pages/retreat-home-list/retreat-home-form/retreat-home-form';

export class RetreatHome {
  id: string = '';
  name: string = '';
  phone: string = '';
  address: string = '';
  location: string = '';
  city: string = '';
  cityData?: City;
  is_active: boolean = true;
  images: Array<FileClass | string> = [];
  imagesData: Array<FileClass> = [];

  constructor(retreatHome?: RetreatHomeI & { city?: any; images?: any[] }) {
    if (retreatHome) {
      this.id = retreatHome.id || '';
      this.name = retreatHome.name;
      this.phone = retreatHome.phone;
      this.address = retreatHome.address;
      this.location = retreatHome.location;

      // Manejar city que puede ser string (ID) o objeto (referencia resuelta)
      if (typeof retreatHome.city === 'string') {
        this.city = retreatHome.city;
      } else if (retreatHome.city && typeof retreatHome.city === 'object' && retreatHome.city.id) {
        // Si city es un objeto (referencia resuelta), extraer el ID y crear cityData
        this.city = retreatHome.city.id;
        this.cityData = new City(retreatHome.city);
      } else {
        this.city = '';
      }

      this.is_active = retreatHome.is_active ?? true;

      // Manejar images que pueden ser strings (IDs) u objetos (referencias resueltas)
      if (retreatHome.images && Array.isArray(retreatHome.images)) {
        this.images = [];
        this.imagesData = [];

        retreatHome.images.forEach(image => {
          if (typeof image === 'string') {
            // Si es string, es un ID
            this.images.push(image);
          } else if (image && typeof image === 'object' && image.id) {
            // Si es objeto (referencia resuelta), extraer el ID y crear FileClass
            this.images.push(image.id);
            this.imagesData.push(new FileClass(image));
          }
        });
      } else {
        this.images = [];
      }
    }
  }

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

  openForm() {
    return new Promise<void>((resolve, reject) => {
      const ref = Ss.dialogService.open(RetreatHomeForm, {
        header: this.id ? 'Editar Casa de Retiro' : 'Nueva Casa de Retiro',
        width: '70%',
        contentStyle: { overflow: 'auto' },
        baseZIndex: 10000,
        maximizable: true,
        modal: true,
        breakpoints: { '960px': '75vw', '640px': '90vw' },
        data: { retreatHome: this },
      });

      ref.onClose.subscribe(result => {
        if (result) {
          runInInjectionContext(Ss.injector, () => {
            const retreatHomeService = inject(RetreatHomeService);
            retreatHomeService.setReload(true);

            resolve(result);
          });
        }
      });
    });
  }

  confirmToggleStatus(retreatHome: RetreatHome, loading: WritableSignal<boolean>) {
    return new Promise<void>((resolve, reject) => {
      loading.set(true);
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
        accept: () => this.toggleStatus(retreatHome, loading, resolve, reject),
        reject: () => loading.set(false),
      });
    });
  }

  toggleStatus(retreatHome: RetreatHome, loading: WritableSignal<boolean>, resolve: Function, reject: Function) {
    runInInjectionContext(Ss.injector, () => {
      const retreatHomeService = inject(RetreatHomeService);

      retreatHomeService
        .toggleRetreatHomeStatus(retreatHome)
        .then(() => {
          Ss.toastService.success({ message: 'Estado de la casa de retiro cambiado correctamente', title: 'Estado cambiado' });
          resolve();
          retreatHomeService.setReload(true);
        })
        .catch(error => {
          Ss.toastService.error({ message: 'Error al cambiar el estado de la casa de retiro', title: 'Error' });
          reject();
        })
        .finally(() => loading.set(false));
    });
  }
}
