import { ChangeDetectorRef, Component, inject, NgZone, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Ss } from '@core/services/singleton.service';
import { fun } from '@core/services/functions.service';
import { LoadingComponent } from '@core/components/loading-component/loading-component';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '@core/services/auth.service';
import { Firestore } from '@angular/fire/firestore';
import { environment } from 'environments/environment';
import { UserService } from '@core/entities/user/user.service';
import { ToastService } from '@core/services/toast.service';
import { CopyToClipboardService } from '@core/services/copy-to-clipboard.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingComponent, ToastModule],
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
  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);
  private readonly copyToClipboardService = inject(CopyToClipboardService);

  ngOnInit(): void {
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    try {
      await this.initializeSingletonServices();

      await this.checkUser();

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

    // Delay mínimo para asegurar que Firebase esté listo
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async checkUser(): Promise<void> {
    const email = localStorage.getItem(environment.X_EMAIL);
    const token = localStorage.getItem(environment.X_TOKEN);

    // Si no hay credenciales, no hacer nada
    if (!email || !token) return;

    // Si ya hay usuario autenticado, no verificar de nuevo
    if (this.authService.current_user()) {
      console.log('%c ANDO AQUIIII', 'color: red; font-weight: bold;', this.authService.current_user()?.asJson());
      return;
    }

    try {
      const user = await this.userService.getUserByEmail(email);

      console.log('%c user', 'color: red; font-weight: bold;', JSON.stringify(user));
      if (user) {
        this.authService.current_user.set(user);
      } else {
        console.warn('⚠️ [App] Usuario no encontrado, cerrando sesión');
        await this.authService.logout();
      }
    } catch (error) {
      console.error('❌ [App] Error verificando usuario:', error);
      await this.authService.logout();
      throw error;
    }
  }
}
