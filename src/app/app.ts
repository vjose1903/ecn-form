import { ChangeDetectorRef, Component, inject, Injector, NgZone, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
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
import { filter } from 'rxjs';

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
  private readonly updateCheckIntervalMs = 30 * 60 * 1000;
  private pendingUpdate = false;
  private updatePromptDismissed = false;
  private updateCheckInProgress = false;
  private updateCheckInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private readonly resumeHandler = (): void => {
    void this.checkForAppUpdate();
  };

  ngOnInit(): void {
    this.initializeApp();
    this.watchAppUpdates();
  }

  ngOnDestroy(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    window.removeEventListener('pageshow', this.resumeHandler);
    window.removeEventListener('focus', this.resumeHandler);
    window.removeEventListener('online', this.resumeHandler);
  }

  protected async reloadForUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
      this.pendingUpdate = false;
    } catch (error) {
      console.warn('No se pudo activar la nueva versión antes de refrescar', error);
    } finally {
      window.location.reload();
    }
  }

  protected dismissUpdateDialog(): void {
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
      void this.checkForAppUpdate();
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
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.pendingUpdate = true;
        this.updatePromptDismissed = false;
        this.showUpdateDialogIfAllowed();
      });

    this.swUpdate.unrecoverable.subscribe(() => {
      if (this.isFormRoute()) {
        return;
      }

      this.updateDialogVisible.set(true);
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.showUpdateDialogIfAllowed();
    });

    this.updateCheckInterval = setInterval(() => {
      void this.checkForAppUpdate();
    }, this.updateCheckIntervalMs);

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.resumeHandler();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pageshow', this.resumeHandler);
    window.addEventListener('focus', this.resumeHandler);
    window.addEventListener('online', this.resumeHandler);
    this.resumeHandler();
  }

  private async checkForAppUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled || this.updateCheckInProgress) {
      return;
    }

    this.updateCheckInProgress = true;
    try {
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.warn('No se pudo verificar si hay una nueva versión de la app', error);
    } finally {
      this.updateCheckInProgress = false;
    }
  }

  private showUpdateDialogIfAllowed(): void {
    if (!this.pendingUpdate || this.updatePromptDismissed || this.isFormRoute()) {
      this.updateDialogVisible.set(false);
      return;
    }

    this.updateDialogVisible.set(true);
  }

  private isFormRoute(): boolean {
    return this.router.url.startsWith('/formulario');
  }
}
