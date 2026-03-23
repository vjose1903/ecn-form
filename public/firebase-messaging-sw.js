/* eslint-disable no-undef */
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
  const title = payload.notification?.title || 'Nueva solicitud recibida';
  const options = {
    body: payload.notification?.body || 'Tienes una nueva solicitud para revisar.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: {
      url: payload.data?.url || '/retiros',
      ...payload.data,
    },
  };

  self.registration.showNotification(title, options);
});

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
