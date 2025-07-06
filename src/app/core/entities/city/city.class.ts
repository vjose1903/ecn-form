import { inject, runInInjectionContext } from '@angular/core';
import { CityI } from './city.model';
import { Ss } from '@core/services/singleton.service';
import { CityService } from './city.service';

export class City {
  id: string = '';
  key: string = '';
  label: string = '';

  constructor(city: CityI) {
    this.id = city.id;
    this.key = city.key;
    this.label = city.label;
  }

  asJson() {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
    };
  }

  getCityRef() {
    return runInInjectionContext(Ss.injector, () => {
      const cityService = inject(CityService);

      return cityService.getDocumentRef({ id: this.key });
    });
  }
}
