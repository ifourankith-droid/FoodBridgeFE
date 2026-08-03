import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { AccountStatus, UpdateProfileBody } from '@core/models/user.model';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { AuthService } from './auth.service';
import { GeolocationError, GeolocationService } from './geolocation.service';
import { LocationPermissionService } from './location-permission.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';
import { UserService } from './user.service';

/**
 * Online/availability state for Volunteers ("Available") and Recipients ("Accepting").
 * Single source of truth shared by the topbar pill and the Profile toggle.
 *
 * Going active is location-gated: we capture the device's current position, sync it to
 * the user's profile (so donors/recipients are matched to where they actually are), then
 * flip availability on the backend. If location permission is blocked, `permissionModalOpen`
 * is raised so the UI can guide the user to enable it.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly geo = inject(GeolocationService);
  private readonly locationPermission = inject(LocationPermissionService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationService);

  readonly isActive = signal(false);
  /** True while locating / syncing / calling the backend. */
  readonly busy = signal(false);

  /**
   * Verification state, read off the same profile fetch that hydrates the
   * toggle. The backend's matcher requires `AccountStatus = Verified`
   * (`RecipientReader.FindNearestAvailableRecipientIdAsync`), so an unverified
   * account is never matched however available it says it is — pages surface
   * this rather than showing a bare empty list.
   */
  readonly accountStatus = signal<AccountStatus | null>(null);
  readonly isVerified = computed(() => this.accountStatus() === 'Verified');

  private hydrated = false;

  readonly appliesToCurrentUser = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'volunteer' || role === 'recipient';
  });

  readonly label = computed(() => {
    if (!this.isActive()) {
      return 'Offline';
    }
    return this.auth.currentUser()?.role === 'volunteer' ? 'Available' : 'Accepting';
  });

  constructor() {
    // Reflect the real backend state once a volunteer/recipient is signed in.
    effect(() => {
      const user = this.auth.currentUser();
      if (user?.id && this.appliesToCurrentUser() && !this.hydrated) {
        this.hydrated = true;
        this.users.getProfile(user.id).subscribe({
          next: (p) => {
            this.isActive.set(p.isAvailable);
            this.accountStatus.set(p.accountStatus);
          },
          error: () => undefined,
        });
      }
    });
  }

  /** Sync the toggle state from a freshly-loaded profile, without side effects. */
  hydrate(isAvailable: boolean, accountStatus?: AccountStatus): void {
    this.hydrated = true;
    this.isActive.set(isAvailable);
    if (accountStatus) {
      this.accountStatus.set(accountStatus);
    }
  }

  toggle(): void {
    if (this.busy()) {
      return;
    }
    if (this.isActive()) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * Go active: capture live GPS → sync location → enable on the backend.
   *
   * The modal is shown ONLY when location permission is actually blocked. If permission is
   * granted (or merely unprompted) but the device simply can't produce a fix right now
   * (Windows location off, no GPS, timeout), we don't nag — we go active with the user's
   * saved location so they aren't stuck.
   */
  activate(): void {
    const id = this.auth.currentUser()?.id;
    if (!id) {
      return;
    }
    this.busy.set(true);
    this.geo.permissionStatus().then((status) => {
      if (status?.state === 'denied') {
        this.busy.set(false);
        this.promptToEnableLocation();
        return;
      }
      this.geo.current().subscribe({
        next: (loc) => this.syncThenEnable(id, loc),
        error: (err: unknown) => {
          if (err instanceof GeolocationError && err.denied) {
            // Permission was blocked (e.g. denied at the prompt) → guide to enable it.
            this.busy.set(false);
            this.promptToEnableLocation();
          } else {
            // Permission is fine; the device just couldn't get a fix → activate anyway.
            const reason = err instanceof Error ? err.message : 'Could not read your location';
            this.enableWithoutLocation(id, `${reason} — activated with your saved location.`);
          }
        },
      });
    });
  }

  /** Guide the user to unblock location, then re-run `activate()` if they retry. */
  private promptToEnableLocation(): void {
    this.locationPermission.prompt('Turn on location to go active').then((retry) => {
      if (retry) {
        this.activate();
      }
    });
  }

  deactivate(): void {
    const id = this.auth.currentUser()?.id;
    if (!id) {
      return;
    }
    this.busy.set(true);
    this.users.setAvailability(id, false).subscribe({
      next: (p) => {
        this.isActive.set(p.isAvailable);
        this.busy.set(false);
        this.toast.show('fa-solid fa-moon', "You're now offline — you won't be matched");
      },
      error: (err: Error) => {
        this.busy.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not update availability');
      },
    });
  }

  private syncThenEnable(id: string, loc: FbLatLng): void {
    this.users
      .getProfile(id)
      .pipe(
        switchMap((p) => {
          // Only the coordinates change here — every other field is echoed back verbatim because
          // the PUT is a full replace, so anything omitted would be erased.
          const body: UpdateProfileBody = {
            name: p.name,
            city: p.city,
            state: p.state,
            pincode: p.pincode,
            address: p.address,
            latitude: loc.lat,
            longitude: loc.lng,
            capacityMeals: p.capacityMeals,
          };
          return this.users.updateProfile(id, body);
        }),
        switchMap(() => this.users.setAvailability(id, true)),
      )
      .subscribe({
        next: (p) => {
          const role = this.auth.currentUser()?.role;
          this.onActivated(
            p.isAvailable,
            'fa-solid fa-circle-check',
            role === 'volunteer'
              ? "Location updated — you're now available for pickups"
              : "Location updated — you're now accepting deliveries",
          );
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not sync your location');
        },
      });
  }

  /** Enable availability without a fresh location fix (permission is fine; device couldn't locate). */
  private enableWithoutLocation(id: string, note: string): void {
    this.users.setAvailability(id, true).subscribe({
      next: (p) => this.onActivated(p.isAvailable, 'fa-solid fa-location-dot', note),
      error: (err: Error) => {
        this.busy.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not update availability');
      },
    });
  }

  private onActivated(isAvailable: boolean, icon: string, message: string): void {
    this.isActive.set(isAvailable);
    this.busy.set(false);
    this.toast.show(icon, message);
    if (isAvailable && this.auth.currentUser()?.role === 'recipient') {
      // Says only what actually just happened. The previous wording ("new
      // surplus food is available near you to accept") announced food that
      // nothing had checked for — it fired on every toggle, so recipients came
      // to Incoming Food expecting a list and found it empty.
      this.notifications.push(
        'fa-solid fa-box-open',
        "You're accepting deliveries — we'll match you to the next pickup nearby",
      );
    }
  }
}
