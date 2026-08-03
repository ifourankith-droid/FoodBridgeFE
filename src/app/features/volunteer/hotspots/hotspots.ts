import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DropOffHotspot } from '@core/models/dropoff-location.model';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig, FbMapMarker } from '@shared/ui/map/fb-map.model';
import { environment } from '@env/environment';

/**
 * Marker colours by intensity band — a fixed heat ramp (grey → amber → orange → red),
 * see {@link Hotspots.bandOf}. Concrete hex, not CSS vars: the map bakes the colour into
 * an SVG data-URI pin where `var(--…)` would never resolve, so the pins came out black.
 */
const BAND_COLORS = {
  cooling: '#94a3b8',
  quiet: '#f59e0b',
  busy: '#f97316',
  hottest: '#dc2626',
} as const;

type Band = keyof typeof BAND_COLORS;

/** Radius choices for the custom select. */
const RADIUS_OPTIONS: readonly FbSelectOption[] = [
  { value: 5, label: 'Within 5 km', icon: 'fa-solid fa-circle-dot' },
  { value: 10, label: 'Within 10 km', icon: 'fa-solid fa-circle-dot' },
  { value: 25, label: 'Within 25 km', icon: 'fa-solid fa-circle-dot' },
  { value: 50, label: 'Within 50 km', icon: 'fa-solid fa-circle-dot' },
];

/**
 * Where recipients actually are — the volunteer's map of drop-off points, sized by how much
 * food each has received, so they can see at a glance where demand concentrates before they
 * even claim a listing.
 *
 * Read-only: spots are added implicitly, by naming a new one when confirming a delivery.
 */
@Component({
  selector: 'app-hotspots',
  imports: [ReactiveFormsModule, ListingLayout, FbSelect, FbMap, FbButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'Recipient hotspots'"
      description="Where food has been delivered before — bigger, darker pins get more."
      [hasActions]="true"
      [hasAside]="true"
      [loading]="loading()"
      [empty]="!spots().length"
      gridClass="sm:grid-cols-2"
      emptyIcon="fa-solid fa-fire"
      [emptyTitle]="'No hotspots within ' + radiusKm() + ' km'"
      emptyText="Widen the radius, or add a spot when you confirm your next delivery."
    >
      <ng-container pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-location-crosshairs"
          [loading]="locating()"
          (clicked)="useMyLocation()"
        >
          Centre on me
        </app-button>
        <app-button icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
      </ng-container>

      <!-- Summary: how many spots + total food delivered across them. -->
      <div summary class="flex items-center gap-3">
        <div class="stat-icon !mb-0 bg-gradient-primary">
          <i class="fa-solid fa-fire"></i>
        </div>
        <div class="min-w-0">
          <div class="font-bold">
            <span class="text-primary-deep text-2xl">{{ spots().length }}</span>
            drop-off {{ spots().length === 1 ? 'point' : 'points' }} within {{ radiusKm() }} km
          </div>
          <div class="text-muted text-xs mt-0.5">
            {{ totalMeals() }} meals delivered · {{ totalDeliveries() }} deliveries
          </div>
        </div>
      </div>

      <!-- Header control: the radius as a custom single-select. -->
      <app-select
        filters
        icon="fa-solid fa-location-crosshairs"
        [searchable]="false"
        [options]="radiusOptions"
        [formControl]="radiusControl"
      />

      <!-- Main: the hotspots as a grid of cards. -->
      @for (spot of spots(); track spot.id) {
        <div class="card-fb p-4 flex flex-col gap-3" [class.opacity-70]="spot.isCoolingDown">
          <div class="spot-head">
            <span class="spot-dot" [style.background]="colorOf(spot)" [title]="bandLabel(spot)"></span>
            <span class="spot-name truncate">{{ spot.name }}</span>
            @if (spot.isCoolingDown) {
              <span class="badge badge-cooling">
                <i class="fa-solid fa-hourglass-half"></i>Recently served
              </span>
            } @else {
              <span class="badge badge-open">
                <i class="fa-solid fa-circle-check"></i>Open
              </span>
            }
          </div>

          <div class="spot-stats">
            <div class="stat">
              <i class="stat-ic fa-solid fa-utensils" aria-hidden="true"></i>
              <span class="stat-num">{{ spot.totalMeals }}</span>
              <span class="stat-lbl">meals</span>
            </div>
            <div class="stat">
              <i class="stat-ic fa-solid fa-box-open" aria-hidden="true"></i>
              <span class="stat-num">{{ spot.deliveryCount }}</span>
              <span class="stat-lbl">{{ spot.deliveryCount === 1 ? 'delivery' : 'deliveries' }}</span>
            </div>
            <div class="stat">
              <i class="stat-ic fa-solid fa-route" aria-hidden="true"></i>
              <span class="stat-num">{{ spot.distanceKm }}</span>
              <span class="stat-lbl">km away</span>
            </div>
          </div>

          @if (spot.source === 'Volunteer') {
            <div class="spot-foot">
              <span class="badge badge-found">
                <i class="fa-solid fa-user-plus"></i>Added by a volunteer
              </span>
              @if (spot.addedByName) {
                <span class="spot-by"><i class="fa-solid fa-user"></i>{{ spot.addedByName }}</span>
              }
            </div>
          }
        </div>
      }

      <!-- Aside: the map, plus a shortcut to recentre on the volunteer. -->
      <ng-container aside>
        <div class="card-fb p-4">
          <div class="font-bold text-sm mb-3">Hotspot map</div>
          <app-fb-map [config]="mapConfig()" />
          <app-button
            class="mt-3 block"
            variant="outline"
            size="sm"
            icon="fa-solid fa-location-crosshairs"
            [block]="true"
            [loading]="locating()"
            (clicked)="useMyLocation()"
          >
            Use my current location
          </app-button>
        </div>

        <!-- Counts below the map. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">At a glance</div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ spots().length }}</div>
              <div class="text-muted text-[11px]">Spots</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ totalMeals() }}</div>
              <div class="text-muted text-[11px]">Meals</div>
            </div>
            <div>
              <div class="fb-impact-num text-success-deep">{{ openCount() }}</div>
              <div class="text-muted text-[11px]">Open now</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: [
    `
      /* The radius select sits in the layout's filter row — keep it a sensible width
         rather than stretching the whole column. */
      app-select {
        flex: 0 1 240px;
        max-width: 240px;
      }
      /* ---- Hotspot card content (the card frame is the shared .card-fb) ---- */
      .spot-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .spot-dot {
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
      }
      .spot-name {
        flex: 1;
        min-width: 0;
        font-weight: 700;
        font-size: 14px;
        color: var(--fb-ink);
      }

      /* Three-up mini stats, each with an icon. */
      .spot-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid var(--fb-line);
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.1;
      }
      .stat-ic {
        font-size: 12px;
        color: var(--fb-muted);
        margin-bottom: 5px;
      }
      .stat-num {
        font-size: 17px;
        font-weight: 800;
        color: var(--fb-primary-deep);
      }
      .stat-lbl {
        margin-top: 2px;
        font-size: 10.5px;
        color: var(--fb-muted);
      }

      /* ---- Badges ---- */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex: none;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .badge-open {
        background: var(--fb-success-soft, rgba(30, 158, 92, 0.12));
        color: var(--fb-success-deep);
      }
      .badge-cooling {
        background: rgba(245, 158, 11, 0.14);
        color: #b45309;
      }
      body.dark .badge-cooling {
        color: #fbbf24;
      }
      .badge-found {
        background: var(--fb-primary-soft);
        color: var(--fb-primary-deep);
      }

      /* Footer: "added by a volunteer" badge on the left, their name on the right. */
      .spot-foot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--fb-line);
      }
      .spot-by {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--fb-ink);
      }
      .spot-by i {
        color: var(--fb-muted);
      }
    `,
  ],
})
export class Hotspots {
  private readonly dropOffs = inject(DropOffLocationService);
  private readonly geo = inject(GeolocationService);
  private readonly toast = inject(ToastService);

  protected readonly radiusOptions = RADIUS_OPTIONS;
  protected readonly radiusControl = new FormControl<number>(10, { nonNullable: true });

  protected readonly spots = signal<DropOffHotspot[]>([]);
  protected readonly loading = signal(true);
  protected readonly locating = signal(false);
  protected readonly radiusKm = signal<number>(10);
  private readonly center = signal<FbLatLng>(environment.mapDefaultCenter);

  protected readonly totalMeals = computed(() =>
    this.spots().reduce((sum, s) => sum + s.totalMeals, 0),
  );
  protected readonly totalDeliveries = computed(() =>
    this.spots().reduce((sum, s) => sum + s.deliveryCount, 0),
  );
  /** Spots not in cooldown — available to receive a delivery right now. */
  protected readonly openCount = computed(() => this.spots().filter((s) => !s.isCoolingDown).length);

  /**
   * Busiest spot's delivery count, used to scale the intensity bands. Relative rather than
   * absolute thresholds so the map stays readable whether the busiest place has had 3
   * deliveries or 300.
   */
  private readonly peak = computed(() =>
    this.spots().reduce((max, s) => Math.max(max, s.deliveryCount), 0),
  );

  protected readonly mapConfig = computed<FbMapConfig>(() => ({
    mode: 'markers',
    center: this.center(),
    zoom: this.radiusKm() <= 5 ? 13 : this.radiusKm() <= 10 ? 12 : 10,
    height: 320,
    markers: this.spots().map<FbMapMarker>((s) => ({
      position: { lat: s.latitude, lng: s.longitude },
      title: `${s.name} — ${s.totalMeals} meals, ${s.deliveryCount} deliveries${s.isCoolingDown ? ' (served recently)' : ''
        }`,
      color: this.colorOf(s),
    })),
    showLegend: true,
    legend: [
      { color: BAND_COLORS.hottest, text: 'Most deliveries' },
      { color: BAND_COLORS.busy, text: 'Regular' },
      { color: BAND_COLORS.quiet, text: 'Occasional / new' },
      { color: BAND_COLORS.cooling, text: 'Served recently' },
    ],
    placeholderText: 'Add a Google Maps API key to see the hotspot map.',
  }));

  constructor() {
    this.radiusControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((km) => {
      this.radiusKm.set(km);
      this.load();
    });
    this.load();
  }

  protected useMyLocation(): void {
    this.locating.set(true);
    this.geo.current().subscribe({
      next: (loc) => {
        this.center.set(loc);
        this.locating.set(false);
        this.load();
      },
      error: (err: Error) => {
        this.locating.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not get your location');
      },
    });
  }

  protected colorOf(spot: DropOffHotspot): string {
    return BAND_COLORS[this.bandOf(spot)];
  }

  /** Human label for a spot's intensity band — the dot's tooltip, mirrors the map legend. */
  protected bandLabel(spot: DropOffHotspot): string {
    switch (this.bandOf(spot)) {
      case 'hottest':
        return 'Most deliveries';
      case 'busy':
        return 'Regular';
      case 'cooling':
        return 'Served recently';
      default:
        return 'Occasional / new';
    }
  }

  /** Cooling spots read as grey regardless of intensity — availability outranks volume here. */
  private bandOf(spot: DropOffHotspot): Band {
    if (spot.isCoolingDown) {
      return 'cooling';
    }
    const peak = this.peak();
    if (peak === 0 || spot.deliveryCount === 0) {
      return 'quiet';
    }
    const share = spot.deliveryCount / peak;
    return share >= 0.66 ? 'hottest' : share >= 0.33 ? 'busy' : 'quiet';
  }

  protected load(): void {
    this.loading.set(true);
    const { lat, lng } = this.center();
    this.dropOffs.hotspots(lat, lng, this.radiusKm()).subscribe({
      next: (spots) => {
        this.spots.set(spots);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load hotspots');
      },
    });
  }
}
