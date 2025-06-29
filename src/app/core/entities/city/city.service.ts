import { Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebaseRequest';
import { CityI } from './city.model';
import { City } from './city.class';

@Injectable({
  providedIn: 'root',
})
export class CityService extends FirebaseRequest<CityI> {
  private _collectionName = 'city';

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async getCityById(id: string): Promise<City | null> {
    return this.processGetCity(id, 'id');
  }

  async getCityByName(name: string): Promise<City | null> {
    return this.processGetCity(name, 'name');
  }

  private processGetCity(value: string, by: string): Promise<City | null> {
    return new Promise<City | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(city => {
          console.log('%c city', 'color: blue; font-weight: bold;', city);
          resolve(city ? new City(city) : null);
        })
        .catch(error => {
          console.log(`ℹ️ [CityService] Ciudad no encontrada con ${by}: ${value}`);
          resolve(null);
        });
    });
  }
}
