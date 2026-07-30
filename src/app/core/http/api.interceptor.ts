import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, map, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { APP_ROUTES } from '../config/app-routes';
import { AUTH_TOKEN_KEY, AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { ToastService } from '../services/toast.service';
import { ApiError } from './api-error';

/** The `ApiResponse<T>` envelope every backend endpoint returns. */
interface ApiEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  errors: string[] | null;
  traceId: string;
}

function isEnvelope(body: unknown): body is ApiEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body &&
    'traceId' in body
  );
}

/** Attaches the stored JWT as a Bearer token to same-API requests. */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(StorageService);
  const token = storage.getItem<string>(AUTH_TOKEN_KEY);

  if (token && req.url.startsWith(environment.apiUrl)) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

/**
 * Unwraps the `ApiResponse<T>` envelope so callers receive the inner `data`,
 * and normalises backend error envelopes into an `Error` carrying the server's
 * `message` (falling back to the first field error, then a generic message).
 */
export const apiEnvelopeInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    map((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse && isEnvelope(event.body)) {
        return event.clone({ body: event.body.data });
      }
      return event;
    }),
    catchError((err: HttpErrorResponse) => throwError(() => toError(err))),
  );

/**
 * Signs the user out and sends them to the login page when the backend rejects
 * a request with 401.
 *
 * Without this an expired or revoked token was invisible to the router: the
 * session snapshot in `localStorage` still hydrates `AuthService.currentUser`,
 * so `authGuard` happily admits the user to `/app` and every page inside it
 * fails its API calls instead of redirecting. Registered *last* in the chain so
 * it sees the raw `HttpErrorResponse` before `apiEnvelopeInterceptor` normalises
 * it, and it re-throws so callers still get their error.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && needsSession(req.url)) {
        signOut(auth, router, toast);
      }
      return throwError(() => err);
    }),
  );
};

/**
 * True for API calls that carry a session — i.e. everything except the
 * anonymous auth endpoints, whose 401 means "wrong OTP", not "session gone",
 * and must surface as a form error rather than a redirect.
 */
function needsSession(url: string): boolean {
  const anonymous = [
    API_ENDPOINTS.auth.sendOtp,
    API_ENDPOINTS.auth.verifyOtp,
    API_ENDPOINTS.auth.register,
  ];
  return url.startsWith(environment.apiUrl) && !anonymous.some((path) => url.includes(path));
}

/** Guards against a burst of parallel 401s stacking toasts and navigations. */
let signingOut = false;

function signOut(auth: AuthService, router: Router, toast: ToastService): void {
  if (signingOut) {
    return;
  }
  signingOut = true;
  auth.clearSession();
  toast.error('Your session has expired. Please sign in again.', 'Signed out');
  router.navigateByUrl(APP_ROUTES.login).finally(() => {
    signingOut = false;
  });
}

function toError(err: HttpErrorResponse): Error {
  const body = err.error as Partial<ApiEnvelope> | undefined;
  const message =
    // Prefer the first field-level validation error (most specific), then the
    // envelope message, then a status-based fallback.
    firstFieldError(body?.errors) ??
    body?.message ??
    (err.status === 0
      ? 'Cannot reach the server. Please check your connection.'
      : 'Something went wrong. Please try again.');
  return new ApiError(message, err.status, body?.errors ?? []);
}

/** First entry of the `errors` array, with FluentValidation's "Property: " prefix stripped. */
function firstFieldError(errors: string[] | null | undefined): string | undefined {
  const first = errors?.find((e) => !!e && e.trim().length > 0);
  return first ? first.replace(/^[A-Za-z0-9_.]+:\s+/, '').trim() : undefined;
}
