/**
 * A donor's saved pickup address — `DonorAddressResponse` from
 * GET/POST/PUT /api/donor-addresses (see FoodBridgeBE DonorAddresses module).
 *
 * `label` is a short name for the location ("Main Branch"); `address` is the full
 * postal text used as the listing's pickup address. Setting `isDefault` on one
 * address clears it on all the others (enforced server-side).
 *
 * `city`/`state`/`pincode` complete the postal address and are all optional — rows saved before
 * those columns existed genuinely have none. They are **display-only**: every distance and
 * nearby-listing query runs off `latitude`/`longitude`, never the pincode.
 */
export interface DonorAddress {
  id: string;
  label: string;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/** Request body for POST/PUT /api/donor-addresses. */
export interface DonorAddressBody {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  /** Optional postal parts — omitted or blank is stored as null. */
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}
