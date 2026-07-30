import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { APP_VIEWS } from '@core/config/routes.config';
import {
  Notification,
  NotificationAction,
  notificationAction,
} from '@core/models/notification.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

/**
 * Turns a notification into a destination: opening a row marks it read and takes
 * the user to the page it is about — "New pickup available near you" → Nearby
 * Listings, "No recipient available" → My Deliveries, and so on.
 *
 * Shared by the topbar bell and the inbox so both rows behave identically. Kept
 * out of `NotificationService`, which owns notification *state* only.
 */
@Injectable({ providedIn: 'root' })
export class NotificationRouter {
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * Affordance text for a row, or `''` when there is nowhere to send this user —
   * bound by the row so a notification never looks clickable-through when it isn't.
   */
  actionLabel(n: Notification): string {
    return this.destination(n)?.label ?? '';
  }

  /** Mark the row read, then open its related page when it has one. */
  open(n: Notification): void {
    if (!n.isRead) {
      this.notifications.markRead(n.id);
    }
    const target = this.destination(n);
    if (target) {
      this.router.navigate([APP_ROUTES.appView(target.view)]);
    }
  }

  /**
   * The mapped destination, but only if the signed-in role may actually go there.
   * Every in-app view is behind `roleGuard`, so navigating a role to someone
   * else's page would just bounce them — better to leave the row inert.
   */
  private destination(n: Notification): NotificationAction | null {
    const action = notificationAction(n.type);
    const role = this.auth.currentUser()?.role;
    if (!action || !role) {
      return null;
    }
    const view = APP_VIEWS.find((v) => v.id === action.view);
    return view?.roles.includes(role) ? action : null;
  }
}
