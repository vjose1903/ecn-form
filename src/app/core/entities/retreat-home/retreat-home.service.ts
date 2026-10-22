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
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { FileService } from '../file/file.service';
import { FileClass } from '../file/file.class';
import { FileI } from '../file/file.model';

export interface RetreatHomeAssignmentOverview {
  homes: Array<{id: string; name: string; address: string; imageUrl: string}>;
  cities: Array<{id: string; label: string}>;
  assignments: string[];
}

export interface SimilarRetreatHome {
  id: string;
  name: string;
  address: string;
  alreadyAssigned: boolean;
  imageIds: string[];
  imageUrls: string[];
}

export interface RetreatHomeSimilarityCheck {
  cityLabel: string;
  candidates: SimilarRetreatHome[];
}

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

  async getRetreatHomeAssignmentOptions(): Promise<Omit<RetreatHomeAssignmentOverview, 'assignments'>> {
    if (!this.authService.isSuperAdmin()) throw new Error('Solo superadmin puede administrar asignaciones entre ciudades');
    const [homesSnapshot, citiesSnapshot] = await Promise.all([
      getDocs(collection(Ss.firestore, this._collectionName)),
      getDocs(collection(Ss.firestore, 'city')),
    ]);
    const cities = citiesSnapshot.docs.map(city => ({id: city.id, label: String(city.get('label') || city.id)}));
    return {
      homes: await Promise.all(homesSnapshot.docs.map(async home => {
        const imageIds = this.imageIds((home.get('images') || []) as Array<FileClass | string | FileI>);
        const images = await Promise.all(imageIds.map(id => this.fileService.getFileById(id)));
        return {
          id: home.id,
          name: String(home.get('name') || home.id),
          address: String(home.get('address') || ''),
          imageUrl: images.find(image => image?.url)?.url || '',
        };
      })),
      cities,
    };
  }

  async getRetreatHomeAssignments(cityIds: string[]): Promise<string[]> {
    if (!this.authService.isSuperAdmin()) throw new Error('Solo superadmin puede administrar asignaciones entre ciudades');
    const assignmentsByCity = await Promise.all(cityIds.map(cityId =>
      getDocs(collection(Ss.firestore, `city/${cityId}/retreat_homes`)),
    ));
    return assignmentsByCity.flatMap((assignments, index) => assignments.docs.map(assignment => `${cityIds[index]}/${assignment.id}`));
  }

  async updateRetreatHomeAssignments(homeIds: string[], cityIds: string[], associate: boolean): Promise<number> {
    if (!this.authService.isSuperAdmin()) throw new Error('Solo superadmin puede administrar asignaciones entre ciudades');
    if (!homeIds.length || !cityIds.length) return 0;
    if (homeIds.length * cityIds.length > 500) throw new Error('Selecciona hasta 500 relaciones por operación.');
    const uid = this.authService.current_user()?.uid;
    if (!uid) throw new Error('Usuario no autenticado');

    const relations = cityIds.flatMap(cityId => homeIds.map(homeId => ({
      cityId,
      homeId,
      ref: doc(Ss.firestore, `city/${cityId}/retreat_homes/${homeId}`),
    })));
    return runTransaction(Ss.firestore, async transaction => {
      const assignments = await Promise.all(relations.map(relation => transaction.get(relation.ref)));
      let changed = 0;
      assignments.forEach((assignment, index) => {
        if (associate && !assignment.exists()) {
          const {cityId, homeId, ref} = relations[index];
          transaction.set(ref, {home_id: homeId, is_active: true, created_by: uid, created_at: serverTimestamp()});
          changed += 1;
        } else if (!associate && assignment.exists()) {
          transaction.delete(relations[index].ref);
          changed += 1;
        }
      });
      return changed;
    });
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
      const cityId = this.authService.activeCityId() || currentUser?.city;
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
      const data = response.data as {homeId: string; home: Partial<RetreatHomeI>};
      const result = await this.hydrateHome({...data.home, id: data.homeId, city: cityId, is_active: true});

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

  async findSimilarRetreatHomes(name: string, address: string): Promise<RetreatHomeSimilarityCheck> {
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId) throw new Error('No se pudo determinar la ciudad seleccionada.');
    const findSimilar = httpsCallable(this.functions, 'findSimilarCityRetreatHomes');
    const response = await findSimilar({cityId, name, address});
    const result = response.data as Omit<RetreatHomeSimilarityCheck, 'candidates'> & {
      candidates: Array<Omit<SimilarRetreatHome, 'imageUrls'>>;
    };
    return {...result, candidates: result.candidates.map(candidate => ({...candidate, imageUrls: []}))};
  }

  async getSimilarRetreatHomeImageUrls(imageIds: string[]): Promise<string[]> {
    const files = await Promise.all(imageIds.slice(0, 3).map(id => this.fileService.getFileById(id)));
    return files.flatMap(file => file?.url ? [file.url] : []);
  }

  async assignExistingRetreatHome(homeId: string, name: string, address: string): Promise<RetreatHomeI> {
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId) throw new Error('No se pudo determinar la ciudad seleccionada.');
    const assign = httpsCallable(this.functions, 'assignExistingCityRetreatHome');
    const response = await assign({cityId, homeId, name, address});
    const data = response.data as {homeId: string; alreadyAssigned: boolean; home: Partial<RetreatHomeI>};
    const result = await this.hydrateHome({...data.home, id: data.homeId, city: cityId, is_active: true});
    this.updateRetreatHomeInCache(result, 'create');
    Ss.toastService.success({
      title: data.alreadyAssigned ? 'Casa ya asignada' : 'Casa asignada',
      message: data.alreadyAssigned ? 'Esta casa ya estaba asociada a la ciudad.' : 'Se reutilizó la casa existente y se asoció a la ciudad.',
    });
    return result;
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
      const existingIndex = currentRetreatHomes.findIndex(rh => rh.id === retreatHomeData.id);
      if (existingIndex === -1) {
        this._retreatHomes.next([...currentRetreatHomes, retreatHomeInstance]);
      } else {
        this._retreatHomes.next(currentRetreatHomes.map((home, index) => index === existingIndex ? retreatHomeInstance : home));
      }
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
