import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatI } from './retreat.model';
import { RetreatClass } from './retreat.class';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { CityClass } from '../city/city.class';
import { UserC } from '../user/user.class';
import { UserService } from '../user/user.service';
import { RequestClass } from '../request/request.class';
import { RequestService } from '../request/request.service';
import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, query, setDoc, updateDoc, where } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class RetreatService extends FirebaseRequest<RetreatI> {
  private _collectionName = 'retreat';
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private requestService = inject(RequestService);

  private _retreats: BehaviorSubject<RetreatClass[]> = new BehaviorSubject<RetreatClass[]>([]);
  private _requests: BehaviorSubject<RequestClass[]> = new BehaviorSubject<RequestClass[]>([]);
  private _loadingRetreatList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private _cacheCityId = '';
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get retreats$(): Observable<RetreatClass[]> {
    return this._retreats.asObservable();
  }

  get requests$(): Observable<RequestClass[]> {
    return this._requests.asObservable();
  }

  get loadingRetreats$(): Observable<boolean> {
    return this._loadingRetreatList.asObservable();
  }

  get retreats(): RetreatClass[] {
    return this._retreats.value;
  }

  get requests(): RequestClass[] {
    return this._requests.value;
  }

  get loadingRetreats(): boolean {
    return this._loadingRetreatList.value;
  }

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  getRetreatReference(retreat: RetreatClass) {
    const cityId = retreat.city_id || this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId || !retreat.id) throw new Error('El retiro no tiene ciudad o identificador válido');
    return doc(Ss.firestore, `city/${cityId}/${this._collectionName}/${retreat.id}`);
  }

  /**
   * Obtiene todos los retiros con caché
   */
  async getRetreatByUser(user: UserC): Promise<RetreatClass[] | null> {
    return (await this.userService.getPublicRetreats(user.city)).map(retreat => new RetreatClass(retreat));
  }

  /**
   * Obtiene todos los retiros con caché
   */
  async getAll(args: { onlyActive?: boolean } = {}): Promise<RetreatClass[]> {
    const now = Date.now();
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city || '';

    // Verificar si el caché es válido
    if (this._retreats.value.length > 0 && this._cacheCityId === cityId && now - this._lastFetch < this.CACHE_DURATION) {
      return this._retreats.value;
    }

    return this.fetchAllRetreats(args);
  }

  /**
   * Obtiene todos los retiros desde Firebase usando la colección padre
   */
  private async fetchAllRetreats(args: { onlyActive?: boolean } = {}): Promise<RetreatClass[]> {
    const { onlyActive } = args;
    try {
      this._loadingRetreatList.next(true);
      const currentUser = this.authService.current_user();

      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const cityId = this.authService.activeCityId() || currentUser.city;
      const retreatList = await this.readCityRetreats(cityId, onlyActive ?? false);
      await Promise.all(retreatList.map(async retreat => {
        const requests = query(
          collection(Ss.firestore, `city/${cityId}/requests`),
          where('retreat_id', '==', retreat.id),
          where('is_archived', '==', false)
        );
        retreat.request_count = (await getCountFromServer(requests)).data().count;
      }));

      this._retreats.next(retreatList);
      this._cacheCityId = cityId;
      this._lastFetch = Date.now();

      return retreatList;
    } catch (error) {
      console.error('Error al obtener retiros:', error);
      Ss.toastService.error({ message: 'Error al cargar los retiros', title: 'Error de carga' });
      throw error;
    } finally {
      this._loadingRetreatList.next(false);
    }
  }

  private async readCityRetreats(cityId: string, onlyActive: boolean): Promise<RetreatClass[]> {
    if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
    const retreatsRef = collection(Ss.firestore, `city/${cityId}/retreat`);
    const constraints = onlyActive ? [where('is_active', '==', true), where('accept_requests', '==', true)] : [];
    const snapshot = await getDocs(query(retreatsRef, ...constraints));
    return snapshot.docs.map(item => new RetreatClass({ ...item.data(), id: item.id } as RetreatI));
  }

  /**
   * Obtiene un retiro por ID
   */
  async getRetreatById(id: string): Promise<RetreatClass | null> {
    if (!id) {
      return null;
    }

    // Primero buscar en caché
    const cached = this._retreats.value.find(r => r.id === id);
    if (cached) {
      return cached;
    }

    // Si no está en caché, buscar en la ciudad activa del usuario.
    const currentUser = this.authService.current_user();
    const cityId = this.authService.activeCityId() || currentUser?.city;
    if (cityId) {
      const snapshot = await getDoc(doc(Ss.firestore, `city/${cityId}/retreat/${id}`));
      return snapshot.exists() ? new RetreatClass({ ...snapshot.data(), id: snapshot.id } as RetreatI) : null;
    }

    return this.processGetRetreat(id, 'id');
  }

  /**
   * Procesa la obtención de un retiro
   */
  private processGetRetreat(value: string, by: string): Promise<RetreatClass | null> {
    return new Promise<RetreatClass | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatObj = retreat ? new RetreatClass(retreat) : null;
          resolve(retreatObj);
        })
        .catch(error => {
          console.error(`Error al obtener retiro por ${by}:`, error);
          reject(error);
        });
    });
  }

  /**
   * Crea un nuevo retiro
   */
  async createRetreat(newRetreat: RetreatI): Promise<RetreatI> {
    const currentUser = this.authService.current_user();
    if (fun.isEmpty(currentUser)) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const retreatId = this.buildRetreatId(newRetreat);
      const cityId = this.authService.activeCityId() || currentUser!.city;
      if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
      const retreatRef = doc(Ss.firestore, `city/${cityId}/${this._collectionName}/${retreatId}`);
      if ((await getDoc(retreatRef)).exists()) {
        throw new Error(`Ya existe un retiro con el ID ${retreatId}`);
      }
      const { id: _id, ...data } = newRetreat;
      await setDoc(retreatRef, { ...data, city_id: cityId, user_id: currentUser!.id });
      const snapshot = await getDoc(retreatRef);
      const result = { ...snapshot.data(), id: snapshot.id } as RetreatI;

      // Actualizar observable
      this.updateRetreatInCache(result, 'create');

      Ss.toastService.success({ message: 'Retiro creado correctamente', title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al crear retiro:', error);
      Ss.toastService.error({ message: 'Error al crear el retiro', title: 'Error' });
      throw error;
    }
  }

  private buildRetreatId(retreat: RetreatI): string {
    const formatDate = (value: string | Date): string => {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error('Fechas inválidas para generar el ID del retiro');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (!retreat.number || !retreat.start_date || !retreat.end_date) {
      throw new Error('El número y las fechas del retiro son requeridos para generar su ID');
    }

    return `${retreat.number}_${formatDate(retreat.start_date)}_${formatDate(retreat.end_date)}`;
  }

  /**
   * Actualiza un retiro
   */
  async updateRetreat(retreat: RetreatI): Promise<RetreatI> {
    if (!retreat.id) {
      throw new Error('ID de retiro requerido para actualización');
    }

    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const cityId = retreat.city_id || this.authService.activeCityId() || currentUser.city;
      const { id, ...data } = retreat;
      await updateDoc(doc(Ss.firestore, `city/${cityId}/${this._collectionName}/${id}`), data);
      const result = { ...retreat };

      // Actualizar observable
      this.updateRetreatInCache(result, 'update');

      Ss.toastService.success({ message: 'Retiro actualizado correctamente', title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al actualizar retiro:', error);
      Ss.toastService.error({ message: 'Error al actualizar el retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Cambia el estado de un retiro
   */
  async toggleRetreatStatus(retreat: RetreatClass): Promise<RetreatI> {
    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const cityId = retreat.city_id || this.authService.activeCityId() || currentUser.city;
      await updateDoc(doc(Ss.firestore, `city/${cityId}/${this._collectionName}/${retreat.id}`), { is_active: !retreat.is_active });
      const result = { ...retreat, is_active: !retreat.is_active };

      // Actualizar observable
      this.updateRetreatInCache(result, 'update');

      const action = retreat.is_active ? 'desactivado' : 'activado';
      Ss.toastService.success({ message: `Retiro ${action} correctamente`, title: 'Éxito' });

      return result;
    } catch (error) {
      console.error('Error al cambiar estado del retiro:', error);
      Ss.toastService.error({ message: 'Error al cambiar el estado del retiro', title: 'Error' });
      throw error;
    }
  }

  async getRequests(retreat: RetreatClass): Promise<RequestClass[]> {
    return this.requestService.getRequestsForRetreat(retreat);
  }

  /**
   * Elimina un retiro
   */
  async deleteRetreat(id: string): Promise<void> {
    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const cityId = this._retreats.value.find(item => item.id === id)?.city_id || this.authService.activeCityId() || currentUser.city;
      if (!cityId) throw new Error('El retiro no tiene ciudad asignada');
      await deleteDoc(doc(Ss.firestore, `city/${cityId}/${this._collectionName}/${id}`));

      // Remover del observable
      this.removeRetreatFromCache(id);

      Ss.toastService.success({ message: 'Retiro eliminado correctamente', title: 'Éxito' });
    } catch (error) {
      console.error('Error al eliminar retiro:', error);
      Ss.toastService.error({ message: 'Error al eliminar el retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Obtiene estadísticas
   */
  getStats(): { total: number; active: number; inactive: number } {
    const retreats = this._retreats.value;
    const total = retreats.length;
    const active = retreats.filter(r => r.is_active).length;
    const inactive = total - active;

    return { total, active, inactive };
  }

  /**
   * Actualiza o agrega un retiro en el observable
   */
  private updateRetreatInCache(retreatData: RetreatI, action: 'create' | 'update'): void {
    const retreatInstance = new RetreatClass(retreatData);
    const currentRetreats = this._retreats.value;

    if (action === 'create') {
      // Agregar al final del array
      this._retreats.next([...currentRetreats, retreatInstance]);
    } else {
      // Buscar y actualizar
      const index = currentRetreats.findIndex(r => r.id === retreatData.id);
      if (index !== -1) {
        currentRetreats[index] = retreatInstance;
        this._retreats.next([...currentRetreats]);
      }
    }
  }

  /**
   * Remueve un retiro del observable
   */
  private removeRetreatFromCache(id: string): void {
    const currentRetreats = this._retreats.value;
    const filteredRetreats = currentRetreats.filter(r => r.id !== id);
    this._retreats.next(filteredRetreats);
  }

  /**
   * Invalida el caché
   */
  private invalidateCache(): void {
    this._retreats.next([]);
    this._lastFetch = 0;
    this._cacheCityId = '';
  }

  /**
   * Refresca los datos
   */
  async refresh(): Promise<void> {
    this.invalidateCache();
    await this.getAll();
  }

  /**
   * Limpia el caché
   */
  override clearCache(): void {
    this._retreats.next([]);
    this._loadingRetreatList.next(false);
    this._lastFetch = 0;
    this._cacheCityId = '';
  }
}
