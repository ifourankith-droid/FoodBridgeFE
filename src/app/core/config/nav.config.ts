import { Role } from '../models/user.model';

export interface NavItem {
  id: string;
  icon: string;
  label: string;
}

/** Role-specific sidebar navigation (mirrors the prototype's NAV map). */
export const NAV: Record<Role, readonly NavItem[]> = {
  donor: [
    { id: 'dashboard', icon: 'fa-solid fa-gauge', label: 'Dashboard' },
    { id: 'create', icon: 'fa-solid fa-circle-plus', label: 'New Donation' },
    { id: 'listings', icon: 'fa-solid fa-list-check', label: 'My Donations' },
    { id: 'certificates', icon: 'fa-solid fa-award', label: 'Certificates' },
    { id: 'profile', icon: 'fa-solid fa-user', label: 'Profile' },
  ],
  volunteer: [
    { id: 'dashboard', icon: 'fa-solid fa-gauge', label: 'Dashboard' },
    { id: 'nearby', icon: 'fa-solid fa-map-location-dot', label: 'Nearby Listings' },
    { id: 'deliveries', icon: 'fa-solid fa-truck-fast', label: 'My Deliveries' },
    { id: 'history', icon: 'fa-solid fa-clock-rotate-left', label: 'History' },
    { id: 'leaderboard', icon: 'fa-solid fa-ranking-star', label: 'Leaderboard' },
    { id: 'profile', icon: 'fa-solid fa-user', label: 'Profile' },
  ],
  recipient: [
    { id: 'dashboard', icon: 'fa-solid fa-gauge', label: 'Dashboard' },
    { id: 'incoming', icon: 'fa-solid fa-box-open', label: 'Incoming Food' },
    { id: 'track', icon: 'fa-solid fa-location-crosshairs', label: 'Track Delivery' },
    { id: 'history', icon: 'fa-solid fa-clock-rotate-left', label: 'Distribution History' },
    { id: 'reports', icon: 'fa-solid fa-chart-column', label: 'Reports' },
    { id: 'profile', icon: 'fa-solid fa-user', label: 'Profile' },
  ],
  admin: [
    { id: 'dashboard', icon: 'fa-solid fa-gauge', label: 'Dashboard' },
    { id: 'adminListings', icon: 'fa-solid fa-list-check', label: 'All Listings' },
    { id: 'verifications', icon: 'fa-solid fa-user-shield', label: 'Verifications' },
    { id: 'disputes', icon: 'fa-solid fa-triangle-exclamation', label: 'Disputes' },
    { id: 'adminReports', icon: 'fa-solid fa-chart-column', label: 'Reports' },
    { id: 'profile', icon: 'fa-solid fa-user', label: 'Profile' },
  ],
};
