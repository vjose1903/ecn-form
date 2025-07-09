import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const currentUrl = state.url;

  // Si la ruta es /formulario/{ciudad}, permitir acceso sin verificar token
  if (currentUrl.startsWith('/formulario/')) {
    return true;
  }

  // Esperar a que el AuthService termine de inicializar
  while (authService.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Verificar si el usuario está autenticado usando el AuthService
  const isAuthenticated = await authService.isUserAuthenticated();

  if (!isAuthenticated) {
    // Si no está autenticado, redirigir al login
    console.log('🚫 [AuthGuard] Usuario no autenticado, redirigiendo al login');
    router.navigateByUrl('/auth/login');
    return false;
  }

  // Si está autenticado, permitir acceso
  console.log('✅ [AuthGuard] Usuario autenticado, permitiendo acceso');
  return true;
};
