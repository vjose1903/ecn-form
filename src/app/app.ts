import { ChangeDetectorRef, Component, inject, Injector, NgZone, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, LoadingComponent, ToastModule, ConfirmDialogModule, DialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = 'ECN Platform';
  protected readonly isReady = signal(false);

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

  ngOnInit(): void {
    this.initializeApp();
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

      console.log('✅ [App] Aplicación inicializada correctamente');
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
}
