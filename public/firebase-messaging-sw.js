/* eslint-disable no-undef */
const PUSH_SYNC_DB_NAME = 'ecn_push_sync';
const PUSH_SYNC_STORE_NAME = 'metadata';
const PUSH_SYNC_METADATA_KEY = 'current';
const PUSH_SYNC_TAG = 'ecn-fcm-token-refresh';

function openPushSyncDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_SYNC_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PUSH_SYNC_STORE_NAME)) {
        db.createObjectStore(PUSH_SYNC_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPushSyncMetadata(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PUSH_SYNC_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PUSH_SYNC_STORE_NAME);
    const request = store.get(PUSH_SYNC_METADATA_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function touchPushToken(reason) {
  let db;

  try {
    db = await openPushSyncDb();
    const metadata = await getPushSyncMetadata(db);

    if (!metadata?.token || !metadata?.userId || !metadata?.touchUrl) {
      return;
    }

    await fetch(metadata.touchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: metadata.token,
        userId: metadata.userId,
        reason,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.warn('No se pudo refrescar metadata FCM en background', error);
  } finally {
    db?.close();
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification?.data?.url || '/retiros', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && 'navigate' in client) {
          if (client.url === targetUrl) {
            return client.focus();
          }

          return client.navigate(targetUrl).then((navigatedClient) => navigatedClient?.focus());
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== PUSH_SYNC_TAG) {
    return;
  }

  event.waitUntil(touchPushToken('periodic-background-sync'));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(touchPushToken('pushsubscriptionchange'));
});

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyChCaLlE1a4VbuM6fLR9xcopZmJnznJTRI',
  authDomain: 'ecn-platform.firebaseapp.com',
  projectId: 'ecn-platform',
  storageBucket: 'ecn-platform.firebasestorage.app',
  messagingSenderId: '903289469777',
  appId: '1:903289469777:web:77a394522ef34ba9e33170',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Nueva solicitud recibida';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Tienes una nueva solicitud para revisar.',
    icon: '/icons/icon-192x192.png',
    tag: payload.data?.tag || payload.notification?.tag || 'ecn-retreat-request',
    renotify: false,
    data: {
      url: payload.data?.url || '/retiros',
      ...payload.data,
    },
  };

  self.registration.showNotification(title, options);
});
