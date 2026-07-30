import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { APP_VIEWS } from './core/config/routes.config';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/auth/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Sign In',
        loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
      },
      {
        path: 'otp',
        title: 'Verify OTP',
        loadComponent: () => import('./features/auth/otp/otp').then((m) => m.Otp),
      },
      {
        path: 'register',
        title: 'Create Account',
        loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      // Generated from the route/permission config — each view is role-guarded.
      ...APP_VIEWS.map((view) => ({
        path: view.id,
        title: view.title,
        loadComponent: view.load,
        canActivate: [roleGuard],
        data: { roles: view.roles },
      })),
      {
        path: '**',
        loadComponent: () =>
          import('./features/shell/coming-soon/coming-soon').then((m) => m.ComingSoon),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
