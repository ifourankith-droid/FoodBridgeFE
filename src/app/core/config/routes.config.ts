import { Type } from '@angular/core';
import { Role } from '@core/models/user.model';

/**
 * Single source of truth for the authenticated (in-app) views.
 * Drives BOTH the router children (app.routes.ts) and the sidebar nav,
 * and carries the role permissions enforced by `roleGuard`.
 */
export interface AppView {
  id: string;
  title: string;
  icon: string;
  roles: readonly Role[];
  load: () => Promise<Type<unknown>>;
}

const ALL: readonly Role[] = ['donor', 'volunteer', 'recipient', 'admin'];

export const APP_VIEWS: readonly AppView[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'fa-solid fa-gauge',
    roles: ALL,
    load: () => import('@features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  // ---- Donor ----
  {
    id: 'create',
    title: 'New Donation',
    icon: 'fa-solid fa-circle-plus',
    roles: ['donor'],
    load: () => import('@features/donor/create-listing/create-listing').then((m) => m.CreateListing),
  },
  {
    id: 'listings',
    title: 'My Donations',
    icon: 'fa-solid fa-list-check',
    roles: ['donor'],
    load: () => import('@features/donor/my-listings/my-listings').then((m) => m.MyListings),
  },
  {
    id: 'certificates',
    title: 'Certificates',
    icon: 'fa-solid fa-award',
    roles: ['donor'],
    load: () => import('@features/donor/certificates/certificates').then((m) => m.Certificates),
  },
  // ---- Volunteer ----
  {
    id: 'nearby',
    title: 'Nearby Listings',
    icon: 'fa-solid fa-map-location-dot',
    roles: ['volunteer'],
    load: () => import('@features/volunteer/nearby/nearby').then((m) => m.Nearby),
  },
  {
    id: 'deliveries',
    title: 'My Deliveries',
    icon: 'fa-solid fa-truck-fast',
    roles: ['volunteer'],
    load: () => import('@features/volunteer/deliveries/deliveries').then((m) => m.Deliveries),
  },
  {
    id: 'verification',
    title: 'Verification',
    icon: 'fa-solid fa-id-card',
    roles: ['volunteer'],
    load: () => import('@features/volunteer/verification/verification').then((m) => m.Verification),
  },
  {
    id: 'hotspots',
    title: 'Recipient Hotspots',
    icon: 'fa-solid fa-fire',
    roles: ['volunteer'],
    load: () => import('@features/volunteer/hotspots/hotspots').then((m) => m.Hotspots),
  },
  {
    id: 'leaderboard',
    title: 'Leaderboard',
    icon: 'fa-solid fa-ranking-star',
    roles: ['volunteer'],
    load: () => import('@features/volunteer/leaderboard/leaderboard').then((m) => m.Leaderboard),
  },
  // ---- Recipient ----
  {
    id: 'incoming',
    title: 'Incoming Food',
    icon: 'fa-solid fa-box-open',
    roles: ['recipient'],
    load: () => import('@features/recipient/incoming/incoming').then((m) => m.Incoming),
  },
  {
    id: 'track',
    title: 'Track Delivery',
    icon: 'fa-solid fa-location-crosshairs',
    roles: ['recipient'],
    load: () => import('@features/recipient/track/track').then((m) => m.Track),
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: 'fa-solid fa-chart-column',
    roles: ['recipient'],
    load: () => import('@features/recipient/reports/reports').then((m) => m.Reports),
  },
  // ---- Shared: history (volunteer + recipient) ----
  {
    id: 'history',
    title: 'History',
    icon: 'fa-solid fa-clock-rotate-left',
    roles: ['volunteer', 'recipient'],
    load: () => import('@features/history/history').then((m) => m.History),
  },
  // ---- Admin ----
  {
    id: 'adminListings',
    title: 'All Listings',
    icon: 'fa-solid fa-list-check',
    roles: ['admin'],
    load: () => import('@features/admin/all-listings/all-listings').then((m) => m.AllListings),
  },
  {
    id: 'verifications',
    title: 'Verifications',
    icon: 'fa-solid fa-user-shield',
    roles: ['admin'],
    load: () => import('@features/admin/verifications/verifications').then((m) => m.Verifications),
  },
  {
    id: 'disputes',
    title: 'Disputes',
    icon: 'fa-solid fa-triangle-exclamation',
    roles: ['admin'],
    load: () => import('@features/admin/disputes/disputes').then((m) => m.Disputes),
  },
  {
    id: 'dropoffLocations',
    title: 'Drop-off Points',
    icon: 'fa-solid fa-box-open',
    roles: ['admin'],
    load: () =>
      import('@features/admin/dropoff-locations/dropoff-locations').then((m) => m.DropOffLocations),
  },
  {
    id: 'adminReports',
    title: 'Reports',
    icon: 'fa-solid fa-chart-column',
    roles: ['admin'],
    load: () => import('@features/admin/reports/admin-reports').then((m) => m.AdminReports),
  },
  // ---- Shared: notifications + profile + settings ----
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'fa-solid fa-bell',
    roles: ALL,
    load: () => import('@features/notifications/notifications').then((m) => m.Notifications),
  },
  {
    id: 'profile',
    title: 'Profile',
    icon: 'fa-solid fa-user',
    roles: ALL,
    load: () => import('@features/profile/profile').then((m) => m.Profile),
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'fa-solid fa-gear',
    roles: ALL,
    load: () => import('@features/settings/settings').then((m) => m.Settings),
  },
];

/** Views visible to a role, in sidebar order. */
export function viewsForRole(role: Role): AppView[] {
  return APP_VIEWS.filter((v) => v.roles.includes(role));
}
