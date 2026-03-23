import { Injectable, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { Messaging, deleteToken, getToken, isSupported, onMessage } from '@angular/fire/messaging';
import { UserC } from '@core/entities/user/user.class';
import { environment } from 'environments/environment';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class MessagingService {
  private readonly tokenStorageKey = 'ecn_web_push_token';
  private readonly swUrl = '/firebase-messaging-sw.js';
  private readonly swScope = '/firebase-cloud-messaging-push-scope';

  private firestore = inject(Firestore);
  private messaging = inject(Messaging);
  private toastService = inject(ToastService);

  private foregroundListenerRegistered = false;
  private permissionWatcherRegistered = false;

  async syncTokenOnLogin(user: UserC | null): Promise<void> {
    if (!user) {
      return;
    }

    if (!(await this.canUseMessaging())) {
      return;
    }

    this.registerForegroundListener();
    this.watchPermissionChanges(user);

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
  }

  async unregisterCurrentToken(user: UserC | null): Promise<void> {
    if (!user) {
      return;
    }

    const storedToken = localStorage.getItem(this.tokenStorageKey);

    if (storedToken) {
      await this.deleteTokenDocument(user.id, storedToken);
      localStorage.removeItem(this.tokenStorageKey);
    }

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
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
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

    const tokenCollection = collection(this.firestore, `user/${user.id}/push_token`);
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
  }

  private async removeStoredTokenForUser(userId: string): Promise<void> {
    const storedToken = localStorage.getItem(this.tokenStorageKey);

    if (!storedToken) {
      return;
    }

    await this.deleteTokenDocument(userId, storedToken);
    localStorage.removeItem(this.tokenStorageKey);

    try {
      await deleteToken(this.messaging);
    } catch (error) {
      console.warn('No se pudo revocar el token almacenado', error);
    }
  }

  private async deleteTokenDocument(userId: string, token: string): Promise<void> {
    const tokenCollection = collection(this.firestore, `user/${userId}/push_token`);
    const snapshot = await getDocs(query(tokenCollection, where('token', '==', token)));

    await Promise.all(snapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref)));
  }
}
