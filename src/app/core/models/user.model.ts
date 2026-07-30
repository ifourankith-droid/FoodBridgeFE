export type Role = 'donor' | 'volunteer' | 'recipient' | 'admin';

export type RecipientType = 'Individual' | 'Organization';
export type AccountStatus = 'Pending' | 'Verified' | 'Suspended';

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
}

/** Full profile — GET/PUT /users/{id} (`UserProfileResponse`). */
export interface UserProfile {
  id: string;
  mobile: string;
  name: string;
  role: string;
  city: string | null;
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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacityMeals: number | null;
}
