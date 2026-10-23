import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

export const superAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  while (auth.isLoading()) await new Promise(resolve => setTimeout(resolve, 100));
  if (auth.isSuperAdmin()) return true;
  await router.navigateByUrl('/dashboard');
  return false;
};
