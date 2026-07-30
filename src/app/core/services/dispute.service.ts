import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { Dispute, DisputeStatus, RaiseDisputeBody } from '@core/models/dispute.model';

/**
 * Disputes raised on a listing.
 *
 * Deliberately its own service rather than part of `AdminService`: **raising** a
 * dispute is `[Authorize]` for any party on the listing (donor, volunteer or
 * recipient), so a non-admin page must be able to inject this without pulling in
 * the admin console. Only `list`/`resolve` are `AdminOnly`.
 */
@Injectable({ providedIn: 'root' })
export class DisputeService {
  private readonly api = inject(ApiService);

  /** Raise a dispute on a listing. Any party on that listing may call this. */
  raise(body: RaiseDisputeBody): Observable<Dispute> {
    return this.api.post<Dispute>(API_ENDPOINTS.disputes.base, body);
  }

  /** Admin-only. `status` filters server-side (`Open` / `Resolved`). */
  list(status?: DisputeStatus, page = 1, pageSize = 50): Observable<Dispute[]> {
    const params: QueryParams = { status, page, pageSize };
    return this.api.get<Dispute[]>(API_ENDPOINTS.disputes.base, params);
  }

  /** Admin-only. Closes the dispute with a resolution note. */
  resolve(id: string, resolutionNote: string): Observable<Dispute> {
    return this.api.patch<Dispute>(API_ENDPOINTS.disputes.resolve(id), { resolutionNote });
  }
}
