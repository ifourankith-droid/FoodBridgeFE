import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import {
  ApiAvailableNearbyListing,
  ApiListing,
  ApiListingSummary,
  ConfirmReceiptResult,
} from '@core/models/listing-api.model';

/**
 * Recipient listing endpoints (Phase 6): the incoming feed, accept/reject the
 * match, confirm receipt (atomic points + certificate + notifications), history.
 */
@Injectable({ providedIn: 'root' })
export class RecipientService {
  private readonly api = inject(ApiService);

  /**
   * Uncollected donations near a point — the pull side of matching, so an NGO can
   * see what's around it instead of waiting to be assigned. Includes `Claimed`
   * listings (a volunteer already en route is the likeliest to actually arrive).
   */
  availableNearby(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    page = 1,
    pageSize = 50,
  ): Observable<ApiAvailableNearbyListing[]> {
    const params: QueryParams = { latitude, longitude, radiusKm, page, pageSize };
    return this.api.get<ApiAvailableNearbyListing[]>(API_ENDPOINTS.listings.availableNearby, params);
  }

  /**
   * Reserve a nearby donation. Pre-sets the listing's recipient so the volunteer's
   * confirm-pickup routes it here rather than running the nearest-available matcher.
   * The usual accept/reject still happens once it's actually collected.
   */
  request(id: string): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.request(id));
  }

  /** Release a request — only possible while the food is still uncollected. */
  withdrawRequest(id: string): Observable<ApiListing> {
    return this.api.delete<ApiListing>(API_ENDPOINTS.listings.request(id));
  }

  /** Listings matched to the caller, awaiting an accept/reject decision. */
  incoming(page = 1, pageSize = 50): Observable<ApiListingSummary[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<ApiListingSummary[]>(API_ENDPOINTS.listings.incoming, params);
  }

  /** Acknowledge the match (status unchanged). */
  accept(id: string): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.accept(id));
  }

  /** Decline — auto-reassigns to another available recipient (or none). */
  reject(id: string): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.reject(id));
  }

  /** Confirm receipt (Delivered → Confirmed) — awards points + issues a certificate. */
  confirmReceipt(id: string): Observable<ConfirmReceiptResult> {
    return this.api.post<ConfirmReceiptResult>(API_ENDPOINTS.listings.confirmReceipt(id));
  }

  /** The caller's past confirmed receipts. */
  history(page = 1, pageSize = 50): Observable<ApiListingSummary[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<ApiListingSummary[]>(API_ENDPOINTS.listings.history, params);
  }
}
