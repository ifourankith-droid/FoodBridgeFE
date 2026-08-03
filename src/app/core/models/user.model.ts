export type Role = 'donor' | 'volunteer' | 'recipient' | 'admin';

export type RecipientType = 'Individual' | 'Organization';
export type AccountStatus = 'Pending' | 'Verified' | 'Suspended';

/**
 * One complete postal address, as returned inside `UserResponse.address`.
 *
 * Every part is optional: an account may predate a field, or have skipped location entirely. `label`
 * is only ever set when the address came from a donor's saved-address list — that is the only place
 * a label is stored.
 */
export interface UserAddress {
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Lightweight session user (from verify-otp / register / me). */
export interface User {
  /** Backend user id (Guid). Needed to call /users/{id}. */
  id?: string;
  mobile: string;
  role: Role;
  name: string;
  city?: string;
  recipientType?: RecipientType;
  capacity?: string;
  avatarUrl?: string;
  /**
   * The complete address, absent when the account has none. For donors this is their **default
   * saved address** — so it carries a label and matches what a new donation would post from —
   * falling back to the account's own address when they have saved none.
   */
  address?: UserAddress | null;
}

/** Full profile — GET/PUT /users/{id} (`UserProfileResponse`). */
export interface UserProfile {
  id: string;
  mobile: string;
  name: string;
  role: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  recipientType: RecipientType | null;
  capacityMeals: number | null;
  isAvailable: boolean;
  accountStatus: AccountStatus;
  avatarUrl: string | null;
}

/** Request body for PUT /users/{id}. */
export interface UpdateProfileBody {
  name: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacityMeals: number | null;
}
