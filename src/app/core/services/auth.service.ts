import { inject, Injectable, signal, runInInjectionContext, Injector, OnDestroy } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
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

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private auth = inject(Auth);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private injector = inject(Injector);
  private userService = inject(UserService);

  // Signals para el estado de autenticación
  current_user = signal<UserC | null>(null);
  isAuthenticated = signal<boolean | null>(null);
  isLoading = signal<boolean>(true);
  firebaseUser = signal<FirebaseUser | null>(null);

  // Subject para limpiar suscripciones
  private destroy$ = new Subject<void>();

  // Intervalo para verificar expiración de token (cada 5 minutos)
  private tokenCheckInterval: any;

  constructor() {
    this.initializeAuthStateListener();
    this.isAuthenticated.set(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
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

        try {
          // Verificar si el token es válido
          const tokenResult = await getIdTokenResult(firebaseUser);

          if (tokenResult.claims && !tokenResult.claims['disabled']) {
            // Obtener datos del usuario desde Firestore
            const user = await this.userService.getUserByEmail(firebaseUser.email!);

            if (user) {
              this.current_user.set(user);
              this.isAuthenticated.set(true);

              // Guardar en localStorage
              localStorage.setItem(environment.X_TOKEN, firebaseUser.uid);
              localStorage.setItem(environment.X_EMAIL, firebaseUser.email!);

              // Iniciar verificación periódica de token
              this.startTokenExpirationCheck();

              console.log('✅ [AuthService] Usuario autenticado:', user.email);
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

  /**
   * Inicia la verificación periódica de expiración de token
   */
  private startTokenExpirationCheck(): void {
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
    }

    this.tokenCheckInterval = setInterval(async () => {
      const firebaseUser = this.firebaseUser();
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true); // Force refresh

          if (tokenResult.expirationTime) {
            const expirationTime = new Date(tokenResult.expirationTime).getTime();
            const currentTime = Date.now();
            const timeUntilExpiration = expirationTime - currentTime;

            // Si el token expira en menos de 10 minutos, renovarlo
            if (timeUntilExpiration < 10 * 60 * 1000) {
              console.log('🔄 [AuthService] Renovando token...');
              await firebaseUser.getIdToken(true);
            }
          }
        } catch (error) {
          console.error('❌ [AuthService] Error verificando expiración de token:', error);
          await this.handleInvalidUser();
        }
      }
    }, 5 * 60 * 1000); // Verificar cada 5 minutos
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

    // Limpiar localStorage
    localStorage.removeItem(environment.X_TOKEN);
    localStorage.removeItem(environment.X_EMAIL);

    // Limpiar intervalo de verificación
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
    }

    console.log('🔓 [AuthService] Usuario desautenticado');
  }

  /**
   * Inicia sesión con email y contraseña
   */
  login(payload: AuthPayload): Promise<void> {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        this.isLoading.set(true);

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
   * Inicia sesión con Google
   */
  async loginWithGooglePopup(): Promise<void> {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        this.isLoading.set(true);

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        signInWithPopup(this.auth, provider)
          .then(async (userCredential: UserCredential) => {
            try {
              // El listener de onAuthStateChanged se encargará del resto
              resolve();
            } catch (error) {
              console.error('❌ [AuthService] Error en login con Google:', error);
              reject(error);
            }
          })
          .catch(error => {
            console.error('❌ [AuthService] Error de autenticación con Google:', error);

            // Ignorar errores de cancelación de popup
            const ignoreErrors = [AuthErrorCodes.POPUP_CLOSED_BY_USER, AuthErrorCodes.POPUP_BLOCKED, AuthErrorCodes.EXPIRED_POPUP_REQUEST, AuthErrorCodes.USER_CANCELLED];

            if (ignoreErrors.includes(error.code)) {
              resolve();
              return;
            }

            const authResult = this.getAuthMessage(error);
            this.toastService.error({
              message: authResult.message ?? 'Error al iniciar sesión con Google',
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
   * Cierra sesión
   */
  logout(): Promise<void> {
    return runInInjectionContext(this.injector, () => {
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
