import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import {
  ApiListing,
  ApiListingStatus,
  ApiListingSummary,
  ApiNearbyListing,
  ApiTimelineEvent,
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
  /** Listing status to narrow to server-side, e.g. `'Posted'` for the nearby feed. */
  status?: string;
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

  /**
   * The listing's lifecycle timeline (`GET /listings/{id}/timeline`) — each status
   * change with the actor's name, time, and any note / proof photo. Shared endpoint,
   * usable from both the donor and volunteer sections.
   */
  timeline(id: string): Observable<ApiTimelineEvent[]> {
    return this.api.get<ApiTimelineEvent[]>(API_ENDPOINTS.listings.timeline(id));
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
      status: filters?.status,
    };
    return this.api.get<ApiNearbyListing[]>(API_ENDPOINTS.listings.nearby, params);
  }

  /**
   * The signed-in volunteer's claimed listings across every stage (Claimed → Confirmed),
   * most recently updated first — the data behind My Deliveries. Full detail per row
   * (donor/recipient contacts, ETA, status). One high page covers a volunteer's feed.
   */
  myDeliveries(page = 1, pageSize = 100): Observable<ApiListing[]> {
    return this.api.get<ApiListing[]>(API_ENDPOINTS.listings.deliveries, { page, pageSize });
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

  /**
   * Confirms delivery, recording where the food went. Completes the donation outright
   * (`status: 'Confirmed'`, points + certificate issued) when no recipient was matched;
   * otherwise moves to `Delivered` for the recipient to confirm.
   *
   * `dropOff` is required by the backend: pass `{ locationId }` for a spot that already
   * exists, or `{ latitude, longitude, name }` for one the volunteer found — the latter is
   * saved to the shared pool so every volunteer can use it next time. Supplying both, or
   * neither, is a 422.
   */
  confirmDelivery(id: string, photo: File, dropOff: DropOffSelection): Observable<ApiListing> {
    const form = this.photo(photo);
    if ('locationId' in dropOff) {
      form.append('dropOffLocationId', dropOff.locationId);
    } else {
      form.append('latitude', String(dropOff.latitude));
      form.append('longitude', String(dropOff.longitude));
      form.append('locationName', dropOff.name);
      if (dropOff.address) {
        form.append('locationAddress', dropOff.address);
      }
    }
    return this.api.post<ApiListing>(API_ENDPOINTS.listings.confirmDelivery(id), form);
  }

  private photo(file: File): FormData {
    const form = new FormData();
    form.append('photo', file);
    return form;
  }
}

/**
 * Where a delivery was dropped. A discriminated union rather than one shape with every
 * field optional, so "existing spot" and "new spot" can't be half-filled at a call site —
 * the backend rejects an ambiguous combination with a 422.
 */
export type DropOffSelection =
  | { locationId: string }
  | { latitude: number; longitude: number; name: string; address?: string };
