import { inject, Injectable, signal } from '@angular/core';
import { HubConnection } from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { TrackingSnapshot } from '@core/models/tracking.model';
import { AuthService } from '@core/services/auth.service';
import { buildHubConnection, isLive } from './hub-connection';

/** Hub method names — server→client, then the three client→server invocations. */
const LOCATION_UPDATED = 'LocationUpdated';
const JOIN = 'JoinTracking';
const LEAVE = 'LeaveTracking';
const UPDATE = 'UpdateLocation';

/**
 * Live delivery tracking over `/hubs/tracking`.
 *
 * One shared connection, many listing groups: `watch(listingId)` joins that
 * listing's group and emits every `LocationUpdated` for it; unsubscribing leaves
 * the group. The connection itself is opened lazily on the first watcher and
 * closed when the last one goes away, so a role that never tracks anything never
 * opens a socket.
 *
 * `report()` is the volunteer's side — the hub rejects it from anyone who isn't
 * the assigned volunteer, and it is what populates the backend's in-memory
 * tracking store that `GET /listings/{id}/track` reads. Without it that store
 * stays empty and tracking never shows a position.
 */
@Injectable({ providedIn: 'root' })
export class TrackingHubService {
  private readonly auth = inject(AuthService);

  readonly connected = signal(false);

  private connection: HubConnection | null = null;
  /** Pending/!live connect, shared so concurrent watchers await one handshake. */
  private starting: Promise<HubConnection> | null = null;
  /** Watcher count per listing — the group is left when it hits zero. */
  private readonly watchers = new Map<string, number>();

  /**
   * Live positions for one listing. Cold: joins on subscribe, leaves on
   * unsubscribe. Emits nothing until the volunteer reports — pair it with
   * `TrackingService.snapshot()` for the last known position on load.
   */
  watch(listingId: string): Observable<TrackingSnapshot> {
    return new Observable<TrackingSnapshot>((subscriber) => {
      let cancelled = false;

      const handler = (snapshot: TrackingSnapshot) => {
        // One shared connection carries every group, so filter to this listing.
        if (snapshot?.listingId === listingId) {
          subscriber.next(snapshot);
        }
      };

      void this.acquire(listingId, handler).catch((error: unknown) => {
        if (!cancelled) {
          subscriber.error(error);
        }
      });

      return () => {
        cancelled = true;
        void this.release(listingId, handler);
      };
    });
  }

  /**
   * Report the assigned volunteer's position. Resolves false when the socket
   * isn't up (or the hub refuses) — a dropped GPS ping is not worth an error
   * dialog mid-delivery, the next tick simply tries again.
   */
  async report(listingId: string, latitude: number, longitude: number): Promise<boolean> {
    try {
      const connection = await this.ensureConnection();
      if (!isLive(connection)) {
        return false;
      }
      await connection.invoke(UPDATE, listingId, latitude, longitude);
      return true;
    } catch (error) {
      console.warn('[tracking-hub] location report failed', error);
      return false;
    }
  }

  private async acquire(
    listingId: string,
    handler: (snapshot: TrackingSnapshot) => void,
  ): Promise<void> {
    const connection = await this.ensureConnection();
    connection.on(LOCATION_UPDATED, handler);

    const count = this.watchers.get(listingId) ?? 0;
    this.watchers.set(listingId, count + 1);
    if (count === 0) {
      await connection.invoke(JOIN, listingId);
    }
  }

  private async release(
    listingId: string,
    handler: (snapshot: TrackingSnapshot) => void,
  ): Promise<void> {
    const connection = this.connection;
    connection?.off(LOCATION_UPDATED, handler);

    const count = (this.watchers.get(listingId) ?? 1) - 1;
    if (count > 0) {
      this.watchers.set(listingId, count);
      return;
    }

    this.watchers.delete(listingId);
    if (connection && isLive(connection)) {
      try {
        await connection.invoke(LEAVE, listingId);
      } catch {
        // Connection went away first — the group dies with it anyway.
      }
    }
    if (!this.watchers.size) {
      await this.teardown();
    }
  }

  /** One handshake shared by every concurrent caller. */
  private ensureConnection(): Promise<HubConnection> {
    if (this.connection && isLive(this.connection)) {
      return Promise.resolve(this.connection);
    }
    if (this.starting) {
      return this.starting;
    }

    const connection = this.connection ?? buildHubConnection('tracking', () => this.auth.token());
    this.connection = connection;
    connection.onreconnected(() => {
      this.connected.set(true);
      // Groups are per-connection server-side, so rejoin everything being watched.
      void this.rejoinAll();
    });
    connection.onreconnecting(() => this.connected.set(false));
    connection.onclose(() => this.connected.set(false));

    this.starting = connection
      .start()
      .then(() => {
        this.connected.set(true);
        return connection;
      })
      .catch((error: unknown) => {
        this.connection = null;
        this.connected.set(false);
        throw error;
      })
      .finally(() => {
        this.starting = null;
      });

    return this.starting;
  }

  private async rejoinAll(): Promise<void> {
    const connection = this.connection;
    if (!connection || !isLive(connection)) {
      return;
    }
    for (const listingId of this.watchers.keys()) {
      try {
        await connection.invoke(JOIN, listingId);
      } catch (error) {
        console.warn('[tracking-hub] rejoin failed', listingId, error);
      }
    }
  }

  private async teardown(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.connected.set(false);
    if (!connection) {
      return;
    }
    try {
      await connection.stop();
    } catch {
      // Already closed.
    }
  }
}
