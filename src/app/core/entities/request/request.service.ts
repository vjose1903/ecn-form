import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { NewPreRetreatPaymentI, PreRetreatPaymentI, RequestAction, RequestHistoryI, RequestI, RequestStatus } from './request.model';
import { RequestClass } from './request.class';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { RetreatClass } from '../retreat/retreat.class';
import { Timestamp, Firestore, collection, doc, getDoc, getDocs, onSnapshot, query, where } from '@angular/fire/firestore';
import { fun } from '@core/services/functions.service';
import { createRequestDocumentId } from './request-document-id';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { mergeRequestDetail } from './request-details';

interface UpdateRequestOptions {
  previousRequest?: RequestI | RequestClass;
  trackAsEdited?: boolean;
}

const REQUEST_DETAIL_SECTIONS = ['couple_basic', 'contact', 'identity', 'family', 'relationship', 'invitation', 'legacy_extra'] as const;

interface RequestFieldGroups {
  status?: Record<string, unknown>;
  is_informado?: boolean;
  readableSections: string[];
  editableSections: string[];
}

@Injectable({
  providedIn: 'root',
})
export class RequestService extends FirebaseRequest<RequestI> {
  private _collectionName = 'request';
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  private _requests: BehaviorSubject<RequestClass[]> = new BehaviorSubject<RequestClass[]>([]);
  private _loadingRequestsList: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _lastFetch: number = 0;
  private _cacheCityId = '';
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

  async getRequestsForRetreat(retreat: RetreatClass): Promise<RequestClass[]> {
    if (!retreat.city_id || !retreat.id) throw new Error('El retiro no tiene ciudad o identificador válido');
    if (!this.authService.current_user()) return [];
    const requestsRef = collection(this.firestore, `city/${retreat.city_id}/requests`);
    const snapshot = await getDocs(query(requestsRef, where('retreat_id', '==', retreat.id), where('is_archived', '==', false)));
    const fieldGroups = await this.getRequestFieldGroups(retreat.city_id, snapshot.docs.map(requestDoc => requestDoc.id));
    return Promise.all(snapshot.docs.map(requestDoc => this.hydrateV2Request(retreat.city_id, requestDoc, fieldGroups[requestDoc.id])));
  }

  private async getRequestFieldGroups(cityId: string, requestIds: string[]): Promise<Record<string, RequestFieldGroups>> {
    if (!requestIds.length) return {};
    const getGroups = httpsCallable<{cityId: string; requestIds: string[]}, Record<string, RequestFieldGroups>>(this.functions, 'getRequestFieldGroups');
    const batches = Array.from({length: Math.ceil(requestIds.length / 200)}, (_, index) => requestIds.slice(index * 200, (index + 1) * 200));
    const results = await Promise.all(batches.map(requestIds => getGroups({cityId, requestIds})));
    return Object.assign({}, ...results.map(result => result.data));
  }

  private async hydrateV2Request(cityId: string, requestDoc: {id: string; data: () => Record<string, any>}, fieldGroups: RequestFieldGroups): Promise<RequestClass> {
      const requestPath = `city/${cityId}/requests/${requestDoc.id}`;
      const root = requestDoc.data();
      const retreatId = root['retreat_id'] as string;
      const [sectionResults, paymentsSnapshot] = await Promise.all([
        Promise.all(REQUEST_DETAIL_SECTIONS
          .map(async section => {
            try {
              return await getDoc(doc(this.firestore, `${requestPath}/details/${section}`));
            } catch (error) {
              if ((error as {code?: string})?.code === 'permission-denied') return null;
              throw error;
            }
          })),
        getDocs(collection(this.firestore, `${requestPath}/payments`)),
      ]);
      const reconstructed: Record<string, any> = { id: requestDoc.id, retreat: retreatId };
      reconstructed['readableSections'] = [
        ...REQUEST_DETAIL_SECTIONS.filter((_, index) => sectionResults[index] !== null),
        ...fieldGroups.readableSections,
      ];
      reconstructed['editableSections'] = fieldGroups.editableSections;
      if (fieldGroups.status) Object.assign(reconstructed, fieldGroups.status);
      if (fieldGroups.is_informado !== undefined) reconstructed['is_informado'] = fieldGroups.is_informado;
      for (const detail of sectionResults) {
        if (!detail?.exists()) continue;
        mergeRequestDetail(reconstructed, detail.id, detail.data()!);
      }
      reconstructed['retreat'] = retreatId;
      if (root['is_archived']) {
        reconstructed['action'] = RequestAction.ARCHIVED;
        reconstructed['status'] = RequestStatus.ARCHIVED;
        reconstructed['archived_retreat_id'] = retreatId;
      }
      reconstructed['pre_retreat_payments'] = paymentsSnapshot.docs.map(payment => ({ ...payment.data(), id: payment.id }));
      return new RequestClass(reconstructed as RequestI);
  }

  async updatePreRetreatRequest(request: Partial<RequestI>, retreat: RetreatClass, isArchived = false): Promise<RequestI> {
    if (!request.id) throw new Error('Solicitud no disponible');
    return this.updateRequest(request, retreat, {trackAsEdited: true, previousRequest: this._requests.value.find(item => item.id === request.id)});
  }

  async addPreRetreatPayment(args: {
    request: RequestClass;
    retreat: RetreatClass;
    payment: NewPreRetreatPaymentI;
    isArchived?: boolean;
  }): Promise<RequestI> {
    const { request, retreat, payment, isArchived = false } = args;
    this.assertRetreatOwner(retreat);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paymentDate = new Date(payment.payment_date);
    paymentDate.setHours(0, 0, 0, 0);

    if (!request.id || !Number.isFinite(payment.amount) || payment.amount <= 0 || !payment.receipt.type.startsWith('image/') || payment.receipt.size > 5 * 1024 * 1024) {
      throw new Error('Revisa el monto y selecciona una imagen válida del recibo');
    }
    if (Number.isNaN(paymentDate.getTime())) {
      throw new Error('La fecha del pago no es válida');
    }
    if (paymentDate > today) {
      throw new Error('La fecha del pago no puede ser futura');
    }

    if (!retreat.city_id) throw new Error('El retiro no tiene ciudad asignada');
    const upload = httpsCallable(this.functions, 'createPaymentUploadUrl');
    const uploadResult = await upload({
      cityId: retreat.city_id,
      requestId: request.id,
      amount: payment.amount,
      paymentDate: paymentDate.toISOString(),
      contentType: payment.receipt.type,
      fileName: payment.receipt.name,
      fileSize: payment.receipt.size,
    });
    const {uploadUrl, receiptPath, paymentId} = uploadResult.data as {uploadUrl: string; receiptPath: string; paymentId: string};
    const response = await fetch(uploadUrl, {method: 'PUT', headers: {'Content-Type': payment.receipt.type}, body: payment.receipt});
    if (!response.ok) throw new Error('No se pudo cargar el recibo del pago');
    const record = httpsCallable(this.functions, 'recordPayment');
    await record({
      cityId: retreat.city_id,
      requestId: request.id,
      paymentId,
      receiptPath,
      receiptName: payment.receipt.name,
      paymentDate: paymentDate.toISOString(),
      amount: payment.amount,
    });
    const paymentRecord: PreRetreatPaymentI = {id: paymentId, payment_date: paymentDate, amount: payment.amount, receipt_path: receiptPath, receipt_name: payment.receipt.name};
    const updated = {...request, pre_retreat_payments: [...request.pre_retreat_payments, paymentRecord]};
    this.updateRequestInCache(updated, 'update');
    return updated;
  }

  async removeHistoryEvent(args: {
    request: RequestClass;
    retreat?: RetreatClass | null;
    event: RequestHistoryI;
    isArchived?: boolean;
  }): Promise<{ request: RequestI & {readableSections?: string[] | null; editableSections?: string[] | null}; deleted: boolean }> {
    const {request, retreat, event} = args;
    const cityId = retreat?.city_id || this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!request.id || !cityId || !event.id) throw new Error('Solicitud, ciudad o movimiento no disponible');

    const remove = httpsCallable<{
      cityId: string;
      requestId: string;
      eventId: string;
    }, {deleted: boolean; kind: 'payment' | 'information'}>(this.functions, 'deleteRequestHistoryEvent');
    const result = await remove({cityId, requestId: request.id, eventId: event.id});
    if (!result.data.deleted) return {request, deleted: false};

    const updated = {...request.asJson(), readableSections: request.readableSections, editableSections: request.editableSections};
    if (result.data.kind === 'payment') {
      updated.pre_retreat_payments = (updated.pre_retreat_payments ?? []).filter(payment => payment.id !== event.payment_id);
    } else {
      updated.is_informado = false;
    }
    this.updateRequestInCache(updated, 'update');
    return {request: updated, deleted: true};
  }

  async loadPreRetreatReceiptPreview(receipt: Pick<PreRetreatPaymentI, 'id' | 'receipt_path' | 'receipt_url'>, context: {cityId: string; requestId: string}): Promise<string> {
    if (!receipt.id || !context.cityId || !context.requestId) throw new Error('No se encontró la referencia del recibo');
    const getUrl = httpsCallable<{cityId: string; requestId: string; paymentId: string}, {url: string}>(this.functions, 'getPaymentReceiptUrl');
    const result = await getUrl({...context, paymentId: receipt.id});
    const response = await fetch(result.data.url);
    if (!response.ok) throw new Error('No se pudo descargar el recibo del pago');
    return URL.createObjectURL(await response.blob());
  }

  private assertRetreatOwner(retreat: RetreatClass): string {
    const userId = this.authService.current_user()?.id;
    if (!userId) throw new Error('Debes iniciar sesión para registrar o modificar pagos');
    return userId;
  }

  private historyTime(value: RequestHistoryI['happened_at'] | Timestamp): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (value instanceof Timestamp) return value.toMillis();
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
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

  async getAll(args: { onlyActive?: boolean } = {}): Promise<RequestClass[]> {
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId) throw new Error('Usuario no autenticado');
    const now = Date.now();
    if (this._cacheCityId !== cityId || now - this._lastFetch >= this.CACHE_DURATION) {
      this._loadingRequestsList.next(true);
      try {
        const snapshot = await getDocs(query(collection(this.firestore, `city/${cityId}/requests`), where('is_archived', '==', false)));
        const fieldGroups = await this.getRequestFieldGroups(cityId, snapshot.docs.map(item => item.id));
        this._requests.next(await Promise.all(snapshot.docs.map(item => this.hydrateV2Request(cityId, item, fieldGroups[item.id]))));
        this._cacheCityId = cityId;
        this._lastFetch = Date.now();
      } finally {
        this._loadingRequestsList.next(false);
      }
    }
    return args.onlyActive ? this._requests.value.filter(item => item.is_active) : this._requests.value;
  }

  async getRequestById(id: string): Promise<RequestClass | null> {
    if (!id) return null;
    const cached = this._requests.value.find(item => item.id === id);
    if (cached) return cached;
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId) return null;
    const snapshot = await getDoc(doc(this.firestore, `city/${cityId}/requests/${id}`));
    if (!snapshot.exists()) return null;
    const fieldGroups = await this.getRequestFieldGroups(cityId, [id]);
    return this.hydrateV2Request(cityId, snapshot, fieldGroups[id]);
  }

  async createRequest(args: { payload: RequestI; refString: string; retreat: RetreatClass }): Promise<RequestI> {
    const { payload, retreat } = args;

    try {
      if (!retreat.city_id || !retreat.id) throw new Error('El retiro no tiene ciudad o identificador válido');
      const create = httpsCallable<{cityId: string; retreatId: string; payload: RequestI}, {requestId: string}>(this.functions, 'createPublicRequest');
      const response = await create({cityId: retreat.city_id, retreatId: retreat.id, payload});
      const result = {
        ...payload,
        id: response.data.requestId,
        retreat: retreat.id,
        created_at: new Date(),
        is_informado: false,
        pre_retreat_payments: [],
        action: RequestAction.NEW,
      } as RequestI;
      this.updateRequestInCache(result, 'create');
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
      if (!retreat.city_id) throw new Error('El retiro no tiene ciudad asignada');
      const payload: Partial<RequestI> = {...request};
      if (options.previousRequest) {
        const previous = options.previousRequest instanceof RequestClass ? options.previousRequest.asJson() : options.previousRequest;
        const personGroups: Record<string, string[]> = {
          couple_basic: ['full_name', 'nickname'],
          contact: ['city_of_residence', 'address', 'home_phone', 'email', 'cell_phone', 'work_phone'],
          identity: ['age', 'identity_type', 'identity_number', 'birth_date', 'birth_date_display', 'religion', 'religion_other', 'church_name', 'are_you_married'],
          family: ['emergency_full_name', 'emergency_relationship', 'emergency_phone', 'have_children', 'family_information'],
        };
        for (const person of ['she', 'he'] as const) {
          const changedFields = [...new Set(Object.values(personGroups).flat())].filter(key => this.areValuesDifferent(previous[person]?.[key as keyof typeof previous.she], request[person]?.[key as keyof typeof request.she]));
          if (changedFields.length) (payload as Record<string, unknown>)[person] = Object.fromEntries(changedFields.map(key => [key, request[person]?.[key as keyof typeof request.she]]));
        }
        const requestFields: Array<keyof RequestI> = [
          'how_find_us', 'how_find_us_other', 'have_wedding_date', 'wedding_date', 'dating_period_year', 'dating_period_month',
          'who_invited_you', 'who_invited_you_phone', 'status', 'is_active', 'is_informado',
        ];
        for (const key of requestFields) {
          if (this.areValuesDifferent(previous[key], request[key])) (payload as Record<string, unknown>)[key] = request[key];
          else delete (payload as Record<string, unknown>)[key];
        }
      }
      const hasChanges = ['she', 'he'].some(person => Object.keys((payload as any)[person] ?? {}).length > 0)
        || ['how_find_us', 'how_find_us_other', 'have_wedding_date', 'wedding_date', 'dating_period_year', 'dating_period_month', 'who_invited_you', 'who_invited_you_phone', 'status', 'is_active', 'is_informado']
          .some(key => key in payload);
      if (!hasChanges) return {...(options.previousRequest ?? request), id: request.id} as RequestI;
      const update = httpsCallable(this.functions, 'updateRequestDetails');
      await update({cityId: retreat.city_id, requestId: request.id, patch: payload});
      const result = {...(options.previousRequest ?? {}), ...payload, id: request.id, ...(options.trackAsEdited ? {action: RequestAction.UPDATED} : {})} as RequestI;
      this.updateRequestInCache(result, 'update');

      return result;
    } catch (error) {
      console.error('Error al actualizar retiro:', error);
      Ss.toastService.error({ message: 'Error al actualizar el retiro', title: 'Error' });
      throw error;
    }
  }

  async archiveRequest(args: { request: RequestClass; retreat: RetreatClass }): Promise<void> {
    const { request, retreat } = args;
    try {
      await this.changeRequestLocation({request, retreat, action: 'archive'});
      this.removeRequestFromCache(request.id);
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
    try {
      await this.changeRequestLocation({request, retreat, action: 'unarchive'});

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
    try {
      await this.changeRequestLocation({request, retreat: fromRetreat, targetRetreat: toRetreat, action: 'transfer', isArchived});

      if (!isArchived) {
        this.removeRequestFromCache(request.id);
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

  private async changeRequestLocation(args: {request: RequestClass; retreat: RetreatClass; targetRetreat?: RetreatClass; action: 'archive' | 'unarchive' | 'transfer'; isArchived?: boolean}): Promise<void> {
    const cityId = args.retreat.city_id;
    if (!cityId || !args.request.id) throw new Error('No se encontró la ciudad o solicitud');
    const change = httpsCallable(this.functions, 'changeRequestLocation');
    await change({
      cityId,
      requestId: args.request.id,
      sourceRetreatId: args.retreat.id,
      targetRetreatId: args.targetRetreat?.id ?? args.retreat.id,
      action: args.action,
      isArchived: args.isArchived ?? false,
    });
  }

  async getArchivedRequests(args: { retreatId?: string } = {}): Promise<RequestClass[]> {
    const currentUser = this.authService.current_user();

    if (!currentUser?.city) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const cityId = this.authService.activeCityId() || currentUser.city;
      const archivedRequestsRef = collection(this.firestore, `city/${cityId}/requests`);
      const constraints: any[] = [where('is_archived', '==', true)];

      if (args.retreatId) {
        constraints.push(where('retreat_id', '==', args.retreatId));
      }

      const archivedRequestsQuery = query(archivedRequestsRef, ...constraints);
      const archivedRequestsSnapshot = await getDocs(archivedRequestsQuery);

      const fieldGroups = await this.getRequestFieldGroups(cityId, archivedRequestsSnapshot.docs.map(requestDoc => requestDoc.id));
      return Promise.all(archivedRequestsSnapshot.docs.map(requestDoc => this.hydrateV2Request(cityId, requestDoc, fieldGroups[requestDoc.id])))
        .then(requests => requests.sort((a, b) => new Date(b.archived_at || 0).getTime() - new Date(a.archived_at || 0).getTime()));
    } catch (error) {
      console.error('Error al obtener solicitudes archivadas:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message, ...('code' in error ? { code: error.code } : {}) } : error));
      Ss.toastService.error({
        message: 'Error al cargar las solicitudes archivadas',
        title: 'Error',
      });
      throw error;
    }
  }

  watchLatestRequestHistory(requestId: string): Observable<RequestHistoryI | null> {
    return new Observable(subscriber => {
      const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
      if (!cityId) {
        subscriber.error(new Error('Usuario no autenticado'));
        return;
      }
      const historyRef = collection(this.firestore, `city/${cityId}/requests/${requestId}/history`);
      return onSnapshot(historyRef, snapshot => {
        const history = snapshot.docs.map(document => {
          const data = document.data();
          return {
            ...data,
            id: document.id,
            happened_at: data['happened_at'] ? fun.convertFirebaseTimestamp(data['happened_at']) : null,
          } as RequestHistoryI;
        });
        history.sort((left, right) => this.historyTime(right.happened_at) - this.historyTime(left.happened_at));
        subscriber.next(history[0] ?? null);
      }, error => subscriber.error(error));
    });
  }

  async getRequestHistory(requestId: string): Promise<RequestHistoryI[]> {
    const currentUser = this.authService.current_user();

    if (!currentUser?.city) {
      throw new Error('Usuario no autenticado');
    }

    try {
      const cityId = this.authService.activeCityId() || currentUser.city;
      const historySnapshot = await getDocs(collection(this.firestore, `city/${cityId}/requests/${requestId}/history`));

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

  async getRequestCreationDates(requestIds: string[]): Promise<Map<string, number>> {
    const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
    if (!cityId || requestIds.length === 0) return new Map();

    const snapshots = await Promise.all(requestIds.map(requestId =>
      getDocs(collection(this.firestore, `city/${cityId}/requests/${requestId}/history`))
    ));
    const creationDates = new Map<string, number>();

    for (let index = 0; index < snapshots.length; index++) {
      for (const history of snapshots[index].docs) {
        const data = history.data();
        if (data['message'] !== 'Solicitud creada' || data['collection_state'] !== 'request') continue;

        const requestId = requestIds[index];
        const happenedAt = this.historyTime(data['happened_at'] as Timestamp | Date | string | null);
        if (happenedAt && (!creationDates.has(requestId) || happenedAt < creationDates.get(requestId)!)) {
          creationDates.set(requestId, happenedAt);
        }
      }
    }

    return creationDates;
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
    const currentRequests = this._requests.value;
    const existing = currentRequests.find(item => item.id === requestData.id);
    const requestInstance = new RequestClass({
      ...requestData,
      readableSections: existing?.readableSections ?? currentRequests[0]?.readableSections ?? [],
      editableSections: existing?.editableSections ?? currentRequests[0]?.editableSections ?? [],
    });

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
    this._requests.next([]);
    this._loadingRequestsList.next(false);
    this._lastFetch = 0;
    this._cacheCityId = '';
  }
}
