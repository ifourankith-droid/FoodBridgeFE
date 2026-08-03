import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { environment } from '@env/environment';
import { GeoAddress, GeocodingService } from '@core/services/geocoding.service';
import { GeolocationError, GeolocationService } from '@core/services/geolocation.service';
import { LocationPermissionService } from '@core/services/location-permission.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig } from '@shared/ui/map/fb-map.model';

/**
 * One reusable "pick a location" unit: the draggable picker map, a "use current
 * location" button, and the "Pin set at …" coordinate line — all configurable.
 *
 * It owns the shared plumbing every location form was duplicating: GPS capture
 * (via {@link GeolocationService}, with the blocked-permission modal), and
 * reverse-geocoding each chosen point. Parents just react to two outputs:
 *  - `locationChange` — the picked coordinates (store for submit/validation).
 *  - `addressResolved` — the reverse-geocoded {@link GeoAddress} (patch into
 *    whatever address fields the form happens to have).
 *
 * @example
 * <app-location-picker
 *   [location]="pin()"
 *   buttonLabel="Use current GPS location"
 *   (locationChange)="onPin($event)"
 *   (addressResolved)="fillAddress($event)"
 * />
 */
@Component({
  selector: 'app-location-picker',
  imports: [DecimalPipe, FbButton, FbMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-fb-map class="block mb-3" [config]="mapConfig()" (locationChange)="onPin($event)" />

    @if (showButton()) {
      <div class="mb-3">
        <app-button
          variant="outline"
          icon="fa-solid fa-location-crosshairs"
          [block]="true"
          [loading]="busy()"
          (clicked)="captureGps()"
        >
          {{ buttonLabel() }}
        </app-button>

        <!-- Outlives the toast on purpose. Where the device simply cannot produce
             a fix, this button fails every single time — a notice that vanishes
             after three seconds just invites another press. -->
        @if (gpsError(); as e) {
          <p class="text-amber-600 dark:text-amber-400 text-xs mt-2">
            <i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>{{ e }}
          </p>
        }
      </div>
    }

    @if (showCoords()) {
      @if (error()) {
        <p class="text-red-500 text-xs mb-3">{{ error() }}</p>
      } @else if (current(); as loc) {
        <p class="fb-help mb-3">
          <i class="fa-solid fa-location-dot mr-1 text-primary"></i>{{ coordsLabel() }}
          {{ loc.lat | number: '1.4-4' }}, {{ loc.lng | number: '1.4-4' }}
        </p>
      } @else {
        <p class="fb-help mb-3">{{ emptyHint() }}</p>
      }
    }
  `,
})
export class LocationPicker implements OnInit {
  private readonly geolocation = inject(GeolocationService);
  private readonly locationPermission = inject(LocationPermissionService);
  private readonly geocoding = inject(GeocodingService);
  private readonly toast = inject(ToastService);

  /** Controlled location — drives the initial pin and the coordinate line. */
  readonly location = input<FbLatLng | null>(null);
  /**
   * Where to look before anything is picked, when that isn't the world default.
   * Kept apart from {@link location} on purpose: the picker always *draws* a pin,
   * but a pin the map merely started on is not a choice the user made — folding
   * the two together makes the coordinate line claim a location was set when it
   * wasn't. Ignored once a point is actually picked.
   */
  readonly center = input<FbLatLng | null>(null);
  readonly height = input(240);
  readonly zoom = input(15);
  readonly placeholderText = input('Confirm your location');
  /** Label of the GPS button. */
  readonly buttonLabel = input('Use current location');
  /** Prefix shown before the coordinates, e.g. "Pin set at". */
  readonly coordsLabel = input('Pin set at');
  /** Shown in the coordinate slot before any point is picked. */
  readonly emptyHint = input('Drop a pin on the map to set your location');
  /** Optional error message shown in place of the coordinate/hint line (red). */
  readonly error = input('');
  readonly showButton = input(true);
  readonly showCoords = input(true);
  /** Title of the blocked-permission modal raised when GPS is denied. */
  readonly permissionPrompt = input('Turn on location to autofill your address');
  /** Attempt a silent GPS fix on first render (no toasts, no permission modal). */
  readonly autoLocate = input(false);

  /** Emits the chosen coordinates (drag, click or GPS). */
  readonly locationChange = output<FbLatLng>();
  /** Emits the reverse-geocoded address for the chosen point. */
  readonly addressResolved = output<GeoAddress>();

  protected readonly busy = signal(false);
  /** The point currently shown, kept in sync with the `location` input until moved. */
  protected readonly current = signal<FbLatLng | null>(null);
  /** Why the last GPS attempt failed, or '' — shown under the button until it succeeds. */
  protected readonly gpsError = signal('');

  protected readonly mapConfig = computed<FbMapConfig>(() => ({
    mode: 'picker',
    height: this.height(),
    zoom: this.zoom(),
    initialLocation:
      this.current() ?? this.location() ?? this.center() ?? environment.mapDefaultCenter,
    clickToPlace: true,
    placeholderText: this.placeholderText(),
  }));

  constructor() {
    // Track the controlled input until the user moves the pin themselves.
    effect(() => {
      const loc = this.location();
      if (loc) {
        this.current.set(loc);
      }
    });
  }

  ngOnInit(): void {
    // Entering a fresh form → best-effort silent GPS prefill (opt-in).
    if (this.autoLocate() && !this.current() && this.geolocation.supported) {
      this.geolocation.current().subscribe({
        next: (loc) => this.setLocation(loc, false),
        error: () => undefined,
      });
    }
  }

  protected onPin(pos: FbLatLng): void {
    this.setLocation(pos, false);
  }

  protected captureGps(): void {
    if (!this.geolocation.supported) {
      this.gpsError.set('This browser has no location service — set the point on the map.');
      this.toast.warning('Geolocation is not supported on this device.');
      return;
    }
    this.gpsError.set('');
    this.busy.set(true);
    this.geolocation.current().subscribe({
      next: (loc) => this.setLocation(loc, true),
      error: (err: GeolocationError) => {
        this.busy.set(false);
        if (err.denied) {
          // Blocked → the shared "Turn on location" modal; retry on grant.
          this.locationPermission.prompt(this.permissionPrompt()).then((retry) => {
            if (retry) {
              this.captureGps();
            }
          });
          return;
        }
        // Keep the reason GeolocationService worked out. "Your location is
        // currently unavailable" (no Wi-Fi or GPS radio for the browser to
        // locate from — common on a wired desktop, and permanent there) and
        // "Getting your location timed out" (worth another press) call for
        // opposite responses from the user, and the single generic line this
        // replaced told them which one it was: neither.
        const reason = `${err.message} — set the point on the map instead.`;
        this.gpsError.set(reason);
        this.toast.warning(reason);
      },
    });
  }

  /** Adopt a new point: recentre the pin, emit it, then reverse-geocode → address. */
  private setLocation(pos: FbLatLng, fromGps: boolean): void {
    // Any point at all clears the notice — dropping a pin is the recovery it asks for.
    this.gpsError.set('');
    this.current.set(pos);
    this.locationChange.emit(pos);
    this.geocoding.reverseGeocode(pos.lat, pos.lng).subscribe({
      next: (address) => {
        if (fromGps) {
          this.busy.set(false);
        }
        this.addressResolved.emit(address);
      },
      error: () => {
        if (fromGps) {
          this.busy.set(false);
        }
      },
    });
  }
}
