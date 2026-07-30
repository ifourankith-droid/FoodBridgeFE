/**
 * Production environment — swapped in for `environment.ts` by the `production`
 * configuration's `fileReplacements` (see angular.json).
 *
 */
const API_ORIGIN = 'https://REPLACE-ME-foodbridge-api.azurewebsites.net';

export const environment = {
  production: true,
  apiUrl: `${API_ORIGIN}/api`,
  hubUrl: `${API_ORIGIN}/hubs`,
  useMockAuth: false,
  googleMapsApiKey: '',
  mapDefaultCenter: { lat: 23.0225, lng: 72.5714 },
  mapDefaultZoom: 13,
};
