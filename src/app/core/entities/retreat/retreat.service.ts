import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatI } from './retreat.model';
import { Retreat } from './retreat.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RetreatService extends FirebaseRequest<RetreatI> {
  private _collectionName = 'retreat';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  private _retreats: BehaviorSubject<Retreat[]> = new BehaviorSubject<Retreat[]>([]);
  private _loadingRetreatList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get retreats$(): Observable<Retreat[]> {
    return this._retreats.asObservable();
  }

  get loadingRetreats$(): Observable<boolean> {
    return this._loadingRetreatList.asObservable();
  }

  get retreats(): Retreat[] {
    return this._retreats.value;
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

  /**
   * Obtiene todos los retiros con caché
   */
  async getAll(): Promise<Retreat[]> {
    const now = Date.now();

    // Verificar si el caché es válido
    if (this._retreats.value.length > 0 && now - this._lastFetch < this.CACHE_DURATION) {
      return this._retreats.value;
    }

    return this.fetchAllRetreats();
  }

  /**
   * Obtiene todos los retiros desde Firebase usando la colección padre
   */
  private async fetchAllRetreats(): Promise<Retreat[]> {
    try {
      this._loadingRetreatList.next(true);
      const currentUser = this.authService.current_user();

      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      // Usar getAllFromParentCollection para obtener retiros desde la subcolección del usuario
      const retreats = await this.getAllFromParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: currentUser.id,
      });

      const retreatList = retreats.map(retreat => new Retreat(retreat));

      this._retreats.next(retreatList);
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

  /**
   * Obtiene un retiro por ID
   */
  async getRetreatById(id: string): Promise<Retreat | null> {
    if (!id) {
      return null;
    }

    // Primero buscar en caché
    const cached = this._retreats.value.find(r => r.id === id);
    if (cached) {
      return cached;
    }

    // Si no está en caché, buscar en la subcolección del usuario actual
    const currentUser = this.authService.current_user();
    if (currentUser?.id) {
      const retreat = await this.getOneFromParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: currentUser.id,
        documentId: id,
      });
      return retreat ? new Retreat(retreat) : null;
    }

    return this.processGetRetreat(id, 'id');
  }

  /**
   * Procesa la obtención de un retiro
   */
  private processGetRetreat(value: string, by: string): Promise<Retreat | null> {
    return new Promise<Retreat | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatObj = retreat ? new Retreat(retreat) : null;
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
    if (fun.isEmpty(this.authService.current_user())) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const result = await this.createOneInParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: this.authService.current_user()!.id,
        data: newRetreat,
      });

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

      const result = await this.updateOneInParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: currentUser.id,
        documentId: retreat.id,
        data: retreat,
      });

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
  async toggleRetreatStatus(retreat: Retreat): Promise<RetreatI> {
    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const result = await this.updateOneInParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: currentUser.id,
        documentId: retreat.id,
        data: { is_active: !retreat.is_active },
      });

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

  /**
   * Elimina un retiro
   */
  async deleteRetreat(id: string): Promise<void> {
    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      await this.deleteOneInParentCollection({
        parentCollection: this.userService.collectionName,
        parentId: currentUser.id,
        documentId: id,
      });

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
    const retreatInstance = new Retreat(retreatData);
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
  }

  // Método legacy para compatibilidad
  create(newRetreat: RetreatI) {
    return this.createRetreat(newRetreat);
  }
}
