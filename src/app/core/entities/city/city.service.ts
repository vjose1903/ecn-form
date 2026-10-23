import { inject, Injectable, signal } from '@angular/core';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { CityI } from './city.model';
import { CityClass } from './city.class';

@Injectable({
  providedIn: 'root',
})
export class CityService extends FirebaseRequest<CityI> {
  private firestore = inject(Firestore);
  private _collectionName = 'city';
  readonly cities = signal<CityClass[]>([]);

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async loadAllCities(): Promise<CityClass[]> {
    const snapshot = await getDocs(collection(this.firestore, this._collectionName));
    const cities = snapshot.docs.map(item => new CityClass({id: item.id, ...item.data()} as CityI));
    this.cities.set(cities);
    return cities;
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
