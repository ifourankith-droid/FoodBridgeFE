import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import {
  ApiListing,
  ApiListingStatus,
  ApiListingSummary,
  ApiNearbyListing,
  DietType,
  ListingWriteBody,
  MealType,
} from '@core/models/listing-api.model';

/** Result of POST /listings/{id}/images. */
export interface ImageUploadResult {
  imageId: string;
  imageUrl: string;
}

/**
 * Optional server-side narrowing by food attributes. Accepted by both
 * `GET /listings` (donor's own) and `GET /listings/nearby` (volunteer feed).
 */
export interface FoodFilters {
  dietType?: DietType;
  mealType?: MealType;
}

/** @deprecated Use {@link FoodFilters} — kept as an alias for existing callers. */
export type NearbyFilters = FoodFilters;

/**
 * HTTP client for the Donor (Phase 4) and Volunteer (Phase 5) listing endpoints.
 * Responses are already unwrapped from the `ApiResponse`/`PagedResponse` envelope
 * by the API interceptor, so list calls return the inner array directly.
 */
@Injectable({ providedIn: 'root' })
export class ListingService {
  private readonly api = inject(ApiService);

  // ---- Donor ----

  create(body: ListingWriteBody): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.base, body);
  }

  /**
   * The caller's own listings. `status` and the `filters` food attributes all
   * narrow **server-side** — the endpoint accepts `dietType`/`mealType` too, and
   * filtering a paged list locally would only ever search the current page.
   */
  listMine(
    status?: ApiListingStatus,
    page = 1,
    pageSize = 50,
    filters?: FoodFilters,
  ): Observable<ApiListingSummary[]> {
    const params: QueryParams = {
      page,
      pageSize,
      status,
      dietType: filters?.dietType,
      mealType: filters?.mealType,
    };
    return this.api.get<ApiListingSummary[]>(API_ENDPOINTS.listings.base, params);
  }

  getById(id: string): Observable<ApiListing> {
    return this.api.get<ApiListing>(API_ENDPOINTS.listings.byId(id));
  }

  update(id: string, body: ListingWriteBody): Observable<ApiListing> {
    return this.api.put<ApiListing>(API_ENDPOINTS.listings.byId(id), body);
  }

  cancel(id: string): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.cancel(id));
  }

  uploadImage(id: string, file: File): Observable<ImageUploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<ImageUploadResult>(API_ENDPOINTS.listings.images(id), form);
  }

  // ---- Volunteer ----

  /**
   * Pending listings within `radiusKm`, ordered by ascending distance, optionally
   * narrowed to a single diet and/or meal type (both filters are server-side).
   */
  nearby(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    page = 1,
    pageSize = 12,
    filters?: NearbyFilters,
  ): Observable<ApiNearbyListing[]> {
    const params: QueryParams = {
      latitude,
      longitude,
      radiusKm,
      page,
      pageSize,
      dietType: filters?.dietType,
      mealType: filters?.mealType,
    };
    return this.api.get<ApiNearbyListing[]>(API_ENDPOINTS.listings.nearby, params);
  }

  /**
   * Claims a Pending listing. Pass `estimatedPickupAtUtc` (ISO) to commit to a delayed pickup
   * instead of an implied immediate one; omit it for the old immediate-pickup behaviour. The
   * backend 422s if the ETA is in the past or later than the listing's own pickup deadline.
   */
  claim(id: string, estimatedPickupAtUtc?: string): Observable<ApiListing> {
    const params = estimatedPickupAtUtc ? { estimatedPickupAtUtc } : undefined;
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.claim(id), undefined, params);
  }

  /**
   * Releases a claim (Claimed → Pending) so another volunteer can take it. Assigned
   * volunteer only, and only while still Claimed — the backend 422s once pickup is confirmed.
   */
  unclaim(id: string): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.unclaim(id));
  }

  confirmPickup(id: string, photo: File): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.confirmPickup(id), this.photo(photo));
  }

  confirmDelivery(id: string, photo: File): Observable<ApiListing> {
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.confirmDelivery(id), this.photo(photo));
  }

  private photo(file: File): FormData {
    const form = new FormData();
    form.append('photo', file);
    return form;
  }
}
