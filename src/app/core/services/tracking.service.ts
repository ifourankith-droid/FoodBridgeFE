import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService } from '@core/http/api.service';
import { GeocodeResult, TrackingSnapshot } from '@core/models/tracking.model';

/**
 * Tracking / geocode endpoints (Phase 7). `snapshot` is the REST fallback for
 * `TrackingHub`'s live position updates; `geocode` resolves an address.
 */
@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly api = inject(ApiService);

  /** Last reported volunteer position for a listing (null if none yet). */
  snapshot(listingId: string): Observable<TrackingSnapshot | null> {
    return this.api.get<TrackingSnapshot | null>(API_ENDPOINTS.listings.track(listingId));
  }

  /** Convert an address to approximate lat/lng. */
  geocode(address: string): Observable<GeocodeResult> {
    return this.api.get<GeocodeResult>(API_ENDPOINTS.geocode, { address });
  }
}
