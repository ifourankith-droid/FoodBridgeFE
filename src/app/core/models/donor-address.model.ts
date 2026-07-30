/**
 * A donor's saved pickup address — `DonorAddressResponse` from
 * GET/POST/PUT /api/donor-addresses (see FoodBridgeBE DonorAddresses module).
 *
 * `label` is a short name for the location ("Main Branch"); `address` is the full
 * postal text used as the listing's pickup address. Setting `isDefault` on one
 * address clears it on all the others (enforced server-side).
 */
export interface DonorAddress {
  id: string;
  label: string;
  address: string;
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
}
