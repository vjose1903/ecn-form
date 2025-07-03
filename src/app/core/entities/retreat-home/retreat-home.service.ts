import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatHomeI } from './retreat-home.model';
import { RetreatHome } from './retreat-home.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { CityService } from '../city/city.service';
import { Ss } from '@core/services/singleton.service';

@Injectable({
  providedIn: 'root',
})
export class RetreatHomeService extends FirebaseRequest<RetreatHomeI> {
  private _collectionName = 'retreat_home';
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private cityService = inject(CityService);

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async getAll(): Promise<RetreatHome[]> {
    const currentUser = this.authService.current_user();

    const cityRef = await currentUser?.cityRef;
    console.log('%c currentUser?.cityRef', 'color: red; font-weight: bold;', cityRef);

    return this._getAll({ find_by: 'city', find_value: cityRef }).then(retreats => retreats.map(retreat => new RetreatHome(retreat)));
  }

  async getRetreatHomeById(id: string): Promise<RetreatHome | null> {
    return this.processGetRetreatHome(id, 'id');
  }

  private processGetRetreatHome(value: string, by: string): Promise<RetreatHome | null> {
    return new Promise<RetreatHome | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          console.log('%c retreat', 'color: blue; font-weight: bold;', retreat);
          resolve(retreat ? new RetreatHome(retreat) : null);
        })
        .catch(error => {
          console.log(`ℹ️ [RetreatService] Retiro no encontrado con ${by}: ${value}`);
          resolve(null);
        });
    });
  }

  createRetreatHome(newRetreatHome: RetreatHomeI) {
    if (fun.isEmpty(this.authService.current_user())) throw new Error('User is not defined');

    return this.createOneInParentCollection({ parentCollection: this.userService.collectionName, parentId: this.authService.current_user()!.id, data: newRetreatHome });
  }
}
