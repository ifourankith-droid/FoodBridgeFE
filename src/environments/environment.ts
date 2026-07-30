export const environment = {
  production: false,
  // FoodBridge .NET API — relative path proxied to http://localhost:5101 by the
  // Angular dev server (see proxy.conf.json). Keeps API calls same-origin (no CORS).
  apiUrl: '/api',
  // SignalR hub root. NOT under apiUrl — the backend maps the hubs at the origin
  // root (`app.MapHub<…>("/hubs/…")`), so `/hubs` gets its own proxy entry with
  // `"ws": true` for the WebSocket upgrade.
  hubUrl: '/hubs',
  // When true the auth/register flow resolves locally (no backend needed).
  useMockAuth: false,
  // Whether the Recipient role is part of the product. False → the platform runs on
  // three roles (Donor, Volunteer, Admin): Recipient is not offered at registration and
  // a volunteer's Confirm Delivery completes the donation outright (no recipient waits
  // to confirm receipt). Must match the backend's Features:RecipientRoleEnabled.
  // Recipient accounts that already exist keep working — their views stay routable.
  recipientRoleEnabled: false,
  // Google Maps JavaScript API key.
  // NOTE: this is a DUMMY placeholder for testing the load path only — Google
  // will reject it and the map shows a "For development purposes only" overlay.
  // Replace with a real key (Maps JavaScript API + Directions API enabled) for
  // a working map. Set to '' to fall back to the static placeholder card.
  googleMapsApiKey: 'AIzaSyAXVVochlS3spceNiarzKJK6Jjgm_n8F7c',
  // Default map centre (Ahmedabad) used when no explicit centre is provided.
  mapDefaultCenter: { lat: 23.0225, lng: 72.5714 },
  mapDefaultZoom: 13,
};
