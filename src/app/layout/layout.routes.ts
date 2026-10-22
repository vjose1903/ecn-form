import { Routes } from '@angular/router';
import { authGuard } from '../core/guards/auth.guard';
import { loginGuard } from '@core/guards/login.guard';

export const layoutRoutes: Routes = [
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: 'formulario/:user_id',
    loadComponent: () => import('../pages/form-page/form-page').then(m => m.FormPage),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('../pages/dashboard/dashboard').then(m => m.DashboardPage),
    canActivate: [authGuard],
  },
  {
    path: 'retiros',
    loadComponent: () => import('../pages/retreat-list/retreat-list').then(m => m.RetreatList),
    canActivate: [authGuard],
  },
  {
    path: 'solicitudes-archivadas',
    loadComponent: () => import('../pages/archived-requests/archived-requests').then(m => m.ArchivedRequests),
    canActivate: [authGuard],
  },
  {
    path: 'casas-de-retiro',
    loadComponent: () => import('../pages/retreat-home-list/retreat-home-list').then(m => m.RetreatHomeList),
    canActivate: [authGuard],
  },
  {
    path: 'administracion-acceso',
    loadComponent: () => import('../pages/access-management/access-management').then(m => m.AccessManagement),
    canActivate: [authGuard],
  },
  {
    path: 'auth/login',
    loadComponent: () => import('../pages/login/login').then(m => m.Login),
    canActivate: [loginGuard],
  },

  // Aquí puedes agregar más rutas hijas del layout
  // {
  //   path: 'otra-pagina',
  //   loadComponent: () =>
  //     import('../pages/otra-pagina/otra-pagina').then((m) => m.OtraPagina),
  //   canActivate: [authGuard],
  // },
];
