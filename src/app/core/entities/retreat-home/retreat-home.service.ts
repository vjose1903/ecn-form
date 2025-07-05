import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RetreatHomeI } from './retreat-home.model';
import { RetreatHome } from './retreat-home.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RetreatHomeService extends FirebaseRequest<RetreatHomeI> {
  private _collectionName = 'retreat_home';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  private _retreatHomes: BehaviorSubject<RetreatHome[]> = new BehaviorSubject<RetreatHome[]>([]);
  private _loadingRetreatHomeList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get retreatHomes$(): Observable<RetreatHome[]> {
    return this._retreatHomes.asObservable();
  }

  get loadingRetreatHomes$(): Observable<boolean> {
    return this._loadingRetreatHomeList.asObservable();
  }

  get retreatHomes(): RetreatHome[] {
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
  async getAll(): Promise<RetreatHome[]> {
    const now = Date.now();

    // Verificar si el caché es válido
    if (this._retreatHomes.value.length > 0 && now - this._lastFetch < this.CACHE_DURATION) {
      return this._retreatHomes.value;
    }

    return this.fetchAllRetreatHomes();
  }

  /**
   * Obtiene todas las casas de retiro desde Firebase
   */
  private async fetchAllRetreatHomes(): Promise<RetreatHome[]> {
    try {
      this._loadingRetreatHomeList.next(true);
      const currentUser = this.authService.current_user();
      const cityRef = await currentUser?.cityRef;

      if (!cityRef) {
        throw new Error('No se pudo obtener la referencia de la ciudad del usuario');
      }

      const retreats = await this._getAll({ find_by: 'city', find_value: cityRef });
      const retreatHomes = retreats.map(retreat => new RetreatHome(retreat));

      this._retreatHomes.next(retreatHomes);
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
  async getRetreatHomeById(id: string): Promise<RetreatHome | null> {
    if (!id) {
      return null;
    }

    // Primero buscar en caché
    const cached = this._retreatHomes.value.find(rh => rh.id === id);
    if (cached) {
      return cached;
    }

    return this.processGetRetreatHome(id, 'id');
  }

  /**
   * Procesa la obtención de una casa de retiro
   */
  private processGetRetreatHome(value: string, by: string): Promise<RetreatHome | null> {
    return new Promise<RetreatHome | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatHome = retreat ? new RetreatHome(retreat) : null;
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
      const result = await this._createOne({ data: newRetreatHome });

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
      const result = await this._updateOne({
        find_by: 'id',
        find_value: retreatHome.id,
        data: retreatHome,
      });

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
  async toggleRetreatHomeStatus(retreatHome: RetreatHome): Promise<RetreatHomeI> {
    try {
      const result = await this._updateOne({
        find_by: 'id',
        find_value: retreatHome.id,
        data: {
          id: retreatHome.id,
          is_active: !retreatHome.is_active,
        },
      });

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
      await this._deleteOne({ find_by: 'id', find_value: id });

      // Remover del observable
      this.removeRetreatHomeFromCache(id);

      Ss.toastService.success({ message: 'Casa de retiro eliminada correctamente', title: 'Éxito' });
    } catch (error) {
      console.error('Error al eliminar casa de retiro:', error);
      Ss.toastService.error({ message: 'Error al eliminar la casa de retiro', title: 'Error' });
      throw error;
    }
  }

  /**
   * Actualiza o agrega una casa de retiro en el observable
   */
  private updateRetreatHomeInCache(retreatHomeData: RetreatHomeI, action: 'create' | 'update'): void {
    const retreatHomeInstance = new RetreatHome(retreatHomeData);
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
  }

  /**
   * Limpia el caché
   */
  override clearCache(): void {
    this._retreatHomes.next([]);
    this._lastFetch = 0;
  }
}
