import { inject, Injectable, signal } from '@angular/core';
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
import { UserService } from '@core/entities/user/user.entity';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private toastService = inject(ToastService);

  private userService = inject(UserService);

  user = signal<User | null>(null);

  constructor() {}

  login(payload: AuthPayload) {
    return new Promise<void>((resolve, reject) => {
      signInWithEmailAndPassword(this.auth, payload.email, payload.password)
        .then((userCredential: UserCredential) => {
          console.log(userCredential);
          localStorage.setItem(environment.X_TOKEN, userCredential.user?.uid ?? '');

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
  }

  register(payload: AuthPayload) {
    return new Promise<void>((resolve, reject) => {
      createUserWithEmailAndPassword(this.auth, payload.email, payload.password)
        .then((userCredential: UserCredential) => {
          console.log(userCredential);

          resolve();
        })
        .catch(error => {
          console.error(error);
          const authResult = this.getAuthMessage(error);
          this.toastService.error({ message: authResult.message ?? 'Error al iniciar sesión', title: authResult.title ?? 'Error' });

          reject(error);
        });
    });
  }

  logout() {
    return signOut(this.auth)
      .then(() => {
        localStorage.removeItem(environment.X_TOKEN);
        this.router.navigateByUrl('/auth/login');
      })
      .catch(error => {
        console.error(error);
        const authResult = this.getAuthMessage(error);
        this.toastService.error({ message: authResult.message ?? 'Error al cerrar sesión', title: authResult.title ?? 'Error' });
      });
  }

  // Método alternativo con popup (mantener por compatibilidad)
  async loginWithGooglePopup() {
    return new Promise<void>((resolve, reject) => {
      const provider = new GoogleAuthProvider();

      // Primero, obtener el email del usuario de Google
      signInWithPopup(this.auth, provider)
        .then(async (userCredential: UserCredential) => {
          const email = userCredential.user?.email;

          console.log('%c Email del usuario:', 'color: lime; font-weight: bold;', email);

          if (!email) {
            this.toastService.error({
              message: 'No se pudo obtener el email del usuario',
              title: 'Error',
            });
            await signOut(this.auth);
            reject(new Error('Email no disponible'));
            return;
          }

          // Verificar si el usuario ya existe en Firebase
          try {
            const user = await this.userService.getUserByEmail(email);

            console.log('%c user', 'color: lime; font-weight: bold;', user);

            // Si no hay métodos de inicio de sesión, el usuario no existe
            if (!user) {
              this.toastService.error({
                message: 'Este correo no está registrado en el sistema. Contacta al administrador.',
                title: 'Acceso denegado',
              });

              await deleteUser(userCredential.user);

              await signOut(this.auth);
              reject(new Error('Usuario no registrado'));
              return;
            }

            // Si el usuario existe, permitir el acceso
            console.log('Usuario verificado:', userCredential);
            localStorage.setItem(environment.X_TOKEN, userCredential.user?.uid ?? '');
            this.router.navigateByUrl('/listado/retiros');
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
  }

  private getAuthMessage(error: AuthError): AuthResult {
    const errorCode = error.code;
    console.log('%c errorCode', 'color: red; font-weight: bold;', errorCode);

    return errorMessages[errorCode] || errorMessages['error'];
  }
}
