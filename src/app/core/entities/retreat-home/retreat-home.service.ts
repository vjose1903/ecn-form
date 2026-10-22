import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatHomeI } from './retreat-home.model';
import { RetreatHomeClass } from './retreat-home.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { RetreatI } from '../retreat/retreat.model';
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { FileService } from '../file/file.service';
import { FileClass } from '../file/file.class';
import { FileI } from '../file/file.model';

@Injectable({
  providedIn: 'root',
})
export class RetreatHomeService extends FirebaseRequest<RetreatHomeI> {
  private _collectionName = 'retreat_home';
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private functions = inject(Functions);
  private fileService = inject(FileService);

  private _retreatHomes: BehaviorSubject<RetreatHomeClass[]> = new BehaviorSubject<RetreatHomeClass[]>([]);
  private _loadingRetreatHomeList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private _cacheCityId = '';
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get retreatHomes$(): Observable<RetreatHomeClass[]> {
    return this._retreatHomes.asObservable();
  }

  get loadingRetreatHomes$(): Observable<boolean> {
    return this._loadingRetreatHomeList.asObservable();
  }

  get retreatHomes(): RetreatHomeClass[] {
    return this._retreatHomes.value;
  }

  get loadingRetreatHomes(): boolean {
    return this._loadingRetreatHomeList.value;
  }

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  /**
   * Obtiene todas las casas de retiro con caché
   */
  async getAll(): Promise<RetreatHomeClass[]> {
    const now = Date.now();
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city || '';

    // Verificar si el caché es válido
    if (this._retreatHomes.value.length > 0 && this._cacheCityId === cityId && now - this._lastFetch < this.CACHE_DURATION) {
      return this._retreatHomes.value;
    }

    return this.fetchAllRetreatHomes();
  }

  /**
   * Obtiene todas las casas de retiro desde Firebase
   */
  private async fetchAllRetreatHomes(): Promise<RetreatHomeClass[]> {
    try {
      this._loadingRetreatHomeList.next(true);
      const currentUser = this.authService.current_user();
      const cityId = this.authService.activeCityId() || currentUser?.city;
      if (!cityId) {
        throw new Error('No se pudo obtener la referencia de la ciudad del usuario');
      }
      const assignments = await getDocs(collection(Ss.firestore, `city/${cityId}/retreat_homes`));
      const homes = await Promise.all(assignments.docs.map(async assignment => {
        const home = await getDoc(doc(Ss.firestore, `${this._collectionName}/${assignment.id}`));
        return home.exists() ? this.hydrateHome({ ...home.data(), id: home.id, city: cityId, is_active: assignment.get('is_active') }) : null;
      }));
      const retreatHomes = homes.filter((home): home is RetreatHomeClass => home !== null);

      this._retreatHomes.next(retreatHomes);
      this._cacheCityId = cityId;
      this._lastFetch = Date.now();

      return retreatHomes;
    } catch (error) {
      console.error('Error al obtener casas de retiro:', error);
      Ss.toastService.error({ message: 'Error al cargar las casas de retiro', title: 'Error de carga' });
      throw error;
    } finally {
      this._loadingRetreatHomeList.next(false);
    }
  }

  /**
   * Obtiene una casa de retiro por ID
   */
  async getRetreatHomeById(id: string): Promise<RetreatHomeClass | null> {
    if (!id) {
      return null;
    }

    // Primero buscar en caché
    const cached = this._retreatHomes.value.find(rh => rh.id === id);
    if (cached) {
      return cached;
    }

    const currentUser = this.authService.current_user();
    const cityId = this.authService.activeCityId() || currentUser?.city;
    if (!cityId) return null;
    const assignment = await getDoc(doc(Ss.firestore, `city/${cityId}/retreat_homes/${id}`));
    if (!assignment.exists()) return null;
    const snapshot = await getDoc(doc(Ss.firestore, `${this._collectionName}/${id}`));
    return snapshot.exists() ? this.hydrateHome({ ...snapshot.data(), id, city: cityId, is_active: assignment.get('is_active') }) : null;
  }

  /**
   * Procesa la obtención de una casa de retiro
   */
  private processGetRetreatHome(value: string, by: string): Promise<RetreatHomeClass | null> {
    return new Promise<RetreatHomeClass | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatHome = retreat ? new RetreatHomeClass(retreat) : null;
          resolve(retreatHome);
        })
        .catch(error => {
          console.error(`Error al obtener casa de retiro por ${by}:`, error);
          reject(error);
        });
    });
  }

  /**
   * Crea una nueva casa de retiro
   */
  async createRetreatHome(newRetreatHome: RetreatHomeI): Promise<RetreatHomeI> {
    if (fun.isEmpty(this.authService.current_user())) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const currentUser = this.authService.current_user();
      const cityId = currentUser?.city;
      if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
      const create = httpsCallable(this.functions, 'createCityRetreatHome');
      const response = await create({
        cityId,
        name: newRetreatHome.name,
        phone: newRetreatHome.phone,
        address: newRetreatHome.address,
        location: newRetreatHome.location,
        images: this.imageIds(newRetreatHome.images),
      });
      const id = (response.data as {homeId: string}).homeId;
      const home = await getDoc(doc(Ss.firestore, `${this._collectionName}/${id}`));
      if (!home.exists()) throw new Error('La casa se guardó pero no se pudo recuperar');
      const result = { ...home.data(), id, city: cityId } as RetreatHomeI;

      // Actualizar observable
      this.updateRetreatHomeInCache(result, 'create');

      Ss.toastService.success({ message: 'Casa de retiro creada correctamente', title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al crear casa de retiro:', error);
      Ss.toastService.error({ message: 'Error al crear la casa de retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Actualiza una casa de retiro
   */
  async updateRetreatHome(retreatHome: RetreatHomeI): Promise<RetreatHomeI> {
    if (!retreatHome.id) {
      throw new Error('ID de casa de retiro requerido para actualización');
    }

    try {
      const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
      if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
      const update = httpsCallable(this.functions, 'updateCityRetreatHome');
      await update({
        cityId,
        homeId: retreatHome.id,
        name: retreatHome.name,
        phone: retreatHome.phone,
        address: retreatHome.address,
        location: retreatHome.location,
        images: this.imageIds(retreatHome.images),
      });
      const result = retreatHome;

      // Actualizar observable
      this.updateRetreatHomeInCache(result, 'update');

      Ss.toastService.success({ message: 'Casa de retiro actualizada correctamente', title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al actualizar casa de retiro:', error);
      Ss.toastService.error({ message: 'Error al actualizar la casa de retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Cambia el estado de una casa de retiro
   */
  async toggleRetreatHomeStatus(retreatHome: RetreatHomeClass): Promise<RetreatHomeI> {
    try {
      const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
      if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
      await updateDoc(doc(Ss.firestore, `city/${cityId}/retreat_homes/${retreatHome.id}`), { is_active: !retreatHome.is_active });
      const result = { ...retreatHome, is_active: !retreatHome.is_active } as unknown as RetreatHomeI;

      // Actualizar observable
      this.updateRetreatHomeInCache(result, 'update');

      const action = retreatHome.is_active ? 'desactivada' : 'activada';
      Ss.toastService.success({ message: `Casa de retiro ${action} correctamente`, title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al cambiar estado de casa de retiro:', error);
      Ss.toastService.error({ message: 'Error al cambiar el estado de la casa de retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Elimina una casa de retiro
   */
  async deleteRetreatHome(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID de casa de retiro requerido para eliminación');
    }

    try {
      const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
      if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
      await deleteDoc(doc(Ss.firestore, `city/${cityId}/retreat_homes/${id}`));

      // Remover del observable
      this.removeRetreatHomeFromCache(id);

      Ss.toastService.success({ message: 'Casa de retiro eliminada correctamente', title: 'Éxito' });
    } catch (error) {
      console.error('Error al eliminar casa de retiro:', error);
      Ss.toastService.error({ message: 'Error al eliminar la casa de retiro', title: 'Error' });
      throw error;
    }
  }

  private imageIds(images: Array<FileClass | string | FileI>): string[] {
    return images.map(image => typeof image === 'string' ? image : image.id).filter((id): id is string => Boolean(id));
  }

  private async hydrateHome(data: Partial<RetreatHomeI> & {id: string; city: string; is_active?: boolean}): Promise<RetreatHomeClass> {
    const images = await Promise.all(this.imageIds(data.images ?? []).map(id => this.fileService.getFileById(id)));
    return new RetreatHomeClass({
      ...data,
      name: data.name ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      location: data.location ?? '',
      images: images.filter((file): file is FileClass => file !== null),
    });
  }

  /**
   * Actualiza o agrega una casa de retiro en el observable
   */
  private updateRetreatHomeInCache(retreatHomeData: RetreatHomeI, action: 'create' | 'update'): void {
    const retreatHomeInstance = new RetreatHomeClass(retreatHomeData);
    const currentRetreatHomes = this._retreatHomes.value;

    if (action === 'create') {
      // Agregar al final del array
      this._retreatHomes.next([...currentRetreatHomes, retreatHomeInstance]);
    } else {
      // Buscar y actualizar
      const index = currentRetreatHomes.findIndex(rh => rh.id === retreatHomeData.id);
      if (index !== -1) {
        currentRetreatHomes[index] = retreatHomeInstance;
        this._retreatHomes.next([...currentRetreatHomes]);
      }
    }
  }

  /**
   * Remueve una casa de retiro del observable
   */
  private removeRetreatHomeFromCache(id: string): void {
    const currentRetreatHomes = this._retreatHomes.value;
    const filteredRetreatHomes = currentRetreatHomes.filter(rh => rh.id !== id);
    this._retreatHomes.next(filteredRetreatHomes);
  }

  /**
   * Refresca los datos
   */
  async refresh(): Promise<void> {
    this.invalidateCache();
    await this.fetchAllRetreatHomes();
  }

  /**
   * Invalida el caché
   */
  private invalidateCache(): void {
    this._retreatHomes.next([]);
    this._lastFetch = 0;
    this._cacheCityId = '';
  }

  /**
   * Limpia el caché
   */
  override clearCache(): void {
    this._retreatHomes.next([]);
    this._lastFetch = 0;
    this._cacheCityId = '';
  }
}
