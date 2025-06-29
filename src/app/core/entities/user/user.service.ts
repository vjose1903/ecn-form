import { Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebaseRequest';
import { UserI } from './user.model';
import { UserC } from './user.class';

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

  async getUserByUid(uid: string): Promise<UserC | null> {
    return this.processGetUser(uid, 'uid');
  }

  async getUserByEmail(email: string): Promise<UserC | null> {
    return this.processGetUser(email, 'email');
  }

  private processGetUser(value: string, by: string): Promise<UserC | null> {
    return new Promise<UserC | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(user => {
          resolve(user ? new UserC(user) : null);
        })
        .catch(error => {
          console.log(`❌ [UserService] Usuario no encontrado con ${by}: ${value}`);
          resolve(null);
        });
    });
  }
}
