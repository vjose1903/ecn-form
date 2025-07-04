import { inject, Injectable, NgZone, WritableSignal } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatHomeI } from './retreat-home.model';
import { RetreatHome } from './retreat-home.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { CityService } from '../city/city.service';
import { Ss } from '@core/services/singleton.service';
import { ConfirmationService } from 'primeng/api';
import { ToastService } from '@core/services/toast.service';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RetreatHomeService extends FirebaseRequest<RetreatHomeI> {
  private _collectionName = 'retreat_home';
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private ngZone = inject(NgZone);

  private confirmationService = inject(ConfirmationService);
  private toastService = inject(ToastService);

  private _reload: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  get reload$(): Observable<boolean> {
    return this._reload.asObservable();
  }

  setReload(reload: boolean) {
    this._reload.next(reload);
  }

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

    return this._getAll({ find_by: 'city', find_value: cityRef }).then(retreats => retreats.map(retreat => new RetreatHome(retreat)));
  }

  async getRetreatHomeById(id: string): Promise<RetreatHome | null> {
    return this.processGetRetreatHome(id, 'id');
  }

  private processGetRetreatHome(value: string, by: string): Promise<RetreatHome | null> {
    return new Promise<RetreatHome | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          resolve(retreat ? new RetreatHome(retreat) : null);
        })
        .catch(error => {
          resolve(null);
        });
    });
  }

  createRetreatHome(newRetreatHome: RetreatHomeI) {
    if (fun.isEmpty(this.authService.current_user())) throw new Error('User is not defined');

    return this.createOneInParentCollection({ parentCollection: this.userService.collectionName, parentId: this.authService.current_user()!.id, data: newRetreatHome });
  }

  toggleRetreatHomeStatus(retreatHome: RetreatHome) {
    return this._updateOne({ find_by: 'id', find_value: retreatHome.id, data: { id: retreatHome.id, is_active: !retreatHome.is_active } });
  }
}
