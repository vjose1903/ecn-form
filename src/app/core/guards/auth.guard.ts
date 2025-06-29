import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const currentUrl = state.url;

  // Si la ruta es /formulario/{ciudad}, permitir acceso sin verificar token
  if (currentUrl.startsWith('/formulario/')) {
    return true;
  }

  // Verificar si existe el token en localStorage
  const token = localStorage.getItem(environment.X_TOKEN);

  if (!token) {
    // Si no hay token, redirigir al login
    router.navigateByUrl('/auth/login');
    return false;
  }

  // Si hay token, permitir acceso
  return true;
};
