import { Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { UserI } from './user.model';
import { UserC } from './user.class';
import { CityClass } from '../city/city.class';
import { DocumentReference } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class UserService extends FirebaseRequest<UserI> {
  private _collectionName = 'user';

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async getUserById(id: string): Promise<UserC | null> {
    return this.processGetUser(id, 'id');
  }

  async getUserByCity(city: DocumentReference): Promise<UserC | null> {
    return this.processGetUser(city, 'city');
  }

  async getUserByUid(uid: string): Promise<UserC | null> {
    return this.processGetUser(uid, 'uid');
  }

  async getUserByEmail(email: string): Promise<UserC | null> {
    return this.processGetUser(email, 'email');
  }

  private processGetUser(value: any, by: string): Promise<UserC | null> {
    return new Promise<UserC | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(user => {
          resolve(user ? new UserC(user) : null);
        })
        .catch(error => {
          console.error(error);
          resolve(null);
        });
    });
  }
}
