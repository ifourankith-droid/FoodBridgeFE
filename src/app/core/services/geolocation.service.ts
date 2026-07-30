import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FbLatLng } from '@shared/ui/map/fb-map.model';

/** Error thrown by {@link GeolocationService.current}. `denied` distinguishes a blocked
 * permission (needs the user to re-enable it) from a transient failure (timeout / unavailable,
 * worth a plain retry). */
export class GeolocationError extends Error {
  constructor(
    message: string,
    readonly denied: boolean,
  ) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/**
 * Thin wrapper around the browser Geolocation API. Resolves the device's current
 * position as an Observable and caches the last known fix so features (e.g. the
 * volunteer's nearby-listings feed) can centre on where the user actually is.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private readonly last = signal<FbLatLng | null>(null);
  /** The most recent successful position, or null if never resolved. */
  readonly lastKnown = this.last.asReadonly();

  /** True if the browser exposes the Geolocation API at all. */
  readonly supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  /**
   * Resolve the device's current position. Cold Observable — subscribe to trigger the
   * prompt. Emits once then completes; errors with a {@link GeolocationError} if it fails.
   * Defaults favour a fast, reliable fix on desktops (no high-accuracy GPS wait, a recent
   * cached position is acceptable, generous timeout).
   */
  current(options?: PositionOptions): Observable<FbLatLng> {
    return new Observable<FbLatLng>((subscriber) => {
      if (!this.supported) {
        subscriber.error(new GeolocationError('Location is not available on this device', false));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc: FbLatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
          this.last.set(loc);
          subscriber.next(loc);
          subscriber.complete();
        },
        (error) =>
          subscriber.error(
            new GeolocationError(this.messageFor(error), error.code === error.PERMISSION_DENIED),
          ),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000, ...options },
      );
    });
  }

  /**
   * The live geolocation permission status via the Permissions API, or null if that API
   * is unavailable. Callers can listen to its `change` event to react when the user
   * grants/denies permission (e.g. auto-retry after they enable it).
   */
  async permissionStatus(): Promise<PermissionStatus | null> {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      return null;
    }
    try {
      return await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    } catch {
      return null;
    }
  }

  private messageFor(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission is blocked';
      case error.POSITION_UNAVAILABLE:
        return 'Your location is currently unavailable';
      case error.TIMEOUT:
        return 'Getting your location timed out';
      default:
        return 'Could not read your location';
    }
  }
}
