/** Where a drop-off point came from. */
export type DropOffLocationSource = 'Admin' | 'Volunteer';

/**
 * A place food can be taken — `DropOffLocationResponse`.
 *
 * The pool is shared and grows two ways: admins curate partner collection points
 * (`source: 'Admin'`), and whoever is carrying the food adds spots they find in the field
 * when recording a delivery (`source: 'Volunteer'`, live immediately). Despite the name that
 * second value covers self-delivering donors too — read it as "added during a delivery";
 * `addedByName` is who actually added it. The nearest *available* one —
 * skipping anything on cooldown — is suggested on the confirm-pickup response as
 * `ApiListing.suggestedDropOffLocation`.
 */
export interface DropOffLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  isActive: boolean;
  source: DropOffLocationSource;
  createdAtUtc: string;
}

/**
 * A drop-off point as the volunteer's hotspot map shows it — `DropOffHotspotResponse`.
 *
 * Ordered by the backend as available-first then nearest, so `[0]` is where the food
 * being carried should go. Spots on cooldown are still returned (flagged) rather than
 * omitted, so the map explains why a closer spot isn't being suggested.
 */
export interface DropOffHotspot {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  source: DropOffLocationSource;
  distanceKm: number;
  /** All-time deliveries here — the hotspot's intensity. */
  deliveryCount: number;
  totalMeals: number;
  lastDeliveredAtUtc: string | null;
  /** Served recently; shouldn't receive another delivery yet. */
  isCoolingDown: boolean;
  /** When it frees up again; null when already available. */
  cooldownUntilUtc: string | null;
  /** Name of the volunteer who added a field-discovered spot; null for admin-curated ones. */
  addedByName: string | null;
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
