import { Injectable, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { Messaging, deleteToken, getToken, isSupported, onMessage } from '@angular/fire/messaging';
import { UserC } from '@core/entities/user/user.class';
import { environment } from 'environments/environment';
import { ToastService } from './toast.service';

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
    unregister: (tag: string) => Promise<void>;
  };
};

interface PushSyncMetadata {
  key: string;
  token: string;
  userId: string;
  email: string;
  touchUrl: string;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class MessagingService {
  private readonly tokenStorageKey = 'ecn_web_push_token';
  private readonly tokenLastSyncStorageKey = 'ecn_web_push_token_last_sync_at';
  private readonly tokenRefreshIntervalMs = 24 * 60 * 60 * 1000;
  private readonly tokenRefreshCheckIntervalMs = 60 * 60 * 1000;
  private readonly backgroundSyncDbName = 'ecn_push_sync';
  private readonly backgroundSyncStoreName = 'metadata';
  private readonly backgroundSyncMetadataKey = 'current';
  private readonly backgroundSyncTag = 'ecn-fcm-token-refresh';
  private readonly backgroundSyncMinIntervalMs = 24 * 60 * 60 * 1000;
  private readonly swUrl = '/firebase-messaging-sw.js';
  private readonly swScope = '/firebase-cloud-messaging-push-scope';
  private readonly notificationIcon = '/icons/icon-192x192.png';

  private firestore = inject(Firestore);
  private messaging = inject(Messaging);
  private toastService = inject(ToastService);

  private foregroundListenerRegistered = false;
  private permissionWatcherRegistered = false;
  private refreshListenersRegistered = false;
  private tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private activeRefreshUser: UserC | null = null;
  private syncInProgress = false;

  async syncTokenOnLogin(user: UserC | null): Promise<void> {
    if (!user) {
      return;
    }

    if (this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;

    try {
      if (!(await this.canUseMessaging())) {
        return;
      }

      this.registerForegroundListener();
      this.watchPermissionChanges(user);
      this.startTokenRefresh(user);

      if (Notification.permission === 'denied') {
        await this.removeStoredTokenForUser(user.id);
        return;
      }

      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();

      if (permission !== 'granted') {
        await this.removeStoredTokenForUser(user.id);
        return;
      }

      const serviceWorkerRegistration = await navigator.serviceWorker.register(this.swUrl, {
        scope: this.swScope,
      });

      const currentToken = await getToken(this.messaging, {
        vapidKey: environment.firebaseVapidKey,
        serviceWorkerRegistration,
      });

      if (!currentToken) {
        await this.removeStoredTokenForUser(user.id);
        return;
      }

      await this.persistToken(user, currentToken);
      await this.registerPeriodicBackgroundSync(serviceWorkerRegistration);
    } finally {
      this.syncInProgress = false;
    }
  }

  async unregisterCurrentToken(user: UserC | null): Promise<void> {
    if (!user) {
      return;
    }

    const storedToken = localStorage.getItem(this.tokenStorageKey);

    if (storedToken) {
      await this.deleteTokenDocument(user.id, storedToken);
    }

    localStorage.removeItem(this.tokenStorageKey);
    localStorage.removeItem(this.tokenLastSyncStorageKey);
    await this.clearBackgroundSyncMetadata();
    this.stopTokenRefresh();

    if (!(await this.canUseMessaging())) {
      return;
    }

    try {
      await deleteToken(this.messaging);
    } catch (error) {
      console.warn('No se pudo revocar el token de FCM', error);
    }
  }

  private async canUseMessaging(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return false;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      console.warn('FCM web requiere HTTPS o localhost.');
      return false;
    }

    try {
      return await isSupported();
    } catch {
      return false;
    }
  }

  private registerForegroundListener(): void {
    if (this.foregroundListenerRegistered) {
      return;
    }

    this.foregroundListenerRegistered = true;

    onMessage(this.messaging, payload => {
      const title = payload.notification?.title ?? 'Nueva solicitud recibida';
      const body = payload.notification?.body ?? 'Tienes una nueva solicitud para revisar.';
      const url = payload.data?.['url'] ?? '/retiros';

      this.toastService.info({
        title,
        message: body,
      });

      if (Notification.permission !== 'granted') {
        return;
      }

      const notification = new Notification(title, {
        body,
        icon: this.notificationIcon,
        data: { url },
      });

      notification.onclick = () => {
        window.focus();
        window.location.href = url;
        notification.close();
      };
    });
  }

  private async watchPermissionChanges(user: UserC): Promise<void> {
    if (this.permissionWatcherRegistered || !('permissions' in navigator) || !navigator.permissions?.query) {
      return;
    }

    try {
      const permissionStatus = await navigator.permissions.query({
        name: 'notifications' as PermissionName,
      });

      this.permissionWatcherRegistered = true;

      permissionStatus.onchange = () => {
        if (permissionStatus.state === 'granted') {
          void this.syncTokenOnLogin(user);
          return;
        }

        void this.removeStoredTokenForUser(user.id);
      };
    } catch (error) {
      console.warn('No se pudo observar cambios de permisos de notificación', error);
    }
  }

  private async persistToken(user: UserC, token: string): Promise<void> {
    const previousToken = localStorage.getItem(this.tokenStorageKey);

    if (previousToken && previousToken !== token) {
      await this.deleteTokenDocument(user.id, previousToken);
    }

    const tokenCollection = collection(this.firestore, `user/${user.id}/push_tokens`);
    const snapshot = await getDocs(query(tokenCollection, where('token', '==', token)));

    const payload = {
      token,
      userId: user.id,
      email: user.email,
      platform: 'web',
      permission: Notification.permission,
      userAgent: navigator.userAgent,
      enabled: true,
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    };

    if (snapshot.empty) {
      await addDoc(tokenCollection, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await Promise.all(
        snapshot.docs.map(docSnapshot =>
          updateDoc(docSnapshot.ref, {
            ...payload,
          })
        )
      );
    }

    localStorage.setItem(this.tokenStorageKey, token);
    localStorage.setItem(this.tokenLastSyncStorageKey, Date.now().toString());
    await this.storeBackgroundSyncMetadata(user, token);
  }

  private async removeStoredTokenForUser(userId: string): Promise<void> {
    const storedToken = localStorage.getItem(this.tokenStorageKey);

    if (!storedToken) {
      return;
    }

    await this.deleteTokenDocument(userId, storedToken);
    localStorage.removeItem(this.tokenStorageKey);
    localStorage.removeItem(this.tokenLastSyncStorageKey);
    await this.clearBackgroundSyncMetadata();

    try {
      await deleteToken(this.messaging);
    } catch (error) {
      console.warn('No se pudo revocar el token almacenado', error);
    }
  }

  private async deleteTokenDocument(userId: string, token: string): Promise<void> {
    const tokenCollection = collection(this.firestore, `user/${userId}/push_tokens`);
    const snapshot = await getDocs(query(tokenCollection, where('token', '==', token)));

    await Promise.all(snapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref)));
  }

  private startTokenRefresh(user: UserC): void {
    this.activeRefreshUser = user;

    if (!this.tokenRefreshInterval) {
      this.tokenRefreshInterval = setInterval(() => {
        void this.refreshTokenIfDue();
      }, this.tokenRefreshCheckIntervalMs);
    }

    if (this.refreshListenersRegistered) {
      return;
    }

    this.refreshListenersRegistered = true;

    window.addEventListener('focus', () => {
      void this.refreshTokenIfDue();
    });

    window.addEventListener('online', () => {
      void this.refreshTokenIfDue(true);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.refreshTokenIfDue();
      }
    });
  }

  private stopTokenRefresh(): void {
    this.activeRefreshUser = null;

    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }

  private async refreshTokenIfDue(force = false): Promise<void> {
    const user = this.activeRefreshUser;

    if (!user || Notification.permission !== 'granted') {
      return;
    }

    const lastSyncAt = Number(localStorage.getItem(this.tokenLastSyncStorageKey) || 0);
    const shouldRefresh = force || !lastSyncAt || Date.now() - lastSyncAt >= this.tokenRefreshIntervalMs;

    if (!shouldRefresh) {
      return;
    }

    await this.syncTokenOnLogin(user);
  }

  private async registerPeriodicBackgroundSync(serviceWorkerRegistration: ServiceWorkerRegistration): Promise<void> {
    try {
      const registration = serviceWorkerRegistration as PeriodicSyncRegistration;

      if (!registration.periodicSync) {
        return;
      }

      if ('permissions' in navigator && navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync' as PermissionName,
        });

        if (status.state !== 'granted') {
          return;
        }
      }

      await registration.periodicSync.register(this.backgroundSyncTag, {
        minInterval: this.backgroundSyncMinIntervalMs,
      });
    } catch (error) {
      console.warn('No se pudo registrar Periodic Background Sync para FCM', error);
    }
  }

  private async storeBackgroundSyncMetadata(user: UserC, token: string): Promise<void> {
    try {
      const db = await this.openBackgroundSyncDb();
      await this.writeBackgroundSyncValue(db, {
        key: this.backgroundSyncMetadataKey,
        token,
        userId: user.id,
        email: user.email,
        touchUrl: environment.pushTokenTouchUrl,
        updatedAt: Date.now(),
      });
      db.close();
    } catch (error) {
      console.warn('No se pudo guardar metadata local para refresco FCM en background', error);
    }
  }

  private async clearBackgroundSyncMetadata(): Promise<void> {
    try {
      const db = await this.openBackgroundSyncDb();
      await this.deleteBackgroundSyncValue(db, this.backgroundSyncMetadataKey);
      db.close();
    } catch (error) {
      console.warn('No se pudo limpiar metadata local de refresco FCM', error);
    }
  }

  private openBackgroundSyncDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.backgroundSyncDbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.backgroundSyncStoreName)) {
          db.createObjectStore(this.backgroundSyncStoreName, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private writeBackgroundSyncValue(db: IDBDatabase, value: PushSyncMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.backgroundSyncStoreName, 'readwrite');
      const store = transaction.objectStore(this.backgroundSyncStoreName);

      store.put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private deleteBackgroundSyncValue(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.backgroundSyncStoreName, 'readwrite');
      const store = transaction.objectStore(this.backgroundSyncStoreName);

      store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
