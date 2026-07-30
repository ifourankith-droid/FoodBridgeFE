/**
 * Normalised API failure thrown by `apiEnvelopeInterceptor`.
 *
 * The interceptor collapses every `HttpErrorResponse` into a plain `Error` so
 * callers can show `err.message` directly — but that threw away the HTTP status,
 * leaving no way to tell an expired session (401) from a validation failure.
 * `ApiError` keeps the status (and the raw field errors) while remaining an
 * `Error`, so existing `err instanceof Error ? err.message : …` checks still work.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
