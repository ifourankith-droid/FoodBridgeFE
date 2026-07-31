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
  googleMapsApiKey: '',
  mapDefaultCenter: { lat: 23.0225, lng: 72.5714 },
  mapDefaultZoom: 13,
};
