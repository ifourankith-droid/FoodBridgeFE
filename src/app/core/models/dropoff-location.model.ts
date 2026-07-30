/**
 * Admin-managed fallback drop-off points — `DropOffLocationResponse`.
 *
 * These are the physical places a volunteer takes food to when the backend's
 * `RecipientMatcher` finds no eligible NGO at confirm-pickup time. The matcher
 * picks the *nearest active* row from this table and returns it on the
 * confirm-pickup response as `ApiListing.suggestedDropOffLocation` — so an empty
 * or all-inactive table means the fallback never fires.
 */
export interface DropOffLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  isActive: boolean;
  createdAtUtc: string;
}

/**
 * Request body for POST /api/dropoff-locations.
 *
 * New locations are created **active** server-side; use the activate/deactivate
 * endpoints to retire one rather than deleting it (there is no DELETE, so history
 * on past listings stays resolvable).
 */
export interface CreateDropOffLocationBody {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
}
