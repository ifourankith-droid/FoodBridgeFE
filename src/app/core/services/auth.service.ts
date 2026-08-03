import { effect, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { RecipientType, RegisterPayload, RegistrationDraft } from '../models/registration.model';
import { Role, User } from '../models/user.model';
import { ApiUser, AuthApiService, RegisterApiRequest } from './auth-api.service';
import { StorageService } from './storage.service';

export type OtpContext = 'login' | 'register';
export type OtpResult = 'invalid' | 'existing' | 'new' | 'register-verified';

const SESSION_KEY = 'foodbridge.currentUser';
const FLOW_KEY = 'foodbridge.authFlow';
/** localStorage key for the auth JWT — read by the HTTP auth interceptor. */
export const AUTH_TOKEN_KEY = 'foodbridge.token';

/** Transient OTP/registration flow state — persisted per-tab so a refresh
 *  mid-flow keeps the user on the OTP/register screen instead of restarting. */
interface AuthFlowState {
  pendingMobile: string;
  otpContext: OtpContext;
  mobileVerified: boolean;
  registrationDraft: RegistrationDraft | null;
  /** Short-lived session token from verify-otp (new mobile) → passed to register. */
  registrationSessionToken: string | null;
}

/** Demo accounts baked into the prototype. */
const DEMO_USERS: readonly User[] = [
  { mobile: '9999999991', role: 'donor', name: 'Grand Plaza Hotel', city: 'Ahmedabad' },
  { mobile: '9999999992', role: 'volunteer', name: 'Priya Sharma', city: 'Ahmedabad' },
  { mobile: '9999999993', role: 'recipient', name: 'Hope Community Kitchen', city: 'Ahmedabad' },
  { mobile: '9999999994', role: 'admin', name: 'Platform Admin', city: 'Ahmedabad' },
];

const DEMO_OTP = '123456';
const MOBILE_PATTERN = /^\d{10}$/;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly storage = inject(StorageService);

  /** Restored flow state (sessionStorage) so a mid-flow refresh doesn't reset. */
  private readonly savedFlow = this.storage.getSessionItem<AuthFlowState>(FLOW_KEY);

  readonly pendingMobile = signal(this.savedFlow?.pendingMobile ?? '');
  readonly otpContext = signal<OtpContext>(this.savedFlow?.otpContext ?? 'login');
  readonly mobileVerified = signal(this.savedFlow?.mobileVerified ?? false);

  /** Hydrated from localStorage so the session survives a page reload. */
  readonly currentUser = signal<User | null>(this.storage.getItem<User>(SESSION_KEY));

  /** Auth JWT — persisted to localStorage; attached by the HTTP interceptor. */
  readonly token = signal<string | null>(this.storage.getItem<string>(AUTH_TOKEN_KEY));

  /** Registration session token carried from verify-otp to register. */
  readonly registrationSessionToken = signal<string | null>(
    this.savedFlow?.registrationSessionToken ?? null,
  );

  /** Cross-step wizard state — survives the OTP round-trip and refreshes. */
  readonly registrationDraft = signal<RegistrationDraft | null>(
    this.savedFlow?.registrationDraft ?? null,
  );

  constructor() {
    // Persist the logged-in session (localStorage).
    effect(() => {
      const user = this.currentUser();
      if (user) {
        this.storage.setItem(SESSION_KEY, user);
      } else {
        this.storage.removeItem(SESSION_KEY);
      }
    });

    // Persist the auth JWT alongside the session (localStorage).
    effect(() => {
      const token = this.token();
      if (token) {
        this.storage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        this.storage.removeItem(AUTH_TOKEN_KEY);
      }
    });

    // Persist the transient auth-flow state (sessionStorage) — refresh-safe.
    effect(() => {
      const state: AuthFlowState = {
        pendingMobile: this.pendingMobile(),
        otpContext: this.otpContext(),
        mobileVerified: this.mobileVerified(),
        registrationDraft: this.registrationDraft(),
        registrationSessionToken: this.registrationSessionToken(),
      };
      this.storage.setSessionItem(FLOW_KEY, state);
    });
  }

  /**
   * Validate the mobile and request an OTP. Emits when the code has been
   * "sent" (mock → immediately; real → after the send-otp endpoint responds).
   */
  sendOtp(mobile: string, context: OtpContext): Observable<void> {
    if (!MOBILE_PATTERN.test(mobile)) {
      return throwError(() => new Error('Please enter a valid 10-digit mobile number'));
    }
    this.pendingMobile.set(mobile);
    this.otpContext.set(context);
    this.mobileVerified.set(false);

    return environment.useMockAuth
      ? of(undefined)
      : this.authApi.sendOtp(mobile).pipe(map(() => undefined));
  }

  /** Verify the OTP; resolves to the next step for the flow to act on. */
  verifyOtp(code: string): Observable<OtpResult> {
    if (environment.useMockAuth) {
      return of(this.resolveOtpLocally(code));
    }
    const wasRegistering = this.otpContext() === 'register';
    return this.authApi.verifyOtp(this.pendingMobile(), code).pipe(
      map((res) => {
        this.mobileVerified.set(true);

        // New mobile → `token` is a short-lived registration session token.
        if (res.isNewUser) {
          this.registrationSessionToken.set(res.token);
          if (wasRegistering) {
            this.otpContext.set('login');
            return 'register-verified';
          }
          return 'new';
        }

        // Existing account → `token` is a full auth JWT; sign the user in.
        if (res.token) {
          this.token.set(res.token);
        }
        if (res.user) {
          this.currentUser.set(this.mapUser(res.user));
        }
        return 'existing';
      }),
    );
  }

  /** Begin the registration flow, carrying over a valid typed number. */
  startRegistration(mobile: string): void {
    this.pendingMobile.set(MOBILE_PATTERN.test(mobile) ? mobile : '');
    this.otpContext.set('login');
    this.mobileVerified.set(false);
    this.registrationDraft.set(null);
  }

  saveRegistrationDraft(draft: RegistrationDraft): void {
    this.registrationDraft.set(draft);
  }

  clearRegistrationDraft(): void {
    this.registrationDraft.set(null);
  }

  /**
   * Complete registration. In mock mode the user is built locally; otherwise
   * it POSTs to /auth/register with the session token from verify-otp and
   * signs the user in with the returned JWT.
   */
  register(draft: RegistrationDraft): Observable<User> {
    if (environment.useMockAuth) {
      return of(this.buildUserFromPayload(this.toMockPayload(draft))).pipe(
        map((user) => this.setCurrentUser(user)),
      );
    }

    const sessionToken = this.registrationSessionToken();
    if (!sessionToken) {
      return throwError(
        () => new Error('Your verification session has expired. Please verify your mobile again.'),
      );
    }

    const isRecipient = draft.role === 'recipient';
    const request: RegisterApiRequest = {
      sessionToken,
      role: this.toApiRole(draft.role as Role),
      name: draft.name.trim(),
      city: draft.city.trim() || null,
      address: draft.address.trim() || null,
      latitude: draft.latitude,
      longitude: draft.longitude,
      recipientType: isRecipient ? draft.recipientType : null,
      capacityMeals: isRecipient ? this.parseCapacity(draft.capacity) : null,
      // The wizard has collected these since it was built; they used to stop here.
      state: draft.state.trim() || null,
      pincode: draft.pincode.trim() || null,
    };

    return this.authApi.register(request).pipe(
      map((res) => {
        this.token.set(res.token);
        this.registrationSessionToken.set(null);
        return this.setCurrentUser(this.mapUser(res.user));
      }),
    );
  }

  /**
   * Refresh the session from `GET /auth/me` (called by the app initializer on
   * startup). Populates `currentUser` with live backend data so the shell
   * (topbar/sidebar) and guards work off the real profile, not just the cached
   * snapshot. No-ops in mock mode or when there's no token; on a transient
   * failure (offline, 5xx) it keeps whatever is already cached so a backend
   * hiccup won't sign the user out. A 401 is *not* transient — the
   * session-expiry interceptor has already cleared the session by the time this
   * `catchError` runs, so it resolves to `null` and `authGuard` sends the user to
   * login. Completes so it can gate `provideAppInitializer`.
   */
  refreshCurrentUser(): Observable<User | null> {
    if (environment.useMockAuth || !this.token()) {
      return of(this.currentUser());
    }
    return this.authApi.me().pipe(
      map((api) => this.setCurrentUser(this.mapUser(api))),
      catchError(() => of(this.currentUser())),
    );
  }

  logout(): void {
    if (!environment.useMockAuth) {
      this.authApi.logout().subscribe({ error: () => undefined });
    }
    this.clearSession();
  }

  /**
   * Drop the local session without calling the backend. Used by `logout()` and
   * by the session-expiry interceptor on a 401 — there the token is already dead,
   * so POSTing /auth/logout would just 401 again and re-enter the handler.
   */
  clearSession(): void {
    this.currentUser.set(null);
    this.token.set(null);
    this.pendingMobile.set('');
    this.mobileVerified.set(false);
    this.otpContext.set('login');
    this.registrationDraft.set(null);
    this.registrationSessionToken.set(null);
  }

  /** Local (mock) OTP resolution — mirrors the intended backend behaviour. */
  private resolveOtpLocally(code: string): OtpResult {
    if (code !== DEMO_OTP) {
      return 'invalid';
    }
    this.mobileVerified.set(true);

    if (this.otpContext() === 'register') {
      this.otpContext.set('login');
      return 'register-verified';
    }

    const existing = DEMO_USERS.find((u) => u.mobile === this.pendingMobile());
    if (existing) {
      this.currentUser.set({ ...existing });
      return 'existing';
    }
    return 'new';
  }

  private setCurrentUser(user: User): User {
    this.currentUser.set(user);
    return user;
  }

  /** Merge fields into the current session user (e.g. after a profile edit). */
  patchCurrentUser(changes: Partial<User>): void {
    this.currentUser.update((u) => (u ? { ...u, ...changes } : u));
  }

  /**
   * True when a `register()` failure means the short-lived registration session
   * token has expired/gone invalid — the caller should send the user back through
   * OTP verification. Covers both the local "no token" throw and the backend's
   * 422 "Session expired or invalid…" response.
   */
  isSessionExpiredError(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    return message.includes('session') || message.includes('verify your mobile');
  }

  /** Backend `UserResponse` → app `User` (roles are PascalCase on the wire). */
  private mapUser(api: ApiUser): User {
    const user: User = {
      id: api.id,
      mobile: api.mobile,
      role: api.role.toLowerCase() as Role,
      name: api.name,
      city: api.city ?? undefined,
    };
    if (api.recipientType) {
      user.recipientType = api.recipientType as RecipientType;
    }
    if (api.address) {
      user.address = api.address;
    }
    return user;
  }

  /** App role ('donor') → backend enum name ('Donor'). */
  private toApiRole(role: Role): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private parseCapacity(capacity: string): number | null {
    const value = Number.parseInt(capacity.trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private toMockPayload(draft: RegistrationDraft): RegisterPayload {
    const payload: RegisterPayload = {
      role: draft.role as Role,
      name: draft.name.trim() || 'New User',
      mobile: draft.mobile.trim() || this.pendingMobile(),
      address: draft.address.trim(),
      city: draft.city.trim() || 'Your City',
      state: draft.state.trim(),
      pincode: draft.pincode.trim(),
    };
    if (draft.role === 'recipient') {
      payload.recipientType = draft.recipientType;
      payload.capacity = draft.capacity.trim() || '—';
    }
    return payload;
  }

  private buildUserFromPayload(payload: RegisterPayload): User {
    const user: User = {
      mobile: payload.mobile,
      role: payload.role,
      name: payload.name,
      city: payload.city,
    };
    if (payload.role === 'recipient') {
      user.recipientType = payload.recipientType;
      user.capacity = payload.capacity;
    }
    return user;
  }
}
