import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { ApiService } from '../http/api.service';

/**
 * Raw user shape returned by the backend (`UserResponse`). Roles/recipientType
 * are PascalCase enum names; {@link AuthService} maps these to the app's model.
 */
export interface ApiUser {
  id: string;
  mobile: string;
  name: string;
  role: string;
  city: string | null;
  accountStatus: string;
  recipientType: string | null;
  avatarUrl?: string | null;
  /** `AddressResponse` — the complete address, or null when the account has none. */
  address?: ApiUserAddress | null;
}

/** `AddressResponse`. Every part nullable; `label` is set only for a donor's saved address. */
export interface ApiUserAddress {
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** POST /auth/verify-otp — new mobile → session token; existing → auth JWT + user. */
export interface VerifyOtpResult {
  isNewUser: boolean;
  token: string | null;
  user: ApiUser | null;
}

/** POST /auth/register — completes registration, returns an auth JWT + user. */
export interface AuthResult {
  token: string;
  user: ApiUser;
}

/** Request body for POST /auth/register (see docs/API-CONTRACTS.md § Auth). */
export interface RegisterApiRequest {
  sessionToken: string;
  role: string;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  recipientType: string | null;
  capacityMeals: number | null;
  /** Optional postal parts. Reverse-geocoding fills both from the picked pin. */
  state: string | null;
  pincode: string | null;
}

/**
 * HTTP calls for the authentication endpoints. The `ApiResponse<T>` envelope is
 * unwrapped by the API interceptor, so these return the inner `data` directly.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(ApiService);

  sendOtp(mobile: string): Observable<null> {
    return this.api.post<null>(API_ENDPOINTS.auth.sendOtp, { mobile });
  }

  verifyOtp(mobile: string, code: string): Observable<VerifyOtpResult> {
    return this.api.post<VerifyOtpResult>(API_ENDPOINTS.auth.verifyOtp, { mobile, code });
  }

  register(request: RegisterApiRequest): Observable<AuthResult> {
    return this.api.post<AuthResult>(API_ENDPOINTS.auth.register, request);
  }

  logout(): Observable<null> {
    return this.api.post<null>(API_ENDPOINTS.auth.logout);
  }

  /** Currently logged-in user (GET /auth/me). */
  me(): Observable<ApiUser> {
    return this.api.get<ApiUser>(API_ENDPOINTS.auth.me);
  }
}
