import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig } from '@shared/ui/map/fb-map.model';

/**
 * Route map (volunteer → pickup → drop-off). Thin, opinionated wrapper around
 * the reusable {@link FbMap}: it fixes the `route` mode + A/B/C legend and
 * exposes only the labels/coordinates a caller usually wants to override.
 */
@Component({
  selector: 'app-route-map',
  imports: [FbMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-fb-map [config]="config()" />`,
})
export class RouteMap {
  readonly pickup = input('Riverside Banquet Hall');
  readonly drop = input('Hope Community Kitchen');
  readonly distance = input('4.5 km total');
  readonly eta = input('Est. ~18 min by bike');
  readonly height = input(440);

  // Demo coordinates around Ahmedabad: A = volunteer, B = pickup, C = drop-off.
  readonly me = input<FbLatLng>({ lat: 23.0225, lng: 72.5714 });
  readonly pick = input<FbLatLng>({ lat: 23.0395, lng: 72.566 });
  readonly dropc = input<FbLatLng>({ lat: 23.01, lng: 72.596 });

  protected readonly config = computed<FbMapConfig>(() => ({
    mode: 'route',
    height: this.height(),
    route: {
      origin: this.me(),
      destination: this.dropc(),
      waypoints: [this.pick()],
    },
    travelMode: 'BICYCLING',
    showEta: true,
    distanceLabel: this.distance(),
    etaLabel: this.eta(),
    showLegend: true,
    legend: [
      { color: '#2258c7', text: 'A · You' },
      { color: 'var(--fb-orange)', text: `B · ${this.pickup()}` },
      { color: 'var(--fb-success)', text: `C · ${this.drop()}` },
    ],
    openInMapsLink:
      `https://www.google.com/maps/dir/` +
      `${this.me().lat},${this.me().lng}/` +
      `${this.pick().lat},${this.pick().lng}/` +
      `${this.dropc().lat},${this.dropc().lng}`,
    placeholderText: 'Route preview',
  }));
}
