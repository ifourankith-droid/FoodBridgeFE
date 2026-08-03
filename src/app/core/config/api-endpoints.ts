/**
 * Central registry of backend API endpoints — mirrors the FoodBridge .NET API
 * (see ../../FoodBridgeBE/docs/API-CONTRACTS.md).
 *
 * Paths are **relative** — `ApiService` prefixes `environment.apiUrl`.
 * Never inline endpoint strings in services/components; add them here so the
 * whole app has a single source of truth for the API surface.
 */

type Id = string | number;

export const API_ENDPOINTS = {
  // 1. Authentication & Registration
  auth: {
    sendOtp: 'auth/send-otp',
    verifyOtp: 'auth/verify-otp',
    register: 'auth/register',
    logout: 'auth/logout',
    me: 'auth/me',
  },

  // 2. User / Profile
  users: {
    base: 'users',
    byId: (id: Id) => `users/${id}`,
    availability: (id: Id) => `users/${id}/availability`,
    avatar: (id: Id) => `users/${id}/avatar`,
    /** Verification status + submitted documents. Self, or admin reviewing. */
    verification: (id: Id) => `users/${id}/verification`,
    /** Upload/replace one verification document (multipart: `file` + `type`). Self only. */
    documents: (id: Id) => `users/${id}/documents`,
  },

  // Donor saved pickup addresses (DonorOnly, self)
  donorAddresses: {
    base: 'donor-addresses',
    byId: (id: Id) => `donor-addresses/${id}`,
  },

  // 3–6. Listings (donor, volunteer, recipient) + tracking
  listings: {
    base: 'listings',
    byId: (id: Id) => `listings/${id}`,
    /** Lifecycle timeline for one listing — usable by any party (donor/volunteer). */
    timeline: (id: Id) => `listings/${id}/timeline`,
    cancel: (id: Id) => `listings/${id}/cancel`,
    /** Donor delivers their own still-unclaimed listing (Pending → Confirmed). */
    selfDeliver: (id: Id) => `listings/${id}/self-deliver`,
    images: (id: Id) => `listings/${id}/images`,
    // Volunteer
    nearby: 'listings/nearby',
    /** The signed-in volunteer's claimed listings (My Deliveries). */
    deliveries: 'listings/deliveries',
    claim: (id: Id) => `listings/${id}/claim`,
    unclaim: (id: Id) => `listings/${id}/unclaim`,
    confirmPickup: (id: Id) => `listings/${id}/confirm-pickup`,
    confirmDelivery: (id: Id) => `listings/${id}/confirm-delivery`,
    // Recipient
    availableNearby: 'listings/available-nearby',
    /** POST reserves an uncollected donation; DELETE releases it. */
    request: (id: Id) => `listings/${id}/request`,
    incoming: 'listings/incoming',
    accept: (id: Id) => `listings/${id}/accept`,
    reject: (id: Id) => `listings/${id}/reject`,
    confirmReceipt: (id: Id) => `listings/${id}/confirm-receipt`,
    history: 'listings/history',
    // Tracking (REST fallback for TrackingHub)
    track: (id: Id) => `listings/${id}/track`,
  },

  // Consolidated per-role dashboard (chart-ready). lat/lng optional on donor/volunteer.
  dashboard: {
    donor: 'dashboard/donor',
    volunteer: 'dashboard/volunteer',
    recipient: 'dashboard/recipient',
  },

  // Shared pool of drop-off points: admin-curated partner sites plus recipient hotspots
  // volunteers add at confirm-delivery. CRUD is AdminOnly; `hotspots` is VolunteerOnly.
  // No DELETE server-side — retire a location with `deactivate` instead.
  dropoffLocations: {
    base: 'dropoff-locations',
    hotspots: 'dropoff-locations/hotspots',
    activate: (id: Id) => `dropoff-locations/${id}/activate`,
    deactivate: (id: Id) => `dropoff-locations/${id}/deactivate`,
  },

  // Liveness probe — anonymous, no envelope data worth reading beyond the 200.
  health: 'health',

  // 7. Notifications (REST fallback for NotificationsHub) + geocode
  notifications: {
    base: 'notifications',
    read: (id: Id) => `notifications/${id}/read`,
  },
  geocode: 'geocode',

  // 8. Certificates
  certificates: {
    base: 'certificates',
    byId: (id: Id) => `certificates/${id}`,
    pdf: (id: Id) => `certificates/${id}/pdf`,
  },

  // 8. Leaderboard
  leaderboard: {
    base: 'leaderboard',
    me: 'leaderboard/me',
  },

  // 8/9. Reports (role-scoped via JWT — no id in the path)
  reports: {
    donor: 'reports/donor',
    volunteer: 'reports/volunteer',
    recipient: 'reports/recipient',
    platform: 'reports/platform',
  },

  // 9. Disputes (raise: any party; list/resolve: admin)
  disputes: {
    base: 'disputes',
    resolve: (id: Id) => `disputes/${id}/resolve`,
  },

  // 9. Admin
  admin: {
    dashboard: 'admin/dashboard',
    listings: 'admin/listings',
    accounts: 'admin/accounts',
    verifyAccount: (id: Id) => `admin/accounts/${id}/verify`,
    suspendAccount: (id: Id) => `admin/accounts/${id}/suspend`,
  },
} as const;
