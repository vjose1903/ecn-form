import { Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebaseRequest';
import { UserI } from './user.model';
import { User } from './user.class';

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

  async getUserByUid(uid: string): Promise<User | null> {
    return this.processGetUser(uid, 'uid');
  }
  
  async getUserByEmail(email: string): Promise<User | null> {
    return this.processGetUser(email, 'email');
  }

  private processGetUser(value: string, by: string): Promise<User | null> {
    return new Promise<User | null>((resolve) => {
      this._getOne({ find_by: by, find_value: value })
        .then(user => {
          resolve(user ? new User(user) : null);
        })
        .catch(error => {
          console.log(`ℹ️ [UserService] Usuario no encontrado con ${by}: ${value}`);
          resolve(null);
        });
    });
  }
}
