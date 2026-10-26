import { HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { Observable } from 'rxjs';
import { inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

export function authInterceptor(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<any> {
  const authService = inject(AuthService);

  // Solo agregar token si el usuario está autenticado
  if (authService.isAuthenticated()) {
    return addTokenToRequest(request, next, authService);
  }

  return next(request);
}

function addTokenToRequest(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
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
