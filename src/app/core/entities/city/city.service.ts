import { Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { CityI } from './city.model';
import { CityClass } from './city.class';

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

  async getCityById(id: string): Promise<CityClass | null> {
    return this.processGetCity(id, 'id');
  }

  async getCityByName(name: string): Promise<CityClass | null> {
    return this.processGetCity(name, 'name');
  }

  private processGetCity(value: string, by: string): Promise<CityClass | null> {
    return new Promise<CityClass | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(city => {
          resolve(city ? new CityClass(city) : null);
        })
        .catch(error => resolve(null));
    });
  }
}
