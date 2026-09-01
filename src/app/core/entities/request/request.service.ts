import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { RequestAction, RequestHistoryChangeI, RequestHistoryI, RequestI } from './request.model';
import { RequestClass } from './request.class';
import { UserService } from '../user/user.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { RetreatClass } from '../retreat/retreat.class';
import { addDoc, Firestore, collection, doc, getDocs, increment, query, serverTimestamp, where, writeBatch } from '@angular/fire/firestore';
import { fun } from '@core/services/functions.service';

interface UpdateRequestOptions {
  previousRequest?: RequestI | RequestClass;
  trackAsEdited?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class RequestService extends FirebaseRequest<RequestI> {
  private _collectionName = 'request';
  private readonly archivedCollectionName = 'requests-archived';
  private readonly historyCollectionName = 'requests-history';
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);

  private _requests: BehaviorSubject<RequestClass[]> = new BehaviorSubject<RequestClass[]>([]);
  private _loadingRequestsList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutos

  // Observables públicos
  get requests$(): Observable<RequestClass[]> {
    return this._requests.asObservable();
  }

  get loadingRequests$(): Observable<boolean> {
    return this._loadingRequestsList.asObservable();
  }

  get requests(): RequestClass[] {
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

  set requests(value: RequestClass[]) {
    this._requests.next(value);
  }

  private parseUserIdFromRefString(refString: string): string | null {
    const [, userId] = refString.split('/');
    return userId || null;
  }

  private getHistoryCollectionRef(userId: string) {
    return collection(this.firestore, `user/${userId}/${this.historyCollectionName}`);
  }

  private getRetreatLabel(retreat?: RetreatClass | null): string | undefined {
    if (!retreat) {
      return undefined;
    }

    return `Retiro #${retreat.displayNumber} - ${retreat.displayCommunityName}`;
  }

  private isFirebaseTimestampLike(value: any): value is { seconds: number; nanoseconds?: number } {
    return Boolean(value) && typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number';
  }

  private normalizeComparableValue(value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (this.isFirebaseTimestampLike(value)) {
      return new Date(value.seconds * 1000).toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeComparableValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = this.normalizeComparableValue(value[key]);
            return acc;
          },
          {} as Record<string, any>
        );
    }

    return value ?? null;
  }

  private areValuesDifferent(left: any, right: any): boolean {
    return JSON.stringify(this.normalizeComparableValue(left)) !== JSON.stringify(this.normalizeComparableValue(right));
  }

  private formatDateOnly(value: Date): string {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private formatHistoryValue(value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'Sin valor';
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    if (value instanceof Date) {
      return this.formatDateOnly(value);
    }

    if (this.isFirebaseTimestampLike(value)) {
      return this.formatDateOnly(new Date(value.seconds * 1000));
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'Sin valor';
      }

      return value
        .map(item => {
          if (item && typeof item === 'object') {
            const parts = [item.familiar_full_name, item.familiar_relationship, item.familiar_phone].filter(Boolean);
            return parts.length ? parts.join(' | ') : JSON.stringify(item);
          }

          return String(item);
        })
        .join(' ; ');
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(this.normalizeComparableValue(value));
    }

    return String(value);
  }

  private getChangedFields(previousRequest: RequestI | RequestClass, nextRequest: RequestI | RequestClass): RequestHistoryChangeI[] {
    const before = previousRequest instanceof RequestClass ? previousRequest.asJson() : previousRequest;
    const after = nextRequest instanceof RequestClass ? nextRequest.asJson() : nextRequest;
    const changedFields: RequestHistoryChangeI[] = [];

    const baseFields: Array<{ key: keyof RequestI; label: string }> = [
      { key: 'retreat', label: 'Retiro' },
      { key: 'dating_period_year', label: 'Años de noviazgo' },
      { key: 'dating_period_month', label: 'Meses de noviazgo' },
      { key: 'have_wedding_date', label: 'Tiene fecha de boda' },
      { key: 'wedding_date', label: 'Fecha de boda' },
      { key: 'how_find_us', label: 'Cómo se enteraron del retiro' },
      { key: 'how_find_us_other', label: 'Otro medio por el que se enteraron' },
      { key: 'who_invited_you', label: 'Quién los invitó' },
      { key: 'who_invited_you_phone', label: 'Teléfono de quien los invitó' },
    ];

    const coupleFields: Array<{ key: keyof RequestI['she']; label: string }> = [
      { key: 'full_name', label: 'Nombre completo' },
      { key: 'nickname', label: 'Apodo' },
      { key: 'birth_date', label: 'Fecha de nacimiento' },
      { key: 'identity_type', label: 'Tipo de identificación' },
      { key: 'identity_number', label: 'Número de identificación' },
      { key: 'are_you_married', label: 'Ha estado casado/a' },
      { key: 'have_children', label: 'Tiene hijos' },
      { key: 'city_of_residence', label: 'Ciudad de residencia' },
      { key: 'address', label: 'Dirección' },
      { key: 'email', label: 'Correo' },
      { key: 'cell_phone', label: 'Teléfono celular' },
      { key: 'home_phone', label: 'Teléfono de casa' },
      { key: 'work_phone', label: 'Teléfono de trabajo' },
      { key: 'emergency_full_name', label: 'Contacto de emergencia' },
      { key: 'emergency_phone', label: 'Teléfono de emergencia' },
      { key: 'emergency_relationship', label: 'Relación de emergencia' },
      { key: 'religion', label: 'Religión' },
      { key: 'religion_other', label: 'Otra religión' },
      { key: 'church_name', label: 'Parroquia' },
      { key: 'family_information', label: 'Información familiar' },
    ];

    baseFields.forEach(({ key, label }) => {
      if (this.areValuesDifferent(before[key], after[key])) {
        changedFields.push({
          label,
          previous_value: this.formatHistoryValue(before[key]),
          next_value: this.formatHistoryValue(after[key]),
        });
      }
    });

    (['she', 'he'] as const).forEach(personKey => {
      const personLabel = personKey === 'she' ? 'Novia' : 'Novio';

      coupleFields.forEach(({ key, label }) => {
        if (this.areValuesDifferent(before[personKey]?.[key], after[personKey]?.[key])) {
          changedFields.push({
            label: `${personLabel}: ${label}`,
            previous_value: this.formatHistoryValue(before[personKey]?.[key]),
            next_value: this.formatHistoryValue(after[personKey]?.[key]),
          });
        }
      });
    });

    return changedFields.filter((change, index, array) => array.findIndex(item => item.label === change.label) === index);
  }

  private buildHistoryPayload(args: {
    requestId: string;
    action: RequestAction;
    retreat?: RetreatClass | null;
    sourceRetreat?: RetreatClass | null;
    targetRetreat?: RetreatClass | null;
    collectionState: 'request' | 'requests-archived';
    changes?: RequestHistoryChangeI[];
    message?: string;
  }) {
    const retreat = args.targetRetreat ?? args.retreat ?? args.sourceRetreat;

    return {
      request_id: args.requestId,
      action: args.action,
      happened_at: serverTimestamp(),
      retreat_id: retreat?.id || '',
      collection_state: args.collectionState,
      ...(args.sourceRetreat?.id ? { source_retreat_id: args.sourceRetreat.id } : {}),
      ...(args.targetRetreat?.id ? { target_retreat_id: args.targetRetreat.id } : {}),
      ...(args.changes?.length ? { changes: args.changes } : {}),
      ...(args.message ? { message: args.message } : {}),
      ...(this.getRetreatLabel(retreat) ? { retreat_label: this.getRetreatLabel(retreat) } : {}),
      ...(this.getRetreatLabel(args.sourceRetreat) ? { source_retreat_label: this.getRetreatLabel(args.sourceRetreat) } : {}),
      ...(this.getRetreatLabel(args.targetRetreat) ? { target_retreat_label: this.getRetreatLabel(args.targetRetreat) } : {}),
    };
  }

  private async createHistoryEntry(
    userId: string,
    args: {
      requestId: string;
      action: RequestAction;
      retreat?: RetreatClass | null;
      sourceRetreat?: RetreatClass | null;
      targetRetreat?: RetreatClass | null;
      collectionState: 'request' | 'requests-archived';
      changes?: RequestHistoryChangeI[];
      message?: string;
    }
  ): Promise<void> {
    await addDoc(this.getHistoryCollectionRef(userId), this.buildHistoryPayload(args));
  }

  private setHistoryEntryInBatch(
    batch: ReturnType<typeof writeBatch>,
    userId: string,
    args: {
      requestId: string;
      action: RequestAction;
      retreat?: RetreatClass | null;
      sourceRetreat?: RetreatClass | null;
      targetRetreat?: RetreatClass | null;
      collectionState: 'request' | 'requests-archived';
      changes?: RequestHistoryChangeI[];
      message?: string;
    }
  ): void {
    const historyDocRef = doc(this.getHistoryCollectionRef(userId));
    batch.set(historyDocRef, this.buildHistoryPayload(args));
  }

  private buildArchivedRequestPayload(request: RequestClass, retreatId: string, action: RequestAction) {
    const { archived_retreat_id, archived_at, ...requestData } = request.toFirestoreDocument() as Record<string, any>;

    return {
      ...requestData,
      retreat: retreatId,
      action,
      archived_retreat_id: retreatId,
      archived_at: serverTimestamp(),
    };
  }

  private buildActiveRequestPayload(request: RequestClass, retreatId: string, action: RequestAction) {
    const { archived_retreat_id, archived_at, ...requestData } = request.toFirestoreDocument() as Record<string, any>;

    return {
      ...requestData,
      retreat: retreatId,
      action,
    };
  }

  /**
   * Obtiene todos los retiros por retiro
   */
  async getAll(args: { onlyActive?: boolean } = {}): Promise<RequestClass[]> {
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
  private async fetchAllRequests(args: { onlyActive?: boolean } = {}): Promise<RequestClass[]> {
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

      const retreatList = requests.map(retreat => new RequestClass(retreat));

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
  async getRequestById(id: string): Promise<RequestClass | null> {
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
      return retreat ? new RequestClass(retreat) : null;
    }

    return this.processGetRequest(id, 'id');
  }

  /**
   * Procesa la obtención de un retiro
   */
  private processGetRequest(value: string, by: string): Promise<RequestClass | null> {
    return new Promise<RequestClass | null>((resolve, reject) => {
      this._getOne({ find_by: by, find_value: value })
        .then(retreat => {
          const retreatObj = retreat ? new RequestClass(retreat) : null;
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
  async createRequest(args: { payload: RequestI; refString: string }): Promise<RequestI> {
    const { payload, refString } = args;

    try {
      const requestPayload = {
        ...payload,
        action: RequestAction.NEW,
      };

      console.log('requestPayload ', requestPayload);

      const result = await this._createOne({ refString, data: requestPayload });
      const userId = this.parseUserIdFromRefString(refString);

      // Actualizar observable
      this.updateRequestInCache(result, 'create');

      if (userId) {
        await this.createHistoryEntry(userId, {
          requestId: result.id,
          action: RequestAction.NEW,
          collectionState: 'request',
          message: 'Solicitud creada',
        });
      }

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
  async updateRequest(request: Partial<RequestI>, retreat: RetreatClass, options: UpdateRequestOptions = {}): Promise<RequestI> {
    if (!request.id) {
      throw new Error('ID de solicitud requerido para actualización');
    }

    try {
      const currentUser = this.authService.current_user();
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado');
      }

      const requestPayload = {
        ...request,
        ...(options.trackAsEdited ? { action: RequestAction.UPDATED } : {}),
      };

      const result = await this._updateOne({
        refString: `${retreat.completeRefString()}/request/${request.id}`,
        find_value: request.id,
        data: requestPayload,
      });

      // Actualizar observable
      this.updateRequestInCache(result, 'update');

      if (options.trackAsEdited) {
        const changes = options.previousRequest ? this.getChangedFields(options.previousRequest, result) : [];

        await this.createHistoryEntry(currentUser.id, {
          requestId: result.id,
          action: RequestAction.UPDATED,
          retreat,
          collectionState: 'request',
          changes,
          message: changes.length > 0 ? 'Solicitud actualizada' : 'Solicitud editada sin cambios detectados',
        });
      }

      return result;
    } catch (error) {
      console.error('Error al actualizar retiro:', error);
      Ss.toastService.error({ message: 'Error al actualizar el retiro', title: 'Error' });
      throw error;
    }
  }

  async archiveRequest(args: { request: RequestClass; retreat: RetreatClass }): Promise<void> {
    const { request, retreat } = args;
    const currentUser = this.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    const archivePayload = this.buildArchivedRequestPayload(request, retreat.id, RequestAction.ARCHIVED);

    const archivedRequestRef = doc(this.firestore, `user/${currentUser.id}/${this.archivedCollectionName}/${request.id}`);
    const requestRef = doc(this.firestore, `${retreat.completeRefString()}/request/${request.id}`);
    const retreatRef = doc(this.firestore, retreat.completeRefString());
    const batch = writeBatch(this.firestore);

    try {
      batch.set(archivedRequestRef, archivePayload);
      batch.delete(requestRef);
      batch.update(retreatRef, {
        request_count: increment(-1),
      });
      this.setHistoryEntryInBatch(batch, currentUser.id, {
        requestId: request.id,
        action: RequestAction.ARCHIVED,
        retreat,
        collectionState: 'requests-archived',
        message: 'Solicitud archivada',
      });
      await batch.commit();

      this.removeRequestFromCache(request.id);
      retreat.request_count = Math.max((retreat.request_count || 0) - 1, 0);
      request.action = RequestAction.ARCHIVED;
      request.archived_retreat_id = retreat.id;
      request.archived_at = new Date();

      Ss.toastService.success({
        message: 'Solicitud archivada correctamente',
        title: 'Éxito',
      });
    } catch (error) {
      console.error('Error al archivar la solicitud:', error);
      Ss.toastService.error({
        message: 'Error al archivar la solicitud',
        title: 'Error',
      });
      throw error;
    }
  }

  async unarchiveRequest(args: { request: RequestClass; retreat: RetreatClass }): Promise<void> {
    const { request, retreat } = args;
    const currentUser = this.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    const activePayload = this.buildActiveRequestPayload(request, retreat.id, RequestAction.DESARCHIVED);
    const archivedRequestRef = doc(this.firestore, `user/${currentUser.id}/${this.archivedCollectionName}/${request.id}`);
    const activeRequestRef = doc(this.firestore, `${retreat.completeRefString()}/request/${request.id}`);
    const retreatRef = doc(this.firestore, retreat.completeRefString());
    const batch = writeBatch(this.firestore);

    try {
      batch.set(activeRequestRef, activePayload);
      batch.delete(archivedRequestRef);
      batch.update(retreatRef, {
        request_count: increment(1),
      });
      this.setHistoryEntryInBatch(batch, currentUser.id, {
        requestId: request.id,
        action: RequestAction.DESARCHIVED,
        retreat,
        collectionState: 'request',
        message: 'Solicitud desarchivada',
      });
      await batch.commit();

      retreat.request_count = (retreat.request_count || 0) + 1;

      Ss.toastService.success({
        message: 'Solicitud desarchivada correctamente',
        title: 'Éxito',
      });
    } catch (error) {
      console.error('Error al desarchivar la solicitud:', error);
      Ss.toastService.error({
        message: 'Error al desarchivar la solicitud',
        title: 'Error',
      });
      throw error;
    }
  }

  async transferRequest(args: { request: RequestClass; fromRetreat: RetreatClass; toRetreat: RetreatClass; isArchived?: boolean }): Promise<void> {
    const { request, fromRetreat, toRetreat, isArchived = false } = args;
    const currentUser = this.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    const batch = writeBatch(this.firestore);

    try {
      if (isArchived) {
        const archivedRequestRef = doc(this.firestore, `user/${currentUser.id}/${this.archivedCollectionName}/${request.id}`);
        const archivedPayload = this.buildArchivedRequestPayload(request, toRetreat.id, RequestAction.TRANSFERRED);

        batch.set(archivedRequestRef, archivedPayload);
        this.setHistoryEntryInBatch(batch, currentUser.id, {
          requestId: request.id,
          action: RequestAction.TRANSFERRED,
          sourceRetreat: fromRetreat,
          targetRetreat: toRetreat,
          collectionState: 'requests-archived',
          message: 'Solicitud archivada transferida a otro retiro',
        });
      } else {
        const sourceRequestRef = doc(this.firestore, `${fromRetreat.completeRefString()}/request/${request.id}`);
        const targetRequestRef = doc(this.firestore, `${toRetreat.completeRefString()}/request/${request.id}`);
        const sourceRetreatRef = doc(this.firestore, fromRetreat.completeRefString());
        const targetRetreatRef = doc(this.firestore, toRetreat.completeRefString());
        const activePayload = this.buildActiveRequestPayload(request, toRetreat.id, RequestAction.TRANSFERRED);

        batch.set(targetRequestRef, activePayload);
        batch.delete(sourceRequestRef);
        batch.update(sourceRetreatRef, {
          request_count: increment(-1),
        });
        batch.update(targetRetreatRef, {
          request_count: increment(1),
        });
        this.setHistoryEntryInBatch(batch, currentUser.id, {
          requestId: request.id,
          action: RequestAction.TRANSFERRED,
          sourceRetreat: fromRetreat,
          targetRetreat: toRetreat,
          collectionState: 'request',
          message: 'Solicitud transferida a otro retiro',
        });
      }

      await batch.commit();

      if (!isArchived) {
        this.removeRequestFromCache(request.id);
        fromRetreat.request_count = Math.max((fromRetreat.request_count || 0) - 1, 0);
        toRetreat.request_count = (toRetreat.request_count || 0) + 1;
      }

      request.retreat = toRetreat.id;
      request.archived_retreat_id = isArchived ? toRetreat.id : '';
      request.archived_at = isArchived ? request.archived_at : null;
      request.action = RequestAction.TRANSFERRED;

      Ss.toastService.success({
        message: 'Solicitud transferida correctamente',
        title: 'Éxito',
      });
    } catch (error) {
      console.error('Error al transferir la solicitud:', error);
      Ss.toastService.error({
        message: 'Error al transferir la solicitud',
        title: 'Error',
      });
      throw error;
    }
  }

  async getArchivedRequests(args: { retreatId?: string } = {}): Promise<RequestClass[]> {
    const currentUser = this.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const archivedRequestsRef = collection(this.firestore, `user/${currentUser.id}/${this.archivedCollectionName}`);
      const constraints = [];

      if (args.retreatId) {
        constraints.push(where('archived_retreat_id', '==', args.retreatId));
      }

      const archivedRequestsQuery = query(archivedRequestsRef, ...constraints);
      const archivedRequestsSnapshot = await getDocs(archivedRequestsQuery);

      return archivedRequestsSnapshot.docs
        .map(
          archivedRequestDoc =>
            new RequestClass({
              id: archivedRequestDoc.id,
              ...(archivedRequestDoc.data() as Omit<RequestI, 'id'>),
            })
        )
        .sort((a, b) => new Date(b.archived_at || 0).getTime() - new Date(a.archived_at || 0).getTime());
    } catch (error) {
      console.error('Error al obtener solicitudes archivadas:', error);
      Ss.toastService.error({
        message: 'Error al cargar las solicitudes archivadas',
        title: 'Error',
      });
      throw error;
    }
  }

  async getRequestHistory(requestId: string): Promise<RequestHistoryI[]> {
    const currentUser = this.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const historyQuery = query(this.getHistoryCollectionRef(currentUser.id), where('request_id', '==', requestId));
      const historySnapshot = await getDocs(historyQuery);

      return historySnapshot.docs
        .map(historyDoc => {
          const data = historyDoc.data() as Omit<RequestHistoryI, 'id' | 'happened_at'> & { happened_at?: any };

          return {
            id: historyDoc.id,
            ...data,
            happened_at: data.happened_at ? fun.convertFirebaseTimestamp(data.happened_at) : null,
          } as RequestHistoryI;
        })
        .sort((a, b) => new Date(b.happened_at || 0).getTime() - new Date(a.happened_at || 0).getTime());
    } catch (error) {
      console.error('Error al obtener historial de la solicitud:', error);
      Ss.toastService.error({
        message: 'Error al cargar el historial de la solicitud',
        title: 'Error',
      });
      throw error;
    }
  }

  /**
   * Cambia el estado de un retiro
   */
  async toggleRequeststatus(retreat: RequestClass): Promise<RequestI> {
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
      this.removeRequestFromCache(id);

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
    const requestInstance = new RequestClass(requestData);
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
  private removeRequestFromCache(id: string): void {
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
