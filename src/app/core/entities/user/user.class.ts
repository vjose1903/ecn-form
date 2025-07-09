import { UserI } from './user.model';
import { CityClass } from '../city/city.class';
import { inject, runInInjectionContext } from '@angular/core';
import { ToastService } from '@core/services/toast.service';
import { CopyToClipboardService } from '@core/services/copy-to-clipboard.service';
import { Ss } from '@core/services/singleton.service';
import { CityService } from '../city/city.service';

export class UserC {
  email: string = '';
  uid: string = '';
  city: string = '';
  id: string = '';
  cityData?: CityClass;

  constructor(user: UserI & { city?: any }) {
    this.email = user.email;
    this.uid = user.uid;
    this.id = user.id;

    // Manejar city que puede ser string (ID) o objeto (referencia resuelta)
    if (typeof user.city === 'string') {
      this.city = user.city;
    } else if (user.city && typeof user.city === 'object' && user.city.id) {
      // Si city es un objeto (referencia resuelta), extraer el ID y crear cityData
      this.city = user.city.id;
      this.cityData = new CityClass(user.city);
    } else {
      this.city = '';
    }
  }

  asJson() {
    return {
      email: this.email,
      uid: this.uid,
      city: this.city,
      id: this.id,
      cityData: this.cityData?.asJson(),
    };
  }

  get formLink() {
    const baseUrl = window.location.origin;
    return `${baseUrl}/formulario/${this.id}`;
  }

  get cityRef() {
    return runInInjectionContext(Ss.injector, () => {
      const cityService = inject(CityService);

      return cityService.getDocumentRef({ id: this.city });
    });
  }

  get getRefString() {
    return `user/${this.id}`;
  }

  copyFormLink() {
    Ss.copyToClipboardService.copyText(this.formLink);
    Ss.toastService.info({ message: 'Link copiado al portapapeles', title: 'Link de Formulario' });
  }
}
