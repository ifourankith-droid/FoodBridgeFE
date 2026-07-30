import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { GlobalErrorHandler } from '@core/errors/global-error-handler';
import { NotificationsHubService } from '@core/realtime/notifications-hub.service';
import { AppTitleStrategy } from '@core/services/app-title-strategy';
import {
  apiEnvelopeInterceptor,
  authTokenInterceptor,
  sessionExpiryInterceptor,
} from '@core/http/api.interceptor';
import { AuthService } from '@core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      // Order matters: sessionExpiry sits closest to the backend so it inspects
      // the raw HttpErrorResponse (status 401) before the envelope interceptor
      // normalises it into an ApiError.
      withInterceptors([authTokenInterceptor, apiEnvelopeInterceptor, sessionExpiryInterceptor]),
    ),
    // On startup, hydrate the session from GET /auth/me so the shell renders
    // real backend data (falls through instantly when not signed in).
    provideAppInitializer(() => inject(AuthService).refreshCurrentUser()),
    // Instantiate the notifications hub so its sign-in effect starts running.
    // Nothing injects it otherwise — it is a listener, not a dependency — and a
    // lazily-created root service would never connect. Returns void so startup
    // never waits on the socket.
    provideAppInitializer(() => {
      inject(NotificationsHubService);
    }),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
