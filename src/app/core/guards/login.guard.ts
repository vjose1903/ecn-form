import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { environment } from '../../../environments/environment';

export const loginGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  // Verificar si existe el token en localStorage
  const token = localStorage.getItem(environment.X_TOKEN);

  if (token) {
    // Si hay token, redirigir al listado de retiros
    router.navigateByUrl('/retiros');
    return false;
  }

  // Si hay token, permitir acceso
  return true;
};
