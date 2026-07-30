/** Configuration contract for the reusable {@link FbMap} component. */

export interface FbLatLng {
  lat: number;
  lng: number;
}

export type FbMapMode = 'markers' | 'picker' | 'route';

export type FbTravelMode = 'DRIVING' | 'BICYCLING' | 'WALKING' | 'TRANSIT';

export interface FbMapMarker {
  position: FbLatLng;
  /** Short glyph shown inside the pin, e.g. 'A'. */
  label?: string;
  /** Tooltip / accessible title. */
  title?: string;
  /** Pin fill colour (any CSS colour). Defaults to the brand primary. */
  color?: string;
  draggable?: boolean;
}

export interface FbMapLegendItem {
  color: string;
  text: string;
}

/** One origin→destination hop of a resolved route (i.e. between two stops). */
export interface FbRouteLeg {
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
}

/** Totals + per-leg breakdown of a resolved `route`-mode request. */
export interface FbRouteSummary extends FbRouteLeg {
  legs: FbRouteLeg[];
}

/**
 * A single object drives every map instance. Only `mode` is really needed;
 * everything else has sensible defaults, so callers configure just what they
 * care about (a picker needs `center`; a route needs `route`; etc.).
 */
export interface FbMapConfig {
  mode?: FbMapMode;
  center?: FbLatLng;
  zoom?: number;
  /** Map height in pixels. */
  height?: number;

  /** `markers` mode — static points to drop on the map. */
  markers?: FbMapMarker[];

  /** `route` mode — origin/destination (+ optional waypoints) for directions. */
  route?: {
    origin: FbLatLng;
    destination: FbLatLng;
    waypoints?: FbLatLng[];
  };
  travelMode?: FbTravelMode;
  /** `route` mode — hide the renderer's own A/B/C pins so custom `markers` show through. */
  suppressRouteMarkers?: boolean;
  /** `route` mode — polyline colour (defaults to the brand primary). */
  routeColor?: string;

  /** `picker` mode — starting marker; omit to start at `center`. */
  initialLocation?: FbLatLng;
  /** Allow clicking the map to reposition the picker marker (default true). */
  clickToPlace?: boolean;

  /** Overlays (all optional). */
  showEta?: boolean;
  distanceLabel?: string;
  etaLabel?: string;
  showLegend?: boolean;
  legend?: FbMapLegendItem[];
  openInMapsLink?: string;

  /** Fallback placeholder text shown when the API key is missing. */
  placeholderText?: string;
}
