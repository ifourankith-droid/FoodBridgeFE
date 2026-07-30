import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { CreateDropOffLocationBody, DropOffLocation } from '@core/models/dropoff-location.model';

/**
 * Admin CRUD for the fallback drop-off points (`AdminOnly`).
 *
 * This is the *only* way rows get into the table the backend's confirm-pickup
 * fallback reads — see {@link DropOffLocation}. There is no DELETE endpoint, so
 * `deactivate` is how a location is retired.
 */
@Injectable({ providedIn: 'root' })
export class DropOffLocationService {
  private readonly api = inject(ApiService);

  list(page = 1, pageSize = 50): Observable<DropOffLocation[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<DropOffLocation[]>(API_ENDPOINTS.dropoffLocations.base, params);
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
