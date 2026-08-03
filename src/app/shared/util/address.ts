/**
 * The parts of a postal address, however they arrive — a `UserProfile`, a `UserAddress` from
 * `/auth/me`, or a saved `PickupAddress`. All optional, because any of them can be missing.
 */
export interface AddressParts {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/**
 * Join an address into one readable line: `street, city, state - pincode`.
 *
 * One implementation for every surface that shows an address, so the profile header, the saved-address
 * rows, and the topbar can't drift into three different formats. Blank parts are skipped rather than
 * leaving stray separators, so a street-only address renders as just the street.
 */
export function formatAddress(parts: AddressParts | null | undefined): string {
  if (!parts) {
    return '';
  }
  const line = [parts.address, parts.city, parts.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

  // Pincode joins with " - " so it reads as a postal code rather than another place name.
  const pincode = parts.pincode?.trim();
  if (!pincode) {
    return line;
  }
  return line ? `${line} - ${pincode}` : pincode;
}
