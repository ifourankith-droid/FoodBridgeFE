/**
 * Production environment — swapped in for `environment.ts` by the `production`
 * configuration's `fileReplacements` (see angular.json).
 *
 */
/**
 * The deployed API. Everything server-side hangs off this one constant: REST calls (`apiUrl`),
 * the SignalR hubs (`hubUrl`), and uploaded media (`mediaUrl()` in `@shared/util/media-url`).
 *
 * Because the frontend is hosted on a different origin (Azure Static Web Apps) than the API, the
 * API's CORS policy must list the frontend's origin — see `Cors:AllowedOrigins` in
 * `appsettings.Production.json` / the `Cors__AllowedOrigins__0` app setting.
 */
const API_ORIGIN = 'https://foodbridge-api.azurewebsites.net';

export const environment = {
  production: true,
  apiUrl: `${API_ORIGIN}/api`,
  hubUrl: `${API_ORIGIN}/hubs`,
  useMockAuth: false,
  // Keep in step with the backend's Features:RecipientRoleEnabled.
  recipientRoleEnabled: false,
  /**
   * Google Maps JavaScript API key — **left empty on purpose; do not commit a key here.**
   *
   * `scripts/set-maps-key.mjs` writes the real value into this line from the
   * `GOOGLE_MAPS_API_KEY` secret just before `ng build` runs in CI. It has to happen at build time
   * because this is a compile-time constant baked into the bundle: a Static Web Apps application
   * setting would never reach the browser, since there is no server in the request path for a
   * static SPA.
   *
   * Empty is a safe default — `GoogleMapsLoaderService` reports `no-key` and `FbMap` renders its
   * placeholder card instead of a broken map.
   */
  googleMapsApiKey: '',
  mapDefaultCenter: { lat: 23.0225, lng: 72.5714 },
  mapDefaultZoom: 13,
};
