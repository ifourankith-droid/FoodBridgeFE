import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { APP_ROUTES } from '../config/app-routes';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { ToastService } from '../services/toast.service';
import { ApiError } from './api-error';
import {
  apiEnvelopeInterceptor,
  authTokenInterceptor,
  sessionExpiryInterceptor,
} from './api.interceptor';

/**
 * Pins down the behaviour that was missing: a token the backend has expired or
 * revoked must sign the user out and land them on /login. Guards can't do this —
 * they only see the cached session snapshot, which still looks signed in.
 */
describe('sessionExpiryInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let router: jasmine.SpyObj<Router>;
  let toast: jasmine.SpyObj<ToastService>;

  const url = (path: string) => `/api/${path}`;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.returnValue(Promise.resolve(true));
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['error']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            authTokenInterceptor,
            apiEnvelopeInterceptor,
            sessionExpiryInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);

    auth.currentUser.set({ mobile: '9999999991', role: 'donor', name: 'Grand Plaza Hotel' });
    auth.token.set('expired.jwt.token');
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.inject(StorageService).removeItem('foodbridge.currentUser');
  });

  /** Fires a request and answers it with `status`, swallowing the rejection. */
  function respondWith(path: string, status: number, body: object = {}): void {
    http.get(url(path)).subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne(url(path)).flush(body, { status, statusText: 'x' });
  }

  it('clears the session and redirects to login on a 401', () => {
    respondWith(API_ENDPOINTS.auth.me, 401);

    expect(auth.currentUser()).toBeNull();
    expect(auth.token()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith(APP_ROUTES.login);
    expect(toast.error).toHaveBeenCalled();
  });

  it('leaves the session alone on a 403 — wrong role, not a dead session', () => {
    respondWith(API_ENDPOINTS.admin.dashboard, 403);

    expect(auth.currentUser()).not.toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaves the session alone on a 500', () => {
    respondWith(API_ENDPOINTS.listings.base, 500);

    expect(auth.currentUser()).not.toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not redirect when verify-otp 401s — that is a wrong code, not an expired session', () => {
    respondWith(API_ENDPOINTS.auth.verifyOtp, 401);

    expect(auth.currentUser()).not.toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('redirects once for a burst of parallel 401s', async () => {
    const paths = [
      API_ENDPOINTS.dashboard.donor,
      API_ENDPOINTS.listings.base,
      API_ENDPOINTS.notifications.base,
    ];
    for (const path of paths) {
      http.get(url(path)).subscribe({ next: () => undefined, error: () => undefined });
    }
    for (const path of paths) {
      httpMock.expectOne(url(path)).flush({}, { status: 401, statusText: 'Unauthorized' });
    }

    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    // Let the navigation promise settle so the latch resets for the next 401.
    await router.navigateByUrl.calls.mostRecent().returnValue;
  });

  it('still propagates the error to the caller as an ApiError carrying the status', (done) => {
    http.get(url(API_ENDPOINTS.auth.me)).subscribe({
      error: (err: unknown) => {
        expect(err instanceof ApiError).toBeTrue();
        expect((err as ApiError).status).toBe(401);
        expect((err as ApiError).message).toBe('Token expired');
        done();
      },
    });
    httpMock.expectOne(url(API_ENDPOINTS.auth.me)).flush(
      { success: false, message: 'Token expired', data: null, errors: null, traceId: 't' },
      { status: 401, statusText: 'Unauthorized' },
    );
  });
});

/**
 * Pins down the volunteer-registration bug: the token must be read from the signal, not from the
 * localStorage copy an `effect()` writes a tick later.
 *
 * `register()` and `verifyOtp()` both set the token and navigate to `/app` in the same turn, so a
 * component that fetches on load can beat that write. The interceptor used to read storage, so those
 * requests went out unauthenticated, 401'd, and `sessionExpiryInterceptor` signed the user straight
 * back out with "Your session has expired" — never reaching the dashboard. It presented as
 * volunteer-only because the volunteer dashboard is the one that immediately calls
 * `GET /users/{id}/verification` for its verification banner.
 */
describe('authTokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  const url = (path: string) => `/api/${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // Start from a clean slate: no token in the signal *or* in storage.
    auth.token.set(null);
    TestBed.inject(StorageService).removeItem('foodbridge.token');
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.inject(StorageService).removeItem('foodbridge.token');
  });

  it('attaches the token synchronously after token.set, before the storage effect flushes', () => {
    // Exactly the register()/verifyOtp() sequence — set, then immediately fetch. No tick between.
    auth.token.set('fresh.jwt.token');

    http.get(url(API_ENDPOINTS.users.verification('abc'))).subscribe();

    const req = httpMock.expectOne(url(API_ENDPOINTS.users.verification('abc')));
    expect(req.request.headers.get('Authorization')).toBe('Bearer fresh.jwt.token');
    req.flush({});
  });

  it('sends no Authorization header when there is no token', () => {
    http.get(url(API_ENDPOINTS.auth.sendOtp)).subscribe();

    const req = httpMock.expectOne(url(API_ENDPOINTS.auth.sendOtp));
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('prefers the signal over a stale token left in storage', () => {
    // The other half of the bug: a previous session's token in storage was attached and rejected.
    TestBed.inject(StorageService).setItem('foodbridge.token', 'stale.jwt.token');
    auth.token.set('current.jwt.token');

    http.get(url(API_ENDPOINTS.dashboard.volunteer)).subscribe();

    const req = httpMock.expectOne(url(API_ENDPOINTS.dashboard.volunteer));
    expect(req.request.headers.get('Authorization')).toBe('Bearer current.jwt.token');
    req.flush({});
  });
});
