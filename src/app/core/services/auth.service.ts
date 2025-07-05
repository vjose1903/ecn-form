import { inject, Injectable, signal, runInInjectionContext, Injector } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  UserCredential,
  AuthError,
  AuthErrorCodes,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  deleteUser,
  User,
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { AuthPayload, AuthResult, errorMessages } from '@core/models/auth.model';
import { environment } from 'environments/environment';
import { ToastService } from './toast.service';
import { UserService } from '@core/entities/user/user.service';
import { UserC } from '@core/entities/user/user.class';
import { CityService } from '@core/entities/city/city.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private injector = inject(Injector);

  private userService = inject(UserService);
  private cityService = inject(CityService);

  current_user = signal<UserC | null>(
    // null
    new UserC({
      email: 'reclutamientopromocionecnlv@gmail.com',
      uid: 'VkUrg07gXtbpsfQ0NCCJkk8vm7Q2',
      id: 'ap6wqBG1Yxz3b8sp5TZL',
      city: { id: 'dX2K8miAjSxr4vQedApq', key: 'lv', label: 'La Vega' } as any,
    })
  );

  constructor() {}

  login(payload: AuthPayload) {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        signInWithEmailAndPassword(this.auth, payload.email, payload.password)
          .then(async (userCredential: UserCredential) => {
            const user = await this.userService.getUserByEmail(payload.email);

            if (!user) {
              this.toastService.error({ message: 'Este correo no está registrado en el sistema. Contacta al administrador.', title: 'Acceso denegado' });
              await signOut(this.auth);
              reject(new Error('Usuario no registrado'));
              return;
            }

            localStorage.setItem(environment.X_TOKEN, userCredential.user?.uid ?? '');
            localStorage.setItem(environment.X_EMAIL, payload.email);
            this.current_user.set(user);

            resolve();
            // this.router.navigate(['/']);
          })
          .catch(error => {
            console.error(error);
            const authResult = this.getAuthMessage(error);
            this.toastService.error({ message: authResult.message ?? 'Error al iniciar sesión', title: authResult.title ?? 'Error' });

            reject(error);
          });
      });
    });
  }

  register(payload: AuthPayload) {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        createUserWithEmailAndPassword(this.auth, payload.email, payload.password)
          .then((userCredential: UserCredential) => {
            resolve();
          })
          .catch(error => {
            console.error(error);
            const authResult = this.getAuthMessage(error);
            this.toastService.error({ message: authResult.message ?? 'Error al iniciar sesión', title: authResult.title ?? 'Error' });

            reject(error);
          });
      });
    });
  }

  // Método alternativo con popup (mantener por compatibilidad)
  async loginWithGooglePopup() {
    return runInInjectionContext(this.injector, () => {
      return new Promise<void>((resolve, reject) => {
        const provider = new GoogleAuthProvider();

        // Configurar el proveedor para que siempre muestre el selector de cuentas
        provider.setCustomParameters({ prompt: 'select_account' });

        // Primero, obtener el email del usuario de Google
        signInWithPopup(this.auth, provider)
          .then(async (userCredential: UserCredential) => {
            const email = userCredential.user?.email;

            if (!email) {
              this.toastService.error({ message: 'No se pudo obtener el email del usuario', title: 'Error' });
              await signOut(this.auth);
              reject(new Error('Email no disponible'));
              return;
            }

            // Verificar si el usuario ya existe en Firebase
            try {
              const user = await this.userService.getUserByEmail(email);

              // Si no hay métodos de inicio de sesión, el usuario no existe
              if (!user) {
                this.toastService.error({ message: 'Este correo no está registrado en el sistema. Contacta al administrador.', title: 'Acceso denegado' });

                // await deleteUser(userCredential.user);

                await signOut(this.auth);
                reject(new Error('Usuario no registrado'));
                return;
              }

              // Si el usuario existe, permitir el acceso

              localStorage.setItem(environment.X_TOKEN, userCredential.user?.uid ?? '');
              localStorage.setItem(environment.X_EMAIL, userCredential.user?.email ?? '');
              this.current_user.set(user);
              this.router.navigateByUrl('/retiros');

              resolve();
            } catch (error) {
              console.error('Error verificando usuario:', error);
              await signOut(this.auth);
              this.toastService.error({
                message: 'Error al verificar el usuario en el sistema',
                title: 'Error',
              });
              reject(error);
            }
          })
          .catch(error => {
            console.error(error);
            const ignoreErrors = [AuthErrorCodes.POPUP_CLOSED_BY_USER, AuthErrorCodes.POPUP_BLOCKED, AuthErrorCodes.EXPIRED_POPUP_REQUEST, AuthErrorCodes.USER_CANCELLED];
            if (ignoreErrors.includes(error.code)) {
              return resolve();
            }

            const authResult = this.getAuthMessage(error);
            this.toastService.error({ message: authResult.message ?? 'Error al iniciar sesión con Google', title: authResult.title ?? 'Error' });

            reject(error);
          });
      });
    });
  }

  logout() {
    return runInInjectionContext(this.injector, () => {
      return signOut(this.auth)
        .then(() => {
          localStorage.removeItem(environment.X_TOKEN);
          localStorage.removeItem(environment.X_EMAIL);
          this.current_user.set(null);
          this.router.navigateByUrl('/auth/login');
        })
        .catch(error => {
          console.error(error);
          const authResult = this.getAuthMessage(error);
          this.toastService.error({ message: authResult.message ?? 'Error al cerrar sesión', title: authResult.title ?? 'Error' });
        });
    });
  }

  private getAuthMessage(error: AuthError): AuthResult {
    const errorCode = error.code;

    return errorMessages[errorCode] || errorMessages['error'];
  }
}
