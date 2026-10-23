import { inject, Injectable, signal, runInInjectionContext, Injector, OnDestroy } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  UserCredential,
  AuthError,
  AuthErrorCodes,
  onAuthStateChanged,
  User as FirebaseUser,
  getIdToken,
  getIdTokenResult,
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { AuthPayload, AuthResult, errorMessages } from '@core/models/auth.model';
import { environment } from 'environments/environment';
import { ToastService } from './toast.service';
import { UserService } from '@core/entities/user/user.service';
import { UserC } from '@core/entities/user/user.class';
import { Subject } from 'rxjs';
import { MessagingService } from './messaging.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private auth = inject(Auth);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private injector = inject(Injector);
  private userService = inject(UserService);
  private messagingService = inject(MessagingService);

  // Signals para el estado de autenticación
  current_user = signal<UserC | null>(null);
  isAuthenticated = signal<boolean | null>(null);
  isLoading = signal<boolean>(true);
  firebaseUser = signal<FirebaseUser | null>(null);
  isSuperAdmin = signal(false);
  activeCityId = signal('');

  // Subject para limpiar suscripciones
  private destroy$ = new Subject<void>();
  private readonly sessionExpiresAtKey = 'ecn_session_expires_at';
  private readonly keepSessionActiveKey = 'ecn_keep_session_active';
  private readonly sessionDurationMs = 24 * 60 * 60 * 1000;
  private sessionExpirationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.initializeAuthStateListener();
    this.isAuthenticated.set(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.sessionExpirationTimeout) {
      clearTimeout(this.sessionExpirationTimeout);
    }
  }

  /**
   * Inicializa el listener del estado de autenticación de Firebase
   */
  private initializeAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (firebaseUser: FirebaseUser | null) => {
      this.isLoading.set(true);

      if (firebaseUser) {
        // Usuario autenticado en Firebase
        this.firebaseUser.set(firebaseUser);

        if (this.isSessionExpired()) {
          await this.logout();
          this.isLoading.set(false);
          return;
        }
        this.ensureSessionExpiration();

        try {
          // Verificar si el token es válido
          const tokenResult = await getIdTokenResult(firebaseUser);
          this.isSuperAdmin.set(tokenResult.claims['super_admin'] === true);

          if (tokenResult.claims && !tokenResult.claims['disabled']) {
            // Obtener datos del usuario desde Firestore
            const user = await this.userService.getUserByUid(firebaseUser.uid);

            if (user) {
              this.current_user.set(user);
              if (!this.activeCityId()) this.activeCityId.set(user.city);
              this.isAuthenticated.set(true);

              // Guardar en localStorage
              localStorage.setItem(environment.X_TOKEN, firebaseUser.uid);
              localStorage.setItem(environment.X_EMAIL, firebaseUser.email!);

              void this.messagingService.syncTokenOnLogin(user);

              this.scheduleSessionExpiration();
            } else {
              console.warn('⚠️ [AuthService] Usuario no encontrado en Firestore');
              await this.handleUserNotRegistered();
            }
          } else {
            console.warn('⚠️ [AuthService] Token inválido o usuario deshabilitado');
            await this.handleInvalidUser();
          }
        } catch (error) {
          console.error('❌ [AuthService] Error verificando usuario:', error);
          await this.handleInvalidUser();
        }
      } else {
        // Usuario no autenticado
        this.handleLogout();
      }

      this.isLoading.set(false);
    });
  }

  private isSessionExpired(): boolean {
    if (localStorage.getItem(this.keepSessionActiveKey) === 'true') return false;
    const expiresAt = Number(localStorage.getItem(this.sessionExpiresAtKey));
    return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
  }

  private ensureSessionExpiration(): void {
    const expiresAt = Number(localStorage.getItem(this.sessionExpiresAtKey));
    if (localStorage.getItem(this.keepSessionActiveKey) !== 'true' && (!Number.isFinite(expiresAt) || expiresAt <= 0)) {
      localStorage.setItem(this.sessionExpiresAtKey, String(Date.now() + this.sessionDurationMs));
    }
  }

  private scheduleSessionExpiration(): void {
    if (this.sessionExpirationTimeout) clearTimeout(this.sessionExpirationTimeout);
    if (localStorage.getItem(this.keepSessionActiveKey) === 'true') return;
    const expiresAt = Number(localStorage.getItem(this.sessionExpiresAtKey));
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      void this.logout();
      return;
    }
    this.sessionExpirationTimeout = setTimeout(() => void this.logout(), remaining);
  }

  /**
   * Maneja usuarios inválidos (no encontrados o deshabilitados)
   */
  private async handleInvalidUser(): Promise<void> {
    this.toastService.error({
      message: 'Tu sesión ha expirado o no tienes permisos. Por favor, inicia sesión nuevamente.',
      title: 'Sesión inválida',
    });
    await this.logout();
  }

  /**
   * Maneja usuarios inválidos (no encontrados o deshabilitados)
   */
  private async handleUserNotRegistered(): Promise<void> {
    this.toastService.error({
      message: 'Este correo no está registrado en el sistema. Contacta al administrador.',
      title: 'Acceso denegado',
    });
    await this.logout();
  }

  /**
   * Maneja el logout limpiando todo el estado
   */
  private handleLogout(): void {
    this.current_user.set(null);
    this.isAuthenticated.set(false);
    this.firebaseUser.set(null);
    this.isSuperAdmin.set(false);
    this.activeCityId.set('');

    // Limpiar localStorage
    localStorage.removeItem(environment.X_TOKEN);
    localStorage.removeItem(environment.X_EMAIL);

    if (this.sessionExpirationTimeout) clearTimeout(this.sessionExpirationTimeout);
    this.sessionExpirationTimeout = null;
    localStorage.removeItem(this.sessionExpiresAtKey);
    localStorage.removeItem(this.keepSessionActiveKey);
  }

  /**
   * Inicia sesión con email y contraseña
   */
  login(payload: AuthPayload): Promise<void> {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        this.isLoading.set(true);

        if (payload.keepSessionActive) {
          localStorage.setItem(this.keepSessionActiveKey, 'true');
          localStorage.removeItem(this.sessionExpiresAtKey);
        } else {
          localStorage.setItem(this.keepSessionActiveKey, 'false');
          localStorage.setItem(this.sessionExpiresAtKey, String(Date.now() + this.sessionDurationMs));
        }

        signInWithEmailAndPassword(this.auth, payload.email, payload.password)
          .then(async (userCredential: UserCredential) => {
            try {
              // El listener de onAuthStateChanged se encargará del resto
              resolve();
            } catch (error) {
              console.error('❌ [AuthService] Error en login:', error);
              reject(error);
            }
          })
          .catch(error => {
            localStorage.removeItem(this.sessionExpiresAtKey);
            localStorage.removeItem(this.keepSessionActiveKey);
            console.error('❌ [AuthService] Error de autenticación:', error);
            const authResult = this.getAuthMessage(error);
            this.toastService.error({
              message: authResult.message ?? 'Error al iniciar sesión',
              title: authResult.title ?? 'Error',
            });
            reject(error);
          })
          .finally(() => {
            this.isLoading.set(false);
          });
      });
    });
  }

  /**
   * Registra un nuevo usuario
   */
  register(payload: AuthPayload): Promise<void> {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        createUserWithEmailAndPassword(this.auth, payload.email, payload.password)
          .then((userCredential: UserCredential) => {
            this.toastService.success({
              message: 'Usuario registrado exitosamente',
              title: 'Registro exitoso',
            });
            resolve();
          })
          .catch(error => {
            console.error('❌ [AuthService] Error en registro:', error);
            const authResult = this.getAuthMessage(error);
            this.toastService.error({
              message: authResult.message ?? 'Error al registrar usuario',
              title: authResult.title ?? 'Error',
            });
            reject(error);
          });
      });
    });
  }

  /**
   * Cierra sesión
   */
  logout(): Promise<void> {
    return runInInjectionContext(this.injector, () => {
      const currentUser = this.current_user();

      if (currentUser) {
        void this.messagingService.unregisterCurrentToken(currentUser);
      }

      return signOut(this.auth)
        .then(() => {
          this.handleLogout();
          this.router.navigateByUrl('/auth/login');
        })
        .catch(error => {
          console.error('❌ [AuthService] Error al cerrar sesión:', error);
          const authResult = this.getAuthMessage(error);
          this.toastService.error({ message: authResult.message ?? 'Error al cerrar sesión', title: authResult.title ?? 'Error' });
        });
    });
  }

  /**
   * Verifica si el usuario actual está autenticado y tiene un token válido
   */
  async isUserAuthenticated(): Promise<boolean> {
    const firebaseUser = this.firebaseUser();

    if (!firebaseUser) {
      return false;
    }

    if (this.isSessionExpired()) {
      await this.logout();
      return false;
    }

    try {
      const tokenResult = await getIdTokenResult(firebaseUser);
      return !tokenResult.claims?.['disabled'] && this.isAuthenticated() === true;
    } catch (error) {
      console.error('❌ [AuthService] Error verificando autenticación:', error);
      return false;
    }
  }

  /**
   * Obtiene el token actual del usuario
   */
  async getCurrentToken(): Promise<string | null> {
    const firebaseUser = this.firebaseUser();

    if (!firebaseUser) {
      return null;
    }

    try {
      return await getIdToken(firebaseUser);
    } catch (error) {
      console.error('❌ [AuthService] Error obteniendo token:', error);
      return null;
    }
  }

  /**
   * Obtiene el mensaje de error correspondiente al código de error
   */
  private getAuthMessage(error: AuthError): AuthResult {
    const errorCode = error.code;
    return errorMessages[errorCode] || errorMessages['error'];
  }
}
