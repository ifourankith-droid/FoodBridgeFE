import { effect, inject, Injectable, signal } from '@angular/core';
import { GeolocationService } from '@core/services/geolocation.service';
import { VolunteerDeliveriesStore } from '@core/services/volunteer-deliveries.store';
import { TrackingHubService } from './tracking-hub.service';

/** Don't push more than one position per listing in this window. */
const MIN_INTERVAL_MS = 10_000;

/**
 * Broadcasts the volunteer's position while they are carrying food.
 *
 * This is the missing half of delivery tracking: `GET /listings/{id}/track` reads
 * the backend's in-memory tracking store, and the *only* thing that writes to that
 * store is `TrackingHub.UpdateLocation`. Without this service the store stays empty
 * and every tracking view correctly reports "no position yet" forever.
 *
 * Runs only while there is something in transit (`PickedUp`) — a volunteer who has
 * claimed but not collected isn't carrying anything worth following, and nobody
 * else's location is ever sent.
 */
@Injectable({ providedIn: 'root' })
export class LocationBroadcastService {
  private readonly deliveries = inject(VolunteerDeliveriesStore);
  private readonly geolocation = inject(GeolocationService);
  private readonly hub = inject(TrackingHubService);

  /** True while the browser watch is active. Surfaced for a "sharing location" pill. */
  readonly broadcasting = signal(false);

  private watchId: number | null = null;
  /** Last push per listing, so a chatty GPS doesn't flood the hub. */
  private readonly lastSent = new Map<string, number>();
  /** Read inside the position callback, which lives outside the effect. */
  private inTransitIds: readonly string[] = [];

  constructor() {
    effect(() => {
      this.inTransitIds = this.deliveries.inTransit().map((l) => l.id);
      if (this.inTransitIds.length) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  private start(): void {
    if (this.watchId !== null || !this.geolocation.supported) {
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.broadcast(position.coords.latitude, position.coords.longitude),
      (error) => {
        // Permission blocked or unavailable: tracking degrades to "no position",
        // which the tracking views already handle. Nothing to interrupt a delivery for.
        console.warn('[location-broadcast] watch failed', error.message);
        this.stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    this.broadcasting.set(true);
  }

  private stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.lastSent.clear();
    this.broadcasting.set(false);
  }

  private broadcast(latitude: number, longitude: number): void {
    const now = Date.now();
    for (const listingId of this.inTransitIds) {
      const previous = this.lastSent.get(listingId) ?? 0;
      if (now - previous < MIN_INTERVAL_MS) {
        continue;
      }
      this.lastSent.set(listingId, now);
      // Fire and forget: `report` swallows its own failures, and a missed ping is
      // superseded by the next one.
      void this.hub.report(listingId, latitude, longitude);
    }
  }
}
