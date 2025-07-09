import { HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { Router } from '@angular/router';

export function authInterceptor(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<any> {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Solo agregar token si el usuario está autenticado
  if (authService.isAuthenticated()) {
    return addTokenToRequest(request, next, authService, router);
  }

  return next(request);
}

function addTokenToRequest(
  request: HttpRequest<unknown>, 
  next: HttpHandlerFn, 
  authService: AuthService, 
  router: Router
): Observable<any> {
  return new Observable(observer => {
    authService.getCurrentToken().then(token => {
      if (token) {
        const authReq = request.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
        next(authReq).subscribe(observer);
      } else {
        next(request).subscribe(observer);
      }
    }).catch(error => {
      console.error('❌ [AuthInterceptor] Error obteniendo token:', error);
      next(request).subscribe(observer);
    });
  });
}

function handleAuthError(error: HttpErrorResponse, authService: AuthService, router: Router): Observable<never> {
  if (error.status === 401) {
    // Token expirado o inválido
    console.warn('⚠️ [AuthInterceptor] Token expirado, redirigiendo al login');
    authService.logout();
    router.navigateByUrl('/auth/login');
  }
  return throwError(() => error);
} 