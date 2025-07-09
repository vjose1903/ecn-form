import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

export const loginGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // Esperar a que el AuthService termine de inicializar
  while (authService.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Verificar si el usuario está autenticado usando el AuthService
  const isAuthenticated = await authService.isUserAuthenticated();

  if (isAuthenticated) {
    // Si está autenticado, redirigir al listado de retiros
    console.log('🔄 [LoginGuard] Usuario ya autenticado, redirigiendo a retiros');
    router.navigateByUrl('/retiros');
    return false;
  }

  // Si no está autenticado, permitir acceso al login
  console.log('✅ [LoginGuard] Usuario no autenticado, permitiendo acceso al login');
  return true;
};
