import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { UserI } from './user.model';
import { UserC } from './user.class';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { RetreatI } from '../retreat/retreat.model';

interface PublicFormData {
  city: Record<string, unknown> & {id: string};
  retreats: RetreatI[];
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly publicForms = new Map<string, PublicFormData>();
  readonly collectionName = 'user';

  async getUserById(uid: string): Promise<UserC | null> {
    return this.getUserByUid(uid);
  }

  async getUserByUid(uid: string): Promise<UserC | null> {
    if (!uid) return null;
    try {
      const snapshot = await getDoc(doc(this.firestore, `user/${uid}`));
      if (!snapshot.exists()) return null;
      const profile = snapshot.data() as UserI & {primary_city_id?: string; city_id?: string};
      const profileCity = profile.city ?? profile.primary_city_id ?? profile.city_id ?? '';
      const cityId = typeof profileCity === 'string' ? profileCity : profileCity.id;
      let citySnapshot = null;
      if (cityId) {
        try {
          citySnapshot = await getDoc(doc(this.firestore, `city/${cityId}`));
        } catch (cityError) {
          if ((cityError as {code?: string})?.code !== 'permission-denied') throw cityError;
        }
      }
      const city = citySnapshot?.exists() ? { ...citySnapshot.data(), id: cityId } : profileCity;
      return new UserC({ ...profile, city, id: snapshot.id } as UserI & {city?: any});
    } catch (error) {
      console.error('Error al obtener el perfil del usuario:', error);
      throw error;
    }
  }

  async updateOwnProfile(phone: string): Promise<void> {
    const update = httpsCallable<{phone: string}, {uid: string}>(this.functions, 'updateOwnProfile');
    await update({ phone });
  }

  async getPublicFormUser(cityId: string): Promise<UserC | null> {
    if (!cityId) return null;
    const data = await this.getPublicFormData(cityId);
    return new UserC({id: cityId, uid: '', email: '', phone: '', city: data.city} as UserI & {city?: any});
  }

  async getPublicRetreats(cityId: string): Promise<RetreatI[]> {
    return (await this.getPublicFormData(cityId)).retreats;
  }

  private async getPublicFormData(cityId: string): Promise<PublicFormData> {
    const cached = this.publicForms.get(cityId);
    if (cached) return cached;
    const getData = httpsCallable<{cityId: string}, PublicFormData>(this.functions, 'getPublicFormData');
    const result = await getData({cityId});
    this.publicForms.set(cityId, result.data);
    return result.data;
  }
}
