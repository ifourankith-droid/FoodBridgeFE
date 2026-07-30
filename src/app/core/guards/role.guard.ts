import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { Role } from '@core/models/user.model';
import { AuthService } from '@core/services/auth.service';

/** Requires a signed-in user whose role is allowed for the route (route.data.roles). */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.currentUser();
  if (!user) {
    return router.createUrlTree([APP_ROUTES.login]);
  }
  const roles = route.data['roles'] as readonly Role[] | undefined;
  if (roles && !roles.includes(user.role)) {
    return router.createUrlTree([APP_ROUTES.dashboard]);
  }
  return true;
};
