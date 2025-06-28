import { Routes } from '@angular/router';

export const layoutRoutes: Routes = [
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: 'formulario/:city',
    loadComponent: () => import('../pages/form-page/form-page').then(m => m.FormPage),
  },
  {
    path: 'auth/login',
    loadComponent: () => import('../pages/login/login').then(m => m.Login),
  },
  
  // Aquí puedes agregar más rutas hijas del layout
  // {
  //   path: 'otra-pagina',
  //   loadComponent: () =>
  //     import('../pages/otra-pagina/otra-pagina').then((m) => m.OtraPagina),
  // },
];
