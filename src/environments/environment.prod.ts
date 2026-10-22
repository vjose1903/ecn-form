// Environment para producción
export const environment = {
  production: true,
  firebaseConfig: {
    apiKey: 'AIzaSyChCaLlE1a4VbuM6fLR9xcopZmJnznJTRI',
    authDomain: 'ecn-platform.firebaseapp.com',
    projectId: 'ecn-platform',
    storageBucket: 'ecn-platform.firebasestorage.app',
    messagingSenderId: '903289469777',
    appId: '1:903289469777:web:77a394522ef34ba9e33170',
  },
  firestoreDatabaseId: 'ecn-platform-v2',
  firebaseVapidKey: 'BJC-B6Vgzq25I_YTwkWNFF0W-zUd7sxeWXmuCZI2D1jMJJSpjCcFIFKklK5qHltjsBAbcAWJgPASEt4sEHhZKfo',
  pushTokenTouchUrl: 'https://us-east1-ecn-platform.cloudfunctions.net/touchPushTokenV2',
  X_TOKEN: 'X-Token',
  X_EMAIL: 'X-Email',
};
