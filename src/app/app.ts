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
import { filter, firstValueFrom, from, Subscription, timeout } from 'rxjs';
import { AppUpdateMonitor } from '@core/services/app-update-monitor';

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
  private pendingUpdate = false;
  private updatePromptDismissed = false;
  private pendingDeployment: string | null = null;
  private readonly updateSubscriptions = new Subscription();
  private readonly updateMonitor = new AppUpdateMonitor({
    available: version => {
      if (version !== this.pendingDeployment) {
        this.pendingDeployment = version;
        this.updatePromptDismissed = false;
        this.updateError.set('');
      }
      this.pendingUpdate = true;
      if (this.isFormRoute()) {
        void this.reloadForUpdate(true);
      } else {
        this.showUpdateDialogIfAllowed();
      }
    },
    current: () => {
      if (this.pendingDeployment) {
        this.updateMonitor.markApproved(this.pendingDeployment);
      }
      this.pendingUpdate = false;
      this.pendingDeployment = null;
      this.showUpdateDialogIfAllowed();
    },
  });

  ngOnInit(): void {
    this.initializeApp();
    this.watchAppUpdates();
  }

  ngOnDestroy(): void {
    this.updateMonitor.stop();
    this.updateSubscriptions.unsubscribe();
  }

  protected async reloadForUpdate(automatic = false): Promise<void> {
    if ((!automatic && this.isFormRoute()) || this.updateInProgress()) {
      return;
    }

    this.updateInProgress.set(true);
    this.updateError.set('');
    this.updateMonitor.stop();
    try {
      // El paquete completo puede tardar más de 15 segundos en conexiones móviles.
      const downloaded = await firstValueFrom(from(this.swUpdate.checkForUpdate()).pipe(timeout(120000)));
      if (!downloaded) {
        throw new Error('La versión disponible no pudo descargarse completamente.');
      }

      const activated = await firstValueFrom(from(this.swUpdate.activateUpdate()).pipe(timeout(15000)));
      if (!activated) {
        throw new Error('La versión descargada no pudo activarse.');
      }

      // Ocultar el diálogo antes de navegar evita que quede visible si el navegador
      // tarda un instante en reemplazar el documento actual.
      this.pendingUpdate = false;
      this.pendingDeployment = null;
      this.updateDialogVisible.set(false);
      this.cdRef.detectChanges();
      window.location.replace(window.location.href);
    } catch (error) {
      console.warn('No se pudo descargar y activar la nueva versión', error);
      this.updateError.set('No se pudo completar la actualización. Comprueba tu conexión y vuelve a intentarlo.');
      this.updateMonitor.start();
    } finally {
      this.updateInProgress.set(false);
    }
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
      if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('No se pudo descargar la nueva versión para uso sin conexión', event.error);
      }
    }));

    this.updateSubscriptions.add(this.swUpdate.unrecoverable.subscribe(() => {
      if (this.isFormRoute()) {
        return;
      }

      this.updateDialogVisible.set(true);
    }));

    this.updateSubscriptions.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      if (this.isFormRoute() && this.pendingUpdate) {
        void this.reloadForUpdate(true);
      } else {
        this.showUpdateDialogIfAllowed();
      }
      void this.updateMonitor.check();
    }));
    this.updateMonitor.start();
  }

  private showUpdateDialogIfAllowed(): void {
    if (!this.pendingUpdate || this.updatePromptDismissed || this.isFormRoute()) {
      this.updateDialogVisible.set(false);
      return;
    }

    this.updateDialogVisible.set(true);
    this.cdRef.markForCheck();
  }

  private isFormRoute(): boolean {
    const path = this.router.url === '/' ? window.location.pathname : this.router.url;
    return path.startsWith('/formulario');
  }
}
