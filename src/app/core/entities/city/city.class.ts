import { inject, runInInjectionContext } from '@angular/core';
import { CityI } from './city.model';
import { Ss } from '@core/services/singleton.service';
import { CityService } from './city.service';

export class CityClass {
  id: string = '';
  key: string = '';
  label: string = '';
  large_label: string = '';
  definite_article: string = '';
  

  constructor(city: CityI) {
    this.id = city.id;
    this.key = city.key;
    this.label = city.label;
    this.large_label = city.large_label;
    this.definite_article = city.definite_article;
  }

  asJson() {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
      large_label: this.large_label,
      definite_article: this.definite_article,
    };
  }

  getCityRef() {
    return runInInjectionContext(Ss.injector, () => {
      const cityService = inject(CityService);

      return cityService.getDocumentRef({ id: this.id });
    });
  }
}
