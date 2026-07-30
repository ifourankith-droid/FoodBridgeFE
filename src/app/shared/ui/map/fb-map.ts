import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  GoogleMap,
  MapDirectionsRenderer,
  MapDirectionsService,
  MapMarker,
} from '@angular/google-maps';
import { environment } from '@env/environment';
import { GoogleMapsLoaderService } from '@core/services/google-maps-loader.service';
import { ThemeService } from '@core/services/theme.service';
import { FbLatLng, FbMapConfig, FbMapMarker, FbRouteLeg, FbRouteSummary } from './fb-map.model';

/**
 * Reusable, configuration-driven Google Map.
 *
 * One `[config]` input drives three modes:
 *  - `markers` — drop a set of coloured, labelled pins.
 *  - `picker`  — a single draggable pin; emits `(locationChange)`.
 *  - `route`   — draws directions origin → (waypoints) → destination.
 *
 * When `environment.googleMapsApiKey` is empty (or the script fails), the
 * component degrades gracefully to a styled placeholder instead of erroring.
 */
@Component({
  selector: 'app-fb-map',
  imports: [GoogleMap, MapMarker, MapDirectionsRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fb-map" [style.height.px]="height()">
      @switch (loader.state()) {
        @case ('ready') {
          <google-map
            width="100%"
            [height]="height()"
            [center]="center()"
            [zoom]="zoom()"
            [options]="mapOptions()"
            (mapClick)="onMapClick($event)"
          >
            @if (mode() === 'route' && directions()) {
              <map-directions-renderer [directions]="directions()!" [options]="rendererOptions()" />
            }

            @if (mode() === 'picker') {
              <map-marker
                [position]="pickerPosition()"
                [icon]="pinIcon(brandPrimary(), '')"
                [options]="{ draggable: true }"
                (mapDragend)="onPickerDrag($event)"
              />
            }

            @for (m of markers(); track $index) {
              <map-marker
                [position]="m.position"
                [title]="m.title ?? ''"
                [icon]="pinIcon(m.color ?? brandPrimary(), m.label ?? '')"
                [options]="{ draggable: !!m.draggable }"
              />
            }
          </google-map>
        }
        @default {
          <!-- Any non-ready state keeps the faux-map skeleton (from the HTML
               sample) visible, with a translucent status badge on top. -->
          <div class="map-placeholder-screen">
            <div class="map-note">
              @switch (loader.state()) {
                @case ('no-key') {
                  <i class="fa-solid fa-map-location-dot text-2xl mb-1"></i>
                  <div class="font-semibold text-[13px]">{{ placeholderText() }}</div>
                  <div class="text-muted text-[11px] mt-0.5">
                    Add a Google Maps API key to enable the live map.
                  </div>
                }
                @case ('error') {
                  <i class="fa-solid fa-triangle-exclamation text-2xl mb-1"></i>
                  <div class="font-semibold text-[13px]">{{ placeholderText() }}</div>
                  <div class="text-muted text-[11px] mt-0.5">
                    Map failed to load — check the API key.
                  </div>
                }
                @default {
                  <span class="map-spinner mb-1" aria-hidden="true"></span>
                  <div class="font-semibold text-[13px]">{{ placeholderText() }}</div>
                  <div class="text-muted text-[11px] mt-0.5">Loading map…</div>
                }
              }
            </div>
          </div>
        }
      }

      @if (config().showEta && (distanceLabel() || etaLabel())) {
        <div class="map-eta">
          @if (distanceLabel()) {
            <div class="font-bold text-[13px]">
              <i class="fa-solid fa-route mr-1 text-primary"></i>{{ distanceLabel() }}
            </div>
          }
          @if (etaLabel()) {
            <div class="text-muted text-[11px]">{{ etaLabel() }}</div>
          }
        </div>
      }

      @if (config().showLegend && legend().length) {
        <div class="map-legend">
          @for (item of legend(); track $index) {
            <div class="legend-row">
              <span class="dot" [style.background]="item.color"></span>{{ item.text }}
            </div>
          }
          @if (config().openInMapsLink) {
            <a
              class="btn-fb w-full mt-2 !py-1.5 !text-[11px]"
              [href]="config().openInMapsLink"
              target="_blank"
              rel="noopener"
            >
              <i class="fa-solid fa-up-right-from-square mr-1"></i>Open in Google Maps
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .fb-map {
      position: relative;
      border-radius: var(--fb-radius);
      overflow: hidden;
      border: 1px solid var(--fb-line);
      /* Faux-map backdrop (from the HTML sample) shown behind every state. */
      background:
        radial-gradient(circle at 20% 30%, rgba(30, 158, 92, 0.1), transparent 45%),
        radial-gradient(circle at 80% 75%, rgb(var(--fb-accent-rgb) / 0.12), transparent 45%),
        linear-gradient(135deg, #eef3ef, #f6efe9);
      background-color: #eef3ef;
    }
    /* Faux street grid — the sample's .fb-map::before. */
    .fb-map::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      background-image:
        linear-gradient(rgba(122, 111, 101, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(122, 111, 101, 0.12) 1px, transparent 1px);
      background-size: 46px 46px;
    }
    /* The live map must paint above the faux grid backdrop. */
    google-map {
      position: relative;
      z-index: 1;
      display: block;
    }
    /* Placeholder shown for every non-ready state (loading / no-key / error):
       the faux-map grid stays visible with a translucent note on top. */
    .map-placeholder-screen {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .map-note {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      max-width: 260px;
      padding: 16px 20px;
      color: var(--fb-primary-deep);
      background: color-mix(in srgb, var(--fb-surface) 90%, transparent);
      backdrop-filter: blur(8px);
      border: 1px solid var(--fb-line);
      border-radius: 16px;
      box-shadow: var(--fb-shadow);
    }
    .map-spinner {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2.5px solid var(--fb-primary-soft);
      border-top-color: var(--fb-primary);
      animation: fb-map-spin 0.7s linear infinite;
    }
    @keyframes fb-map-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .map-spinner {
        animation-duration: 2s;
      }
    }
    .map-eta,
    .map-legend {
      position: absolute;
      z-index: 3;
      background: color-mix(in srgb, var(--fb-surface) 92%, transparent);
      backdrop-filter: blur(8px);
      border: 1px solid var(--fb-line);
      border-radius: 14px;
      box-shadow: var(--fb-shadow);
    }
    .map-eta {
      right: 16px;
      top: 16px;
      padding: 10px 14px;
      font-size: 12px;
    }
    .map-legend {
      left: 16px;
      bottom: 16px;
      padding: 12px 14px;
      max-width: 240px;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 500;
    }
    .legend-row + .legend-row {
      margin-top: 7px;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `,
})
export class FbMap {
  protected readonly loader = inject(GoogleMapsLoaderService);
  private readonly directionsService = inject(MapDirectionsService);

  /** Pins are baked into an SVG data URI, so they need a literal hex rather
   *  than a CSS var. This signal re-emits when the brand palette changes. */
  private readonly theme = inject(ThemeService);
  protected readonly brandPrimary = this.theme.primaryHex;

  readonly config = input<FbMapConfig>({});
  /** Emits the chosen coordinates in `picker` mode (drag or click). */
  readonly locationChange = output<FbLatLng>();
  /** Emits totals + per-leg distance/duration once `route` mode resolves (null on failure). */
  readonly routeResolved = output<FbRouteSummary | null>();

  protected readonly mode = computed(() => this.config().mode ?? 'markers');
  protected readonly zoom = computed(() => this.config().zoom ?? environment.mapDefaultZoom);
  protected readonly height = computed(() => this.config().height ?? 440);
  protected readonly markers = computed<FbMapMarker[]>(() => this.config().markers ?? []);
  protected readonly legend = computed(() => this.config().legend ?? []);
  /** Distance/ETA overlays fall back to what Google actually returned for the route. */
  protected readonly distanceLabel = computed(
    () => this.config().distanceLabel ?? this.summary()?.distanceText ?? '',
  );
  protected readonly etaLabel = computed(() => {
    const explicit = this.config().etaLabel;
    if (explicit != null) {
      return explicit;
    }
    const s = this.summary();
    return s ? `Est. ${s.durationText}` : '';
  });
  protected readonly placeholderText = computed(
    () => this.config().placeholderText ?? 'Map preview',
  );

  protected readonly center = computed<google.maps.LatLngLiteral>(() => {
    const c = this.config().center ?? this.config().initialLocation ?? environment.mapDefaultCenter;
    return { lat: c.lat, lng: c.lng };
  });

  protected readonly mapOptions = computed<google.maps.MapOptions>(() => ({
    disableDefaultUI: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
  }));

  /** Current picker marker position (starts at initialLocation / center). */
  protected readonly pickerPosition = signal<google.maps.LatLngLiteral>({ lat: 0, lng: 0 });

  /** Computed directions result for `route` mode. */
  protected readonly directions = signal<google.maps.DirectionsResult | null>(null);
  /** Distance/duration of the resolved route, used for the auto ETA overlay. */
  private readonly summary = signal<FbRouteSummary | null>(null);

  protected readonly rendererOptions = computed<google.maps.DirectionsRendererOptions>(() => ({
    suppressMarkers: this.config().suppressRouteMarkers ?? false,
    polylineOptions: {
      strokeColor: this.config().routeColor ?? this.brandPrimary(),
      strokeWeight: 5,
      strokeOpacity: 0.85,
    },
  }));

  constructor() {
    // Kick off the API load as soon as the component is created.
    this.loader.load();

    // Keep the picker marker in sync with config until the user moves it.
    effect(() => {
      const start = this.config().initialLocation ?? this.config().center;
      if (start) {
        this.pickerPosition.set({ lat: start.lat, lng: start.lng });
      }
    });

    // Compute directions once the API is ready and we're in route mode.
    effect(() => {
      if (this.loader.state() !== 'ready' || this.mode() !== 'route') {
        return;
      }
      const route = this.config().route;
      if (!route) {
        return;
      }
      const request: google.maps.DirectionsRequest = {
        origin: route.origin,
        destination: route.destination,
        waypoints: (route.waypoints ?? []).map((p) => ({ location: p, stopover: true })),
        travelMode:
          (this.config().travelMode as google.maps.TravelMode) ??
          ('DRIVING' as google.maps.TravelMode),
      };
      this.directionsService.route(request).subscribe((res) => {
        const result = res.result ?? null;
        this.directions.set(result);
        const summary = this.summarise(result);
        this.summary.set(summary);
        this.routeResolved.emit(summary);
      });
    });
  }

  /** Fold the first route's legs into per-leg + total distance/duration. */
  private summarise(result: google.maps.DirectionsResult | null): FbRouteSummary | null {
    const rawLegs = result?.routes?.[0]?.legs;
    if (!rawLegs?.length) {
      return null;
    }
    const legs: FbRouteLeg[] = rawLegs.map((leg) => ({
      distanceText: leg.distance?.text ?? '—',
      durationText: leg.duration?.text ?? '—',
      distanceMeters: leg.distance?.value ?? 0,
      durationSeconds: leg.duration?.value ?? 0,
    }));
    const distanceMeters = legs.reduce((sum, l) => sum + l.distanceMeters, 0);
    const durationSeconds = legs.reduce((sum, l) => sum + l.durationSeconds, 0);
    return {
      legs,
      distanceMeters,
      durationSeconds,
      distanceText: this.formatDistance(distanceMeters),
      durationText: this.formatDuration(durationSeconds),
    };
  }

  private formatDistance(meters: number): string {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  private formatDuration(seconds: number): string {
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
  }

  protected onMapClick(event: google.maps.MapMouseEvent | google.maps.IconMouseEvent): void {
    if (this.mode() !== 'picker' || this.config().clickToPlace === false) {
      return;
    }
    const latLng = event.latLng;
    if (latLng) {
      this.setPicker({ lat: latLng.lat(), lng: latLng.lng() });
    }
  }

  protected onPickerDrag(event: google.maps.MapMouseEvent): void {
    const latLng = event.latLng;
    if (latLng) {
      this.setPicker({ lat: latLng.lat(), lng: latLng.lng() });
    }
  }

  private setPicker(pos: FbLatLng): void {
    this.pickerPosition.set(pos);
    this.locationChange.emit(pos);
  }

  /** Build a coloured teardrop pin (with an optional letter) as an SVG data URI. */
  protected pinIcon(color: string, label: string): string {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='48' viewBox='0 0 36 48'>` +
      `<path d='M18 0C8.1 0 0 8.1 0 18c0 12.6 18 30 18 30s18-17.4 18-30C36 8.1 27.9 0 18 0z' ` +
      `fill='${color}' stroke='white' stroke-width='2'/>` +
      `<circle cx='18' cy='17.5' r='11' fill='white' opacity='0.22'/>` +
      (label
        ? `<text x='18' y='23' font-family='Arial, sans-serif' font-size='15' font-weight='700' ` +
        `fill='white' text-anchor='middle'>${label}</text>`
        : `<circle cx='18' cy='17.5' r='5' fill='white'/>`) +
      `</svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }
}
