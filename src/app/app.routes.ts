import { Routes } from '@angular/router';
import { layoutRoutes } from './layout/layout.routes';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    children: layoutRoutes
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];
