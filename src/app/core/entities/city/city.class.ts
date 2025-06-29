import { CityI } from './city.model';

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
} 