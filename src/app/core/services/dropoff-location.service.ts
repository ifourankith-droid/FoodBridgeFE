import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import {
  CreateDropOffLocationBody,
  DropOffHotspot,
  DropOffLocation,
} from '@core/models/dropoff-location.model';

/**
 * The shared pool of drop-off points.
 *
 * CRUD here is `AdminOnly`; volunteers read {@link hotspots} instead, and add spots
 * implicitly by naming a new one when they confirm a delivery (see
 * `ListingService.confirmDelivery`). There is no DELETE endpoint, so `deactivate` is
 * how a location is retired.
 */
@Injectable({ providedIn: 'root' })
export class DropOffLocationService {
  private readonly api = inject(ApiService);

  list(page = 1, pageSize = 50): Observable<DropOffLocation[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<DropOffLocation[]>(API_ENDPOINTS.dropoffLocations.base, params);
  }

  /**
   * Nearby drop-off points with usage intensity and cooldown state (`VolunteerOnly`).
   * Backend orders them available-first then nearest, so `[0]` is the best next
   * destination — don't re-sort by distance alone or a cooling-down spot floats up.
   */
  hotspots(
    latitude: number,
    longitude: number,
    radiusKm?: number,
    pageSize = 50,
  ): Observable<DropOffHotspot[]> {
    const params: QueryParams = { latitude, longitude, radiusKm, page: 1, pageSize };
    return this.api.get<DropOffHotspot[]>(API_ENDPOINTS.dropoffLocations.hotspots, params);
  }

  create(body: CreateDropOffLocationBody): Observable<DropOffLocation> {
    return this.api.post<DropOffLocation>(API_ENDPOINTS.dropoffLocations.base, body);
  }

  activate(id: string): Observable<DropOffLocation> {
    return this.api.patch<DropOffLocation>(API_ENDPOINTS.dropoffLocations.activate(id));
  }

  deactivate(id: string): Observable<DropOffLocation> {
    return this.api.patch<DropOffLocation>(API_ENDPOINTS.dropoffLocations.deactivate(id));
  }
}
