import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DropOffHotspot } from '@core/models/dropoff-location.model';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig, FbMapMarker } from '@shared/ui/map/fb-map.model';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { environment } from '@env/environment';

/** Marker colours by intensity band — see {@link Hotspots.bandOf}. */
const BAND_COLORS = {
  cooling: 'var(--fb-muted)',
  quiet: 'var(--fb-primary-bright)',
  busy: 'var(--fb-primary)',
  hottest: 'var(--fb-primary-deep)',
} as const;

type Band = keyof typeof BAND_COLORS;

/**
 * Where recipients actually are — the volunteer's map of drop-off points, sized by how much
 * food each has received, so they can see at a glance where demand concentrates before they
 * even claim a listing.
 *
 * Read-only: spots are added implicitly, by naming a new one when confirming a delivery.
 */
@Component({
  selector: 'app-hotspots',
  imports: [PageWrapper, FbMap, FbButton, EmptyState, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Recipient hotspots"
      subtitle="Where food has been delivered before — bigger, darker pins get more."
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <app-button
            variant="outline"
            size="sm"
            icon="fa-solid fa-location-crosshairs"
            [loading]="locating()"
            (clicked)="useMyLocation()"
          >
            Centre on me
          </app-button>
          @for (option of radiusOptions; track option) {
            <button
              type="button"
              class="chip"
              [class.active]="radiusKm() === option"
              (click)="setRadius(option)"
            >
              {{ option }} km
            </button>
          }
        </div>

        @if (loading()) {
          <p class="fb-help"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading hotspots…</p>
        } @else if (spots().length === 0) {
          <app-empty-state
            icon="fa-solid fa-map-location-dot"
            title="No drop-off points nearby"
            [text]="
              'Nothing within ' +
              radiusKm() +
              ' km. Widen the radius, or add a spot when you confirm your next delivery.'
            "
          />
        } @else {
          <app-fb-map [config]="mapConfig()" />

          <div class="flex flex-col gap-2">
            @for (spot of spots(); track spot.id) {
              <div class="row" [class.cooling]="spot.isCoolingDown">
                <span class="dot" [style.background]="colorOf(spot)"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold">
                    {{ spot.name }}
                    @if (spot.source === 'Volunteer') {
                      <span class="tag">found by a volunteer</span>
                    }
                  </span>
                  <span class="block truncate text-xs text-muted">
                    {{ spot.distanceKm }} km ·
                    {{ spot.totalMeals }} meals over {{ spot.deliveryCount }}
                    {{ spot.deliveryCount === 1 ? 'delivery' : 'deliveries' }}
                    @if (spot.lastDeliveredAtUtc) {
                      · last {{ spot.lastDeliveredAtUtc | date: 'd MMM, HH:mm' }}
                    }
                  </span>
                </span>
                @if (spot.isCoolingDown) {
                  <span class="pill">
                    <i class="fa-solid fa-hourglass-half mr-1"></i>
                    served recently
                  </span>
                } @else {
                  <span class="pill open">
                    <i class="fa-solid fa-circle-check mr-1"></i>
                    open
                  </span>
                }
              </div>
            }
          </div>
        }
      </div>
    </app-page-wrapper>
  `,
  styles: [
    `
      .chip {
        padding: 5px 12px;
        border: 1px solid var(--fb-line);
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        background: var(--fb-surface);
      }
      .chip.active {
        border-color: var(--fb-primary);
        background: var(--fb-primary-soft);
        color: var(--fb-primary-deep);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--fb-line);
        border-radius: 12px;
        background: var(--fb-surface);
      }
      .row.cooling {
        opacity: 0.65;
      }
      .dot {
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 999px;
      }
      .tag,
      .pill {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 700;
        background: var(--fb-line);
        color: var(--fb-muted);
      }
      .pill {
        flex: none;
      }
      .pill.open {
        background: var(--fb-success-soft);
        color: var(--fb-success-deep);
      }
    `,
  ],
})
export class Hotspots {
  private readonly dropOffs = inject(DropOffLocationService);
  private readonly geo = inject(GeolocationService);
  private readonly toast = inject(ToastService);

  protected readonly radiusOptions = [5, 10, 25, 50] as const;

  protected readonly spots = signal<DropOffHotspot[]>([]);
  protected readonly loading = signal(true);
  protected readonly locating = signal(false);
  protected readonly radiusKm = signal<number>(10);
  private readonly center = signal<FbLatLng>(environment.mapDefaultCenter);

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
    height: 340,
    markers: this.spots().map<FbMapMarker>((s) => ({
      position: { lat: s.latitude, lng: s.longitude },
      title: `${s.name} — ${s.totalMeals} meals, ${s.deliveryCount} deliveries${
        s.isCoolingDown ? ' (served recently)' : ''
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
    this.load();
  }

  protected setRadius(km: number): void {
    this.radiusKm.set(km);
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

  private load(): void {
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
