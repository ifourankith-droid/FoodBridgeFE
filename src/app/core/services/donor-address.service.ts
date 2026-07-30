import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { DonorAddress, DonorAddressBody } from '@core/models/donor-address.model';

/**
 * HTTP client for the Donor saved-address CRUD endpoints. Setting `isDefault`
 * on one address clears it on the others (enforced server-side).
 *
 * `GET /donor-addresses/{id}` is intentionally not wrapped: `PickupAddressService`
 * works off `list()`, and every write returns the updated row, so a single-address
 * fetch has no caller. The path stays in `API_ENDPOINTS` for when one appears.
 */
@Injectable({ providedIn: 'root' })
export class DonorAddressService {
  private readonly api = inject(ApiService);

  list(page = 1, pageSize = 50): Observable<DonorAddress[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<DonorAddress[]>(API_ENDPOINTS.donorAddresses.base, params);
  }

  create(body: DonorAddressBody): Observable<DonorAddress> {
    return this.api.post<DonorAddress>(API_ENDPOINTS.donorAddresses.base, body);
  }

  update(id: string, body: DonorAddressBody): Observable<DonorAddress> {
    return this.api.put<DonorAddress>(API_ENDPOINTS.donorAddresses.byId(id), body);
  }

  remove(id: string): Observable<void> {
    return this.api.delete<void>(API_ENDPOINTS.donorAddresses.byId(id));
  }
}
