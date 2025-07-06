import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RequestI } from './request.model';
import { Request } from './request.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { Retreat } from '../retreat/retreat.class';

@Injectable({
  providedIn: 'root',
})
export class RequestService extends FirebaseRequest<RequestI> {
  private _collectionName = 'request';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  private _requests: BehaviorSubject<Request[]> = new BehaviorSubject<Request[]>([]);
  private _loadingRequestsList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get requests$(): Observable<Request[]> {
    return this._requests.asObservable();
  }

  get loadingRequests$(): Observable<boolean> {
    return this._loadingRequestsList.asObservable();
  }

  get requests(): Request[] {
    return this._requests.value;
  }

  get loadingRequests(): boolean {
    return this._loadingRequestsList.value;
  }

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  /**
   * Obtiene todos los retiros por retiro
   */
  async getAll(args: { onlyActive?: boolean } = {}): Promise<Request[]> {
    const now = Date.now();

    // Verificar si el caché es válido
    if (this._requests.value.length > 0 && now - this._lastFetch < this.CACHE_DURATION) {
      return this._requests.value;
    }

    return this.fetchAllRequests(args);
  }

  /**
   * Obtiene todos los retiros desde Firebase usando la colección padre
   */
  private async fetchAllRequests(args: { onlyActive?: boolean } = {}): Promise<Request[]> {
    const { onlyActive } = args;
    try {
      this._loadingRequestsList.next(true);
      const currentUser = this.authService.current_user();

      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      let requests: RequestI[] = [];

      if (onlyActive) {
        requests = await this._getAllByMultipleFields(
          [
            { field: 'is_active', value: true },
            { field: 'accept_requests', value: true },
          ],
          {
            parentCollection: this.userService.collectionName,
            parentId: currentUser.id,
          }
        );
      } else {
        requests = await this.getAllFromParentCollection({
          parentCollection: this.userService.collectionName,
          parentId: currentUser.id,
        });
      }

      const retreatList = requests.map(retreat => new Request(retreat));

      this._requests.next(retreatList);
      this._lastFetch = Date.now();

      return retreatList;
    } catch (error) {
      console.error('Error al obtener retiros:', error);
      Ss.toastService.error({ message: 'Error al cargar los retiros', title: 'Error de carga' });
      throw error;
    } finally {
      this._loadingRequestsList.next(false);
    }
  }

  /**
   * Obtiene un retiro por ID
   */
  async getRetreatById(id: string): Promise<Request | null> {
    if (!id) {
      return null;
    }

    // Primero buscar en caché
    const cached = this._requests.value.find(r => r.id === id);
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
      return retreat ? new Request(retreat) : null;
    }

    return this.processGetRetreat(id, 'id');
  }

  /**
   * Procesa la obtención de un retiro
   */
  private processGetRetreat(value: string, by: string): Promise<Request | null> {
    return new Promise<Request | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatObj = retreat ? new Request(retreat) : null;
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
  async createRequest(newRequest: RequestI, retreat: Retreat): Promise<RequestI> {
    if (fun.isEmpty(this.authService.current_user())) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const result = await this._createOne({ refString: `${retreat.completeRefString()}/request`, data: newRequest });

      // Actualizar observable
      this.updateRequestInCache(result, 'create');

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
  async updateRetreat(retreat: RequestI): Promise<RequestI> {
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
      this.updateRequestInCache(result, 'update');

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
  async toggleRequeststatus(retreat: Request): Promise<RequestI> {
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
      this.updateRequestInCache(result, 'update');

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
    const requests = this._requests.value;
    const total = requests.length;
    const active = requests.filter(r => r.is_active).length;
    const inactive = total - active;

    return { total, active, inactive };
  }

  /**
   * Actualiza o agrega un retiro en el observable
   */
  private updateRequestInCache(requestData: RequestI, action: 'create' | 'update'): void {
    const requestInstance = new Request(requestData);
    const currentRequests = this._requests.value;

    if (action === 'create') {
      // Agregar al final del array
      this._requests.next([...currentRequests, requestInstance]);
    } else {
      // Buscar y actualizar
      const index = currentRequests.findIndex(r => r.id === requestData.id);
      if (index !== -1) {
        currentRequests[index] = requestInstance;
        this._requests.next([...currentRequests]);
      }
    }
  }

  /**
   * Remueve un retiro del observable
   */
  private removeRetreatFromCache(id: string): void {
    const currentRequests = this._requests.value;
    const filteredRequests = currentRequests.filter(r => r.id !== id);
    this._requests.next(filteredRequests);
  }

  /**
   * Invalida el caché
   */
  private invalidateCache(): void {
    this._requests.next([]);
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
    this._requests.next([]);
    this._loadingRequestsList.next(false);
    this._lastFetch = 0;
  }
}
