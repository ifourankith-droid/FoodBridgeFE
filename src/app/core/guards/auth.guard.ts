import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { APP_ROUTES } from '../config/app-routes';
import { AuthService } from '../services/auth.service';

/** Blocks the authenticated shell unless a user is signed in. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.currentUser() ? true : router.createUrlTree([APP_ROUTES.login]);
};
