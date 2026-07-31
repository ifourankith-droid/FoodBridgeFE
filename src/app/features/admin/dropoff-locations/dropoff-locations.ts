import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '@env/environment';
import { DropOffLocation } from '@core/models/dropoff-location.model';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import { GeocodingService } from '@core/services/geocoding.service';
import { GeolocationError, GeolocationService } from '@core/services/geolocation.service';
import { LocationPermissionService } from '@core/services/location-permission.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbInput } from '@shared/ui/input/input';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig } from '@shared/ui/map/fb-map.model';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

/**
 * Admin CRUD for the fallback drop-off points.
 *
 * Worth knowing why this page exists: when a volunteer confirms pickup and the
 * backend's `RecipientMatcher` finds no eligible NGO, it looks for the nearest
 * **active** row here and returns it as the listing's `suggestedDropOffLocation`.
 * With this table empty the fallback silently never fires and the volunteer is
 * left holding food with nowhere to take it — so the page leads with that.
 */
@Component({
  selector: 'app-dropoff-locations',
  imports: [ReactiveFormsModule, FbButton, FbInput, FbMap, EmptyState, PageWrapper, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Drop-off Locations"
      description="Fallback points a volunteer takes food to when no NGO can be matched."
      [hasActions]="true"
    >
      <ng-container pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
        <app-button
          [icon]="formOpen() ? 'fa-solid fa-xmark' : 'fa-solid fa-circle-plus'"
          [variant]="formOpen() ? 'ghost' : 'solid'"
          (clicked)="toggleForm()"
        >
          {{ formOpen() ? 'Cancel' : 'Add location' }}
        </app-button>
      </ng-container>

      <!-- The whole point of the table: no active rows → no fallback. Say so. -->
      @if (!loading() && !activeCount()) {
        <div class="warn-strip mb-4">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>No active drop-off point.</strong>
            When a volunteer collects food and no NGO can be matched, the backend has
            nowhere to send them. Add at least one active location.
          </div>
        </div>
      }

      @if (formOpen()) {
        <div class="card-fb p-5 mb-4">
          <h6 class="section-title">New drop-off location</h6>
          <div class="grid gap-4 lg:grid-cols-2 items-start">
            <div>
              <div class="small-label mb-2">Pin the location</div>
              <app-fb-map class="block mb-3" [config]="mapConfig()" (locationChange)="onPin($event)" />
              <app-button
                variant="outline"
                icon="fa-solid fa-location-crosshairs"
                [block]="true"
                [loading]="geoBusy()"
                (clicked)="captureGps()"
              >
                Use current location
              </app-button>
              @if (pin(); as p) {
                <p class="coords">
                  <i class="fa-solid fa-location-dot mr-1.5"></i>{{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}
                </p>
              } @else {
                <p class="coords is-empty">
                  <i class="fa-solid fa-circle-info mr-1.5"></i>Drop a pin or use your current location.
                </p>
              }
            </div>

            <form [formGroup]="form" class="grid gap-3" fbAutofocus>
              <app-input
                label="Name"
                formControlName="name"
                placeholder="e.g. Ellis Bridge Community Fridge"
                [required]="true"
                [maxlength]="200"
                hint="How volunteers will see it on their delivery card."
                [error]="err('name')"
              />
              <app-input
                label="Address"
                formControlName="address"
                placeholder="e.g. Ashram Road, Ellisbridge"
                [required]="true"
                [maxlength]="500"
                hint="Auto-filled from the pin — edit if it needs more detail."
                [error]="err('address')"
              />
              <app-input label="City" formControlName="city" placeholder="City" [maxlength]="100" />
              <div class="flex gap-2 mt-1">
                <app-button icon="fa-solid fa-check" [loading]="saving()" (clicked)="save()">
                  Save location
                </app-button>
                <app-button variant="ghost" (clicked)="toggleForm()">Cancel</app-button>
              </div>
            </form>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (s of skeletons; track $index) {
            <div class="card-fb p-4">
              <div class="skeleton h-4 w-40 mb-2"></div>
              <div class="skeleton h-3 w-full mb-1.5"></div>
              <div class="skeleton h-3 w-24 mb-4"></div>
              <div class="skeleton h-8 w-full"></div>
            </div>
          }
        </div>
      } @else if (locations().length) {
        <div class="mb-3 text-muted text-xs">
          {{ activeCount() }} active · {{ locations().length - activeCount() }} retired
        </div>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (l of sorted(); track l.id) {
            <div class="card-fb p-4" [class.is-retired]="!l.isActive">
              <div class="flex items-start gap-2 mb-2">
                <div class="loc-pin" [style.background]="l.isActive ? 'var(--fb-primary)' : 'var(--fb-muted)'">
                  <i class="fa-solid fa-box-open"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">{{ l.name }}</div>
                  <div class="text-muted text-xs truncate">{{ l.address }}</div>
                </div>
                <span class="badge-fb" [class]="l.isActive ? 'badge-confirmed' : 'badge-expired'">
                  {{ l.isActive ? 'Active' : 'Retired' }}
                </span>
              </div>
              <div class="text-muted text-xs mb-3">
                @if (l.city) {
                  <i class="fa-solid fa-city mr-1"></i>{{ l.city }} ·
                }
                <i class="fa-solid fa-location-crosshairs mr-1"></i>{{ l.latitude.toFixed(4) }}, {{ l.longitude.toFixed(4) }}
                <!-- Volunteer-added spots go live without review, so make their origin
                     obvious: this badge is how an admin spots one worth retiring. -->
                @if (l.source === 'Volunteer') {
                  ·
                  <span class="src-tag">
                    <i class="fa-solid fa-user-plus mr-1"></i>added by a volunteer
                  </span>
                }
              </div>
              @if (l.isActive) {
                <button
                  class="btn-fb-outline w-full !py-2 !text-sm !text-red-600"
                  [disabled]="busyId() === l.id"
                  (click)="setActive(l, false)"
                >
                  <i class="fa-solid mr-1" [class]="busyId() === l.id ? 'fa-spinner fa-spin' : 'fa-ban'"></i>Retire
                </button>
              } @else {
                <button
                  class="btn-fb w-full !py-2 !text-sm"
                  [disabled]="busyId() === l.id"
                  (click)="setActive(l, true)"
                >
                  <i class="fa-solid mr-1" [class]="busyId() === l.id ? 'fa-spinner fa-spin' : 'fa-rotate-left'"></i>Reactivate
                </button>
              }
            </div>
          }
        </div>
      } @else {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-box-open"
            title="No drop-off locations yet"
            text="Add the places volunteers can leave food when no NGO is available to receive it."
            actionLabel="Add location"
            actionIcon="fa-solid fa-circle-plus"
            (action)="toggleForm()"
          />
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    .warn-strip {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(220, 38, 38, 0.28);
      background: rgba(220, 38, 38, 0.07);
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--fb-text);
    }
    .warn-strip i {
      margin-top: 2px;
      color: #dc2626;
    }
    .src-tag {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
      font-weight: 700;
    }
    .loc-pin {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      flex-shrink: 0;
    }
    .card-fb.is-retired {
      opacity: 0.68;
    }
    .coords {
      margin: 10px 0 0;
      font-size: 11.5px;
      color: var(--fb-muted);
      font-variant-numeric: tabular-nums;
    }
    .coords.is-empty {
      font-variant-numeric: normal;
    }
  `,
})
export class DropOffLocations {
  private readonly service = inject(DropOffLocationService);
  private readonly geolocation = inject(GeolocationService);
  private readonly locationPermission = inject(LocationPermissionService);
  private readonly geocoding = inject(GeocodingService);
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 3 });

  protected readonly locations = signal<DropOffLocation[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly geoBusy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly pin = signal<FbLatLng | null>(null);
  /** Id of the row whose activate/deactivate call is in flight. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly activeCount = computed(
    () => this.locations().filter((l) => l.isActive).length,
  );

  /** Active first, then newest — the list reads as "what's live right now". */
  protected readonly sorted = computed(() =>
    [...this.locations()].sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || b.createdAtUtc.localeCompare(a.createdAtUtc),
    ),
  );

  protected readonly mapConfig = computed<FbMapConfig>(() => ({
    mode: 'picker',
    height: 240,
    zoom: 15,
    initialLocation: this.pin() ?? environment.mapDefaultCenter,
    clickToPlace: true,
    placeholderText: 'Pin the drop-off location',
  }));

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    address: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
  });

  constructor() {
    this.load();
  }

  protected err(field: 'name' | 'address'): string {
    const control = this.form.controls[field];
    if (!control.touched || control.valid) {
      return '';
    }
    return control.hasError('required')
      ? `${field === 'name' ? 'Name' : 'Address'} is required`
      : 'That value is too long';
  }

  protected load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => {
        this.locations.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.error(err.message || 'Could not load drop-off locations');
      },
    });
  }

  protected toggleForm(): void {
    const open = !this.formOpen();
    this.formOpen.set(open);
    if (!open) {
      this.form.reset();
      this.pin.set(null);
    }
  }

  protected onPin(loc: FbLatLng): void {
    this.pin.set(loc);
    this.reverseFill(loc);
  }

  protected captureGps(): void {
    this.geoBusy.set(true);
    this.geolocation.current().subscribe({
      next: (loc) => {
        this.pin.set(loc);
        this.reverseFill(loc, () => this.geoBusy.set(false));
      },
      error: (err: GeolocationError) => {
        this.geoBusy.set(false);
        if (err.denied) {
          // Blocked → same "Turn on location" modal the go-active flow uses, and
          // re-capture if the user enables it and hits "Try again".
          this.locationPermission.prompt('Turn on location to autofill the address').then((retry) => {
            if (retry) {
              this.captureGps();
            }
          });
        } else {
          this.toast.warning(err.message || 'Could not read your location — drop a pin instead.');
        }
      },
    });
  }

  /** Best-effort address autofill; a failure just leaves the fields for the admin. */
  private reverseFill(loc: FbLatLng, done?: () => void): void {
    this.geocoding.reverseGeocode(loc.lat, loc.lng).subscribe({
      next: (a) => {
        done?.();
        this.form.patchValue({
          address: a.address || this.form.controls.address.value,
          city: a.city || this.form.controls.city.value,
        });
      },
      error: () => done?.(),
    });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const loc = this.pin();
    if (this.form.invalid) {
      this.toast.warning('Add a name and an address first');
      return;
    }
    if (!loc) {
      this.toast.warning('Drop a pin or use your current location');
      return;
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service
      .create({
        name: v.name.trim(),
        address: v.address.trim(),
        latitude: loc.lat,
        longitude: loc.lng,
        city: v.city.trim() || null,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.locations.update((list) => [created, ...list]);
          this.formOpen.set(false);
          this.form.reset();
          this.pin.set(null);
          this.toast.success(`“${created.name}” added`);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.toast.error(err.message || 'Could not save the location');
        },
      });
  }

  /** Retire or reactivate — the backend has no DELETE, so this is the lifecycle. */
  protected setActive(l: DropOffLocation, active: boolean): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(l.id);
    const request$ = active ? this.service.activate(l.id) : this.service.deactivate(l.id);
    request$.subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.locations.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.toast.success(`“${updated.name}” ${active ? 'reactivated' : 'retired'}`);
      },
      error: (err: Error) => {
        this.busyId.set(null);
        this.toast.error(err.message || 'Could not update the location');
      },
    });
  }
}
