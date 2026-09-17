import { ChangeDetectorRef, Component, inject, Injector, isDevMode, NgZone, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Ss } from '@core/services/singleton.service';
import { LoadingComponent } from '@core/components/loading-component/loading-component';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '@core/services/auth.service';
import { Firestore } from '@angular/fire/firestore';
import { ToastService } from '@core/services/toast.service';
import { CopyToClipboardService } from '@core/services/copy-to-clipboard.service';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { FileService } from '@core/entities/file/file.service';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';
import { buildVersion } from '../environments/build-version';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, LoadingComponent, ToastModule, ConfirmDialogModule, DialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = 'ECN Platform';
  protected readonly isReady = signal(false);
  protected readonly updateDialogVisible = signal(false);
  protected readonly updateInProgress = signal(false);
  protected readonly updateError = signal('');
  protected readonly toastBreakpoints = {
    '768px': {
      width: 'calc(100vw - 1rem)',
      right: '0.5rem',
      left: '0.5rem',
      transform: 'none',
    },
    '480px': {
      width: 'calc(100vw - 0.75rem)',
      right: '0.375rem',
      left: '0.375rem',
      transform: 'none',
    },
  };

  private readonly cdRef = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly authService = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private readonly toastService = inject(ToastService);
  private readonly copyToClipboardService = inject(CopyToClipboardService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly injector = inject(Injector);
  private readonly dialogService = inject(DialogService);
  private readonly fileService = inject(FileService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly router = inject(Router);
  private updateReady = false;
  private updatePromptDismissed = false;
  private pendingDeployment: string | null = null;
  private updateCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly updateSubscriptions = new Subscription();
  private readonly checkOnReturn = (): void => {
    if (document.visibilityState === 'hidden') return;
    this.startUpdateTimer();
    void this.checkForUpdate();
    this.handleReadyUpdate();
  };
  private startUpdateTimer(): void {
    this.updateCheckTimer ??= setInterval(() => { void this.checkForUpdate(); }, 5 * 60 * 1000);
  }
  private readonly stopUpdateTimer = (): void => {
    if (this.updateCheckTimer !== null) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }
  };

  ngOnInit(): void {
    this.initializeApp();
    this.watchAppUpdates();
  }

  ngOnDestroy(): void {
    this.stopUpdateTimer();
    this.updateSubscriptions.unsubscribe();
    window.removeEventListener('pageshow', this.checkOnReturn);
    window.removeEventListener('focus', this.checkOnReturn);
    window.removeEventListener('online', this.checkOnReturn);
    document.removeEventListener('visibilitychange', this.checkOnReturn);
    window.removeEventListener('pagehide', this.stopUpdateTimer);
  }

  protected reloadForUpdate(): void {
    if (this.updateInProgress()) {
      return;
    }

    this.updateInProgress.set(true);
    this.updateError.set('');
    this.updateDialogVisible.set(false);
    // VERSION_READY significa que Angular ya descargó y validó el deploy.
    // Recargar el documento permite que shell y chunks se resuelvan juntos.
    window.location.reload();
  }

  protected dismissUpdateDialog(): void {
    if (this.updateInProgress()) return;
    this.updatePromptDismissed = true;
    this.updateDialogVisible.set(false);
  }

  private async initializeApp(): Promise<void> {
    try {
      await this.initializeSingletonServices();

      // El AuthService ahora maneja automáticamente la verificación de usuarios
      // Solo necesitamos esperar a que termine de inicializar
      while (this.authService.isLoading()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.isReady.set(true);
      this.cdRef.detectChanges();
      this.handleReadyUpdate();
    } catch (error) {
      console.error('❌ [App] Error durante la inicialización:', error);
      // Aún marcar como lista para que la app funcione
      this.isReady.set(true);
      this.cdRef.detectChanges();
    }
  }

  private async initializeSingletonServices(): Promise<void> {
    // Inicializar servicios singleton inmediatamente
    Ss.ngZone = this.ngZone;
    Ss.firestore = this.firestore;
    Ss.toastService = this.toastService;
    Ss.copyToClipboardService = this.copyToClipboardService;
    Ss.authService = this.authService;
    Ss.confirmationService = this.confirmationService;
    Ss.injector = this.injector;
    Ss.dialogService = this.dialogService;
    Ss.fileService = this.fileService;
    Ss.cdRef = this.cdRef;

    // Delay mínimo para asegurar que Firebase esté listo
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private watchAppUpdates(): void {
    if (isDevMode()) {
      return;
    }

    this.updateSubscriptions.add(this.swUpdate.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        if (event.latestVersion.hash !== this.pendingDeployment) {
          this.pendingDeployment = event.latestVersion.hash;
          this.updatePromptDismissed = false;
          this.updateError.set('');
        }
        this.updateReady = true;
        this.handleReadyUpdate();
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('No se pudo preparar la nueva versión', event);
      }
    }));

    this.updateSubscriptions.add(this.swUpdate.unrecoverable.subscribe(() => {
      console.warn('La versión activa no se puede recuperar; se recargará la aplicación.');
      window.location.reload();
    }));

    this.updateSubscriptions.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.handleReadyUpdate();
      void this.checkForUpdate();
    }));

    window.addEventListener('pageshow', this.checkOnReturn);
    window.addEventListener('focus', this.checkOnReturn);
    window.addEventListener('online', this.checkOnReturn);
    document.addEventListener('visibilitychange', this.checkOnReturn);
    window.addEventListener('pagehide', this.stopUpdateTimer);
    this.startUpdateTimer();
    void this.checkForUpdate();
  }

  private async checkForUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;
    try {
      try {
        await this.checkPublishedVersion();
      } catch (error) {
        console.warn('No se pudo consultar el número de versión publicado', error);
      }
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.warn('No se pudo comprobar la actualización', error);
    }
  }

  private async checkPublishedVersion(): Promise<void> {
    const url = new URL('version.json', document.baseURI);
    url.searchParams.set('t', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const published = await response.json() as { label?: unknown };
    if (typeof published.label === 'string' && published.label !== buildVersion.label) {
      console.info(`Nueva versión publicada: ${published.label}. Versión activa: ${buildVersion.label}.`);
    }
  }

  private handleReadyUpdate(): void {
    if (!this.updateReady) return;
    if (this.authService.isLoading()) return;
    if (this.isFormRoute() || this.authService.isAuthenticated() !== true) {
      this.reloadForUpdate();
      return;
    }
    if (this.updatePromptDismissed) return;
    this.updateDialogVisible.set(true);
    this.cdRef.markForCheck();
  }

  private isFormRoute(): boolean {
    const path = this.router.url === '/' ? window.location.pathname : this.router.url;
    return path.startsWith('/formulario');
  }
}
