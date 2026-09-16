import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// El bypass solo se necesita para obtener el documento nuevo; no debe propagarse a las rutas.
const startupUrl = new URL(window.location.href);
if (startupUrl.searchParams.has('ngsw-bypass')) {
  startupUrl.searchParams.delete('ngsw-bypass');
  window.history.replaceState(window.history.state, '', startupUrl.href);
}

async function cleanupDevServiceWorkers(): Promise<void> {
  if (!isDevMode() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
}

cleanupDevServiceWorkers()
  .catch((err) => console.error('Error cleaning service workers in development:', err))
  .finally(() => {
    bootstrapApplication(App, appConfig).catch((err) => console.error(err));
  });
