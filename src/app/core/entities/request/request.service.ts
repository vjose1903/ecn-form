import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { NewPreRetreatPaymentI, PreRetreatPaymentI, RequestAction, RequestHistoryChangeI, RequestHistoryI, RequestI } from './request.model';
import { RequestClass } from './request.class';
import { UserService } from '../user/user.service';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { RetreatClass } from '../retreat/retreat.class';
import { addDoc, Timestamp, Firestore, collection, doc, getDocs, increment, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from '@angular/fire/firestore';
import { deleteObject, getBlob, ref, Storage, uploadBytes } from '@angular/fire/storage';
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
  private storage = inject(Storage);

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

  async updatePreRetreatRequest(request: Partial<RequestI>, retreat: RetreatClass, isArchived = false): Promise<RequestI> {
    const userId = this.assertRetreatOwner(retreat);
    if (!request.id || !userId) {
      throw new Error('Solicitud o usuario no disponible');
    }

    const collectionState = isArchived ? 'requests-archived' : 'request';
    const requestRef = doc(this.firestore, isArchived
      ? `${this.userService.collectionName}/${userId}/${collectionState}/${request.id}`
      : `${retreat.completeRefString()}/request/${request.id}`);

    const result = await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists()) throw new Error('La solicitud no existe');
      const previous = snapshot.data() as RequestI;
      const payload = { ...request };
      if (payload.pre_retreat_payments) {
        payload.pre_retreat_payments = [
          ...(previous.pre_retreat_payments ?? []),
          ...payload.pre_retreat_payments.filter(payment => !previous.pre_retreat_payments?.some(existing => existing.id === payment.id)),
        ];
      }
      const next = { ...previous, ...payload, id: request.id! };
      transaction.update(requestRef, payload);

      const record = (message: string, changes: RequestHistoryChangeI[], receipt?: PreRetreatPaymentI) => {
        transaction.set(doc(this.getHistoryCollectionRef(userId)), this.buildHistoryPayload({
          requestId: next.id,
          action: RequestAction.UPDATED,
          retreat,
          collectionState,
          message,
          changes,
          ...(receipt ? { receipt_path: receipt.receipt_path, receipt_name: receipt.receipt_name, payment_id: receipt.id } : {}),
        }));
      };

      if (request.is_informado !== undefined && request.is_informado !== (previous.is_informado ?? false)) {
        record(request.is_informado ? 'Pareja marcada como informada' : 'Pareja marcada como no informada', [{
          label: 'Estado de información',
          previous_value: previous.is_informado ? 'Informada' : 'Sin informar',
          next_value: request.is_informado ? 'Informada' : 'Sin informar',
        }]);
      }

      for (const payment of request.pre_retreat_payments ?? []) {
        if (previous.pre_retreat_payments?.some(existing => existing.id === payment.id)) continue;
        record('Pago de pre retiro registrado', [
          { label: 'Monto', previous_value: '', next_value: String(payment.amount) },
          { label: 'Fecha del pago', previous_value: '', next_value: this.formatHistoryValue(payment.payment_date) },
          { label: 'Recibo', previous_value: '', next_value: payment.receipt_name },
        ], payment);
      }

      return next;
    });

    if (!isArchived) this.updateRequestInCache(result, 'update');
    return result;
  }

  async addPreRetreatPayment(args: {
    request: RequestClass;
    retreat: RetreatClass;
    payment: NewPreRetreatPaymentI;
    isArchived?: boolean;
  }): Promise<RequestI> {
    const { request, retreat, payment, isArchived = false } = args;
    const userId = this.assertRetreatOwner(retreat);
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

    const safeName = payment.receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const receiptPath = `user/${userId}/retreat/${retreat.id}/request/${request.id}/pre-retreat-payments/${crypto.randomUUID()}-${safeName}`;
    const storageRef = ref(this.storage, receiptPath);

    try {
      await uploadBytes(storageRef, payment.receipt);
      const paymentRecord: PreRetreatPaymentI = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payment_date: paymentDate,
        amount: payment.amount,
        receipt_path: receiptPath,
        receipt_name: payment.receipt.name,
      };

      return await this.updatePreRetreatRequest(
        {
          id: request.id,
          pre_retreat_payments: [...request.pre_retreat_payments, paymentRecord],
        },
        retreat,
        isArchived
      );
    } catch (error) {
      await deleteObject(storageRef).catch(() => undefined);
      throw error;
    }
  }

  async removeHistoryEvent(args: {
    request: RequestClass;
    retreat?: RetreatClass | null;
    event: RequestHistoryI;
    isArchived?: boolean;
  }): Promise<{ request: RequestI; deleted: boolean }> {
    const { request, retreat, event, isArchived = false } = args;
    const userId = this.authService.current_user()?.id;
    if (!request.id || !userId) throw new Error('Solicitud o usuario no disponible');
    if (!isArchived && !retreat) throw new Error('No se encontró el retiro de la solicitud');
    if (retreat && retreat.user_id !== userId) throw new Error('Solo el dueño del retiro puede modificar sus pagos');

    const requestRef = isArchived
      ? doc(this.firestore, `${this.userService.collectionName}/${userId}/${this.archivedCollectionName}/${request.id}`)
      : doc(this.firestore, `${retreat!.completeRefString()}/request/${request.id}`);
    const historyRef = doc(this.getHistoryCollectionRef(userId), event.id);
    const requestHistoryQuery = query(this.getHistoryCollectionRef(userId), where('request_id', '==', request.id));

    const result = await runTransaction(this.firestore, async transaction => {
      const requestHistoryQuerySnapshot = await getDocs(requestHistoryQuery);
      const [requestSnapshot, historySnapshot, ...requestHistorySnapshots] = await Promise.all([
        transaction.get(requestRef), transaction.get(historyRef),
        ...requestHistoryQuerySnapshot.docs.map(item => transaction.get(item.ref)),
      ]);
      if (!requestSnapshot.exists() || !historySnapshot.exists()) throw new Error('El movimiento ya no está disponible');

      const current = requestSnapshot.data() as RequestI;
      const history = historySnapshot.data() as RequestHistoryI;
      if (history.request_id !== request.id) throw new Error('El movimiento no pertenece a esta solicitud');
      if (history.collection_state !== (isArchived ? 'requests-archived' : 'request')) throw new Error('El movimiento pertenece a otro estado de solicitud');

      if (history.message === 'Pareja marcada como informada') {
        if (!current.is_informado) throw new Error('La pareja ya no está marcada como informada');
        const latestInformationEvent = requestHistorySnapshots
          .filter(item => item.exists())
          .map(item => {
            const data = item.data()!;
            return { id: item.id, ...data, happened_at: fun.convertFirebaseTimestamp(data['happened_at']) } as RequestHistoryI;
          })
          .filter(item => item.message === 'Pareja marcada como informada' || item.message === 'Pareja marcada como no informada')
          .sort((left, right) => this.historyTime(right.happened_at) - this.historyTime(left.happened_at))[0];
        if (latestInformationEvent?.id !== event.id || latestInformationEvent.message !== 'Pareja marcada como informada') {
          throw new Error('Solo se puede revertir el movimiento de información más reciente');
        }
        transaction.update(requestRef, { is_informado: false });
        transaction.delete(historyRef);
        return { request: { ...current, id: request.id, is_informado: false }, receiptPath: '', paymentId: '', pending: false };
      }

      if (history.message !== 'Pago de pre retiro registrado') throw new Error('Este movimiento no se puede revertir');
      const changes = (history.changes ?? []).filter((change): change is RequestHistoryChangeI => typeof change !== 'string');
      const value = (label: string) => changes.find(change => change.label === label)?.next_value ?? '';
      const payments = current.pre_retreat_payments ?? [];
      const paymentId = history.payment_id || event.payment_id;
      const receiptPath = history.receipt_path || event.receipt_path;
      const receiptUrl = history.receipt_url || event.receipt_url;
      let payment = payments.find(item => Boolean(paymentId) && item.id === paymentId)
        ?? payments.find(item => Boolean(receiptPath) && item.receipt_path === receiptPath)
        ?? payments.find(item => Boolean(receiptUrl) && item.receipt_url === receiptUrl);
      if (!payment) {
        const matches = payments.filter(item => item.receipt_name === value('Recibo') && String(item.amount) === value('Monto') && this.formatHistoryValue(item.payment_date) === value('Fecha del pago'));
        if (matches.length !== 1) throw new Error('No se pudo identificar de forma única el pago asociado a este movimiento');
        payment = matches[0];
      }
      const resolvedPath = payment.receipt_path || (payment.receipt_url ? ref(this.storage, payment.receipt_url).fullPath : '');
      if (resolvedPath) {
        transaction.update(historyRef, { deletion_pending: true });
        return { request: { ...current, id: request.id }, receiptPath: resolvedPath, paymentId: payment.id, pending: true };
      }

      const next = { ...current, pre_retreat_payments: payments.filter(item => item.id !== payment.id) };
      transaction.update(requestRef, { pre_retreat_payments: next.pre_retreat_payments ?? [] });
      transaction.delete(historyRef);
      return { request: { ...next, id: request.id }, receiptPath: '', paymentId: payment.id, pending: false };
    });

    if (!result.pending) {
      if (!isArchived) this.updateRequestInCache(result.request, 'update');
      return { request: result.request, deleted: true };
    }

    try {
      await deleteObject(ref(this.storage, result.receiptPath));
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'storage/object-not-found')) {
        console.error('No se pudo eliminar el recibo del pago:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
        return { request, deleted: false };
      }
    }

    const updatedRequest = await runTransaction(this.firestore, async transaction => {
      const [requestSnapshot, historySnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(historyRef)]);
      if (!requestSnapshot.exists()) throw new Error('La solicitud ya no está disponible');
      const current = requestSnapshot.data() as RequestI;
      if (!historySnapshot.exists()) return { ...current, id: request.id };
      const history = historySnapshot.data() as RequestHistoryI;
      if (history.request_id !== request.id || !history.deletion_pending) throw new Error('El movimiento cambió durante la eliminación');
      const payments = current.pre_retreat_payments ?? [];
      const remainingPayments = payments.filter(payment => payment.id !== result.paymentId);
      transaction.update(requestRef, { pre_retreat_payments: remainingPayments });
      transaction.delete(historyRef);
      return { ...current, id: request.id, pre_retreat_payments: remainingPayments };
    });

    if (!isArchived) this.updateRequestInCache(updatedRequest, 'update');
    return { request: updatedRequest, deleted: true };
  }

  async loadPreRetreatReceiptPreview(receipt: Pick<PreRetreatPaymentI, 'receipt_path' | 'receipt_url'>): Promise<string> {
    const path = receipt.receipt_path || (receipt.receipt_url ? ref(this.storage, receipt.receipt_url).fullPath : '');
    if (!path) throw new Error('No se encontró la imagen del recibo');
    return URL.createObjectURL(await getBlob(ref(this.storage, path)));
  }

  private assertRetreatOwner(retreat: RetreatClass): string {
    const userId = this.authService.current_user()?.id;
    if (!userId || retreat.user_id !== userId) throw new Error('Solo el dueño del retiro puede registrar o modificar pagos');
    return userId;
  }

  private historyTime(value: RequestHistoryI['happened_at'] | Timestamp): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (value instanceof Timestamp) return value.toMillis();
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
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
    receipt_path?: string;
    receipt_name?: string;
    payment_id?: string;
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
      ...(args.receipt_path ? { receipt_path: args.receipt_path } : {}),
      ...(args.receipt_name ? { receipt_name: args.receipt_name } : {}),
      ...(args.payment_id ? { payment_id: args.payment_id } : {}),
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
        created_at: serverTimestamp(),
        is_informado: payload.is_informado ?? false,
        pre_retreat_payments: payload.pre_retreat_payments ?? [],
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
      const userId = this.authService.current_user()?.id;
      if (!userId) {
        subscriber.error(new Error('Usuario no autenticado'));
        return;
      }
      const historyQuery = query(this.getHistoryCollectionRef(userId), where('request_id', '==', requestId));
      return onSnapshot(historyQuery, snapshot => {
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

  async getRequestCreationDates(requestIds: string[]): Promise<Map<string, number>> {
    const userId = this.authService.current_user()?.id;
    if (!userId || requestIds.length === 0) return new Map();

    const batches: string[][] = [];
    for (let index = 0; index < requestIds.length; index += 30) {
      batches.push(requestIds.slice(index, index + 30));
    }

    const snapshots = await Promise.all(batches.map(ids =>
      getDocs(query(this.getHistoryCollectionRef(userId), where('request_id', 'in', ids)))
    ));
    const creationDates = new Map<string, number>();

    for (const snapshot of snapshots) {
      for (const history of snapshot.docs) {
        const data = history.data();
        if (data['message'] !== 'Solicitud creada' || data['collection_state'] !== 'request') continue;

        const requestId = data['request_id'] as string;
        const happenedAt = this.historyTime(data['happened_at'] as Timestamp | Date | string | null);
        if (happenedAt && (!creationDates.has(requestId) || happenedAt < creationDates.get(requestId)!)) {
          creationDates.set(requestId, happenedAt);
        }
      }
    }

    return creationDates;
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
