import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DropOffLocation } from '@core/models/dropoff-location.model';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import type { GeoAddress } from '@core/services/geocoding.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbInput } from '@shared/ui/input/input';
import { LocationPicker } from '@shared/ui/location-picker/location-picker';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';

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
  imports: [ReactiveFormsModule, FbButton, FbInput, LocationPicker, EmptyState, ListingLayout, SummaryHeader, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      title="Drop-off Locations"
      description="Fallback points a volunteer takes food to when no NGO can be matched."
      [hasActions]="true"
      [hasAside]="true"
      [hasFilters]="false"
      gridClass=""
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

      <!-- Summary: how many points are live vs retired. -->
      <app-summary-header
        summary
        icon="fa-solid fa-map-location-dot"
        [loading]="loading()"
        loadingText="Loading drop-off locations…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ activeCount() }}</span>
          active {{ activeCount() === 1 ? 'location' : 'locations' }}
        </span>
        <span subtitle class="text-muted">
          {{ retiredCount() }} retired · {{ locations().length }} total
        </span>
      </app-summary-header>

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
              <app-location-picker
                [location]="pin()"
                [height]="200"
                placeholderText="Pin the drop-off location"
                emptyHint="Drop a pin or use your current location."
                (locationChange)="onPin($event)"
                (addressResolved)="onAddressResolved($event)"
              />
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
        <div class="grid gap-3 lg:grid-cols-2">
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
        <div class="grid gap-3 lg:grid-cols-2">
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
                <!-- Field-added spots go live without review, so make their origin obvious:
                     this badge is how an admin spots one worth retiring. "In the field" rather
                     than "by a volunteer" because self-delivering donors add them too — the
                     wire value stayed 'Volunteer', but it means "recorded during a delivery". -->
                @if (l.source === 'Volunteer') {
                  ·
                  <span class="src-tag">
                    <i class="fa-solid fa-user-plus mr-1"></i>added in the field
                  </span>
                }
              </div>
              @if (l.isActive) {
                <app-button
                  size="sm"
                  variant="danger"
                  icon="fa-solid fa-ban"
                  [block]="true"
                  [loading]="busyId() === l.id"
                  (clicked)="setActive(l, false)"
                >
                  Retire
                </app-button>
              } @else {
                <app-button
                  size="sm"
                  icon="fa-solid fa-rotate-left"
                  [block]="true"
                  [loading]="busyId() === l.id"
                  (clicked)="setActive(l, true)"
                >
                  Reactivate
                </app-button>
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

      <!-- Sticky stats aside — same shape as the donor/volunteer listing pages. -->
      <ng-container aside>
        <!-- Coverage: total points in the ring, active share highlighted. A zero
             active count is the failure state the page warns about, so surface it. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Coverage</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ locations().length }}</span>
                <span class="fb-ring-cap">points</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Active</div>
              <div
                class="font-bold text-xl"
                [class.text-primary-deep]="activeCount() > 0"
                [class.text-red-600]="activeCount() === 0"
              >
                {{ activeCount() }}
              </div>
              @if (activeCount() === 0) {
                <div class="text-red-600 text-[11px] font-semibold mt-1">
                  No fallback available
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Status share: active vs retired. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">By status</div>
          @if (locations().length) {
            <div class="flex flex-col gap-1">
              @for (b of statusBreakdown(); track b.label) {
                <div class="fb-cat-row">
                  <span class="fb-cat-icon" [style.color]="b.color">
                    <i [class]="b.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ b.label }}</span>
                  <span class="fb-cat-count">{{ b.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="b.pct" [style.background]="b.color"></span>
                  </span>
                </div>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No locations added yet.</p>
          }
        </div>

        <!-- Where they came from. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Added by</div>
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ adminAdded() }}</div>
              <div class="text-muted text-[11px]">Admin</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ fieldAdded() }}</div>
              <div class="text-muted text-[11px]">In the field</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
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
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 3 });

  protected readonly locations = signal<DropOffLocation[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly pin = signal<FbLatLng | null>(null);
  /** Id of the row whose activate/deactivate call is in flight. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly activeCount = computed(
    () => this.locations().filter((l) => l.isActive).length,
  );

  // ---- Aside stats ----
  protected readonly retiredCount = computed(
    () => this.locations().length - this.activeCount(),
  );
  /** Spots discovered while recording a delivery — by a volunteer or a self-delivering donor. */
  protected readonly fieldAdded = computed(
    () => this.locations().filter((l) => l.source === 'Volunteer').length,
  );
  protected readonly adminAdded = computed(
    () => this.locations().length - this.fieldAdded(),
  );

  protected readonly statusBreakdown = computed(() => {
    const total = this.locations().length || 1;
    return [
      {
        label: 'Active',
        icon: 'fa-solid fa-circle-check',
        color: '#059669',
        count: this.activeCount(),
        pct: Math.round((this.activeCount() / total) * 100),
      },
      {
        label: 'Retired',
        icon: 'fa-solid fa-ban',
        color: '#64748b',
        count: this.retiredCount(),
        pct: Math.round((this.retiredCount() / total) * 100),
      },
    ].filter((b) => b.count > 0);
  });

  /** Multi-segment conic gradient for the coverage donut (active vs retired). */
  protected readonly donutBackground = computed(() => {
    const total = this.locations().length;
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    let acc = 0;
    const segments = this.statusBreakdown().map((s) => {
      const start = (acc / total) * 100;
      acc += s.count;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  /** Active first, then newest — the list reads as "what's live right now". */
  protected readonly sorted = computed(() =>
    [...this.locations()].sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || b.createdAtUtc.localeCompare(a.createdAtUtc),
    ),
  );

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
  }

  /** Address fields filled from the picker's reverse-geocode of the chosen point. */
  protected onAddressResolved(a: GeoAddress): void {
    this.form.patchValue({
      address: a.address || this.form.controls.address.value,
      city: a.city || this.form.controls.city.value,
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
