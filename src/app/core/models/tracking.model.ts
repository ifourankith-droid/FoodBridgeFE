/** GET /api/geocode (`GeocodeResult`). */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** True when the address wasn't recognized and fell back to the city centre. */
  isApproximate: boolean;
}

/** GET /api/listings/{id}/track — last reported volunteer position. */
export interface TrackingSnapshot {
  listingId: string;
  latitude: number;
  longitude: number;
  reportedAtUtc: string;
}
