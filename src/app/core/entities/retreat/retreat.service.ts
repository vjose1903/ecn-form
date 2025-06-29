import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebaseRequest';
import { RetreatI } from './retreat.model';
import { Retreat } from './retreat.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class RetreatService extends FirebaseRequest<RetreatI> {
  private _collectionName = 'retreat';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async getRetreatById(id: string): Promise<Retreat | null> {
    return this.processGetRetreat(id, 'id');
  }

  private processGetRetreat(value: string, by: string): Promise<Retreat | null> {
    return new Promise<Retreat | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          console.log('%c retreat', 'color: blue; font-weight: bold;', retreat);
          resolve(retreat ? new Retreat(retreat) : null);
        })
        .catch(error => {
          console.log(`ℹ️ [RetreatService] Retiro no encontrado con ${by}: ${value}`);
          resolve(null);
        });
    });
  }

  createConfig(newRetreat: RetreatI) {
    if (fun.isEmpty(this.authService.current_user())) throw new Error('User is not defined');

    return this.createOneInParentCollection({ parentCollection: this.userService.collectionName, parentId: this.authService.current_user()!.id, data: newRetreat });
  }
}
