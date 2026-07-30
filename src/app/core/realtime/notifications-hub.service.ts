import { effect, inject, Injectable, signal } from '@angular/core';
import { HubConnection } from '@microsoft/signalr';
import { Notification } from '@core/models/notification.model';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { buildHubConnection } from './hub-connection';

/** Server → client method name on `NotificationsHub`. */
const RECEIVE = 'ReceiveNotification';

/**
 * Live notification push over `/hubs/notifications`.
 *
 * The hub adds each connection to a `user:{id}` group on connect, so the server
 * pushes only this user's rows — no client-side filtering needed.
 *
 * Connects when a user signs in and stops when they sign out. REST hydration in
 * `NotificationService` still runs: the hub only carries rows created *while*
 * connected, so it augments the initial fetch rather than replacing it. A dropped
 * connection is therefore a degradation, not a failure — the bell keeps working,
 * it just stops being instant, which is why a connect failure is logged and not
 * surfaced as a toast.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsHubService {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  /** Exposed for a future "live / reconnecting" indicator in the topbar. */
  readonly connected = signal(false);

  private connection: HubConnection | null = null;

  constructor() {
    effect(() => {
      const signedIn = !!this.auth.currentUser() && !!this.auth.token();
      if (signedIn) {
        void this.connect();
      } else {
        void this.disconnect();
      }
    });
  }

  private async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    const connection = buildHubConnection('notifications', () => this.auth.token());
    // Assign before starting so a second effect run can't build a rival connection.
    this.connection = connection;

    connection.on(RECEIVE, (notification: Notification) => {
      this.notifications.receive(notification);
    });

    connection.onreconnected(() => {
      this.connected.set(true);
      // Anything raised while disconnected never arrived — refetch to close the gap.
      this.notifications.load();
    });
    connection.onreconnecting(() => this.connected.set(false));
    connection.onclose(() => this.connected.set(false));

    try {
      await connection.start();
      this.connected.set(true);
    } catch (error) {
      // Notifications still work over REST; don't nag the user about the socket.
      console.warn('[notifications-hub] connect failed; staying on REST only', error);
      this.connected.set(false);
      this.connection = null;
    }
  }

  private async disconnect(): Promise<void> {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    this.connection = null;
    this.connected.set(false);
    connection.off(RECEIVE);
    try {
      await connection.stop();
    } catch {
      // Already closing/closed — nothing to do.
    }
  }
}
