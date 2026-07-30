/** Notification — GET /api/notifications (`NotificationResponse`). */
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  payloadJson: string | null;
  isRead: boolean;
  createdAtUtc: string;
}

/**
 * The `type` values the backend actually dispatches (see the `new Notification`
 * sites in FoodBridge.Application — ListingService / RecipientListingService),
 * plus `Local` for client-side events pushed by `NotificationService.push()`.
 *
 * Kept as a union for authoring convenience only — `Notification.type` stays a
 * plain string so an unrecognised type from a newer backend still renders via
 * the fallback rather than breaking the list.
 */
export type NotificationType =
  // → volunteers within 10km of a new listing
  | 'NewListingNearby'
  // → the assigned volunteer
  | 'DropOffLocationSuggested'
  | 'RecipientRequested'
  | 'ClaimExpired'
  | 'PointsAwarded'
  // → the donor, tracking their donation through the volunteer's hands
  | 'ListingClaimed'
  | 'ListingPickedUp'
  | 'ListingUnclaimed'
  | 'ListingExpired'
  | 'DonationConfirmed'
  // client-side only
  | 'Local';

/**
 * User-facing filter bucket. Several backend types collapse into one group so
 * the filter row stays short enough for the bell dropdown — the type-level
 * detail is still shown per row via {@link NotificationMeta.label}.
 */
export type NotificationCategory = 'pickups' | 'donations' | 'rewards' | 'updates';

/** Filter chip ids: the two read-state filters plus one per category. */
export type NotificationFilter = 'all' | 'unread' | NotificationCategory;

/** How many rows the bell dropdown previews before "View all". */
export const NOTIFICATION_PREVIEW_COUNT = 4;

/**
 * Where a notification takes you when opened.
 *
 * It is a *page*, not a specific record: the backend inserts every notification
 * with `PayloadJson` null (see the `new Notification` sites in
 * FoodBridge.Application), so there is no listing/certificate id to deep-link to.
 * Each backend type is only ever dispatched to one role, so the mapping is static
 * — `NotificationRouter` still re-checks the view against the signed-in role
 * before navigating, since these views are role-guarded.
 */
export interface NotificationAction {
  /** `AppView.id` from routes.config, e.g. 'nearby' → /app/nearby. */
  view: string;
  /** Affordance text on the row, so it's clear the notification is actionable. */
  label: string;
}

export interface NotificationMeta {
  icon: string;
  color: string;
  /** Short human label for the type, shown as the row's eyebrow. */
  label: string;
  category: NotificationCategory;
  /** The page this type opens, or absent when there is nowhere useful to go. */
  action?: NotificationAction;
}

/** Icon, accent colour, label and filter bucket per backend notification `type`. */
const NOTIFICATION_META: Record<string, NotificationMeta> = {
  NewListingNearby: {
    icon: 'fa-solid fa-location-dot',
    color: 'var(--fb-primary)',
    label: 'Pickup nearby',
    category: 'pickups',
    // A listing is open for claiming → the volunteer's feed of open listings.
    action: { view: 'nearby', label: 'View nearby listings' },
  },
  DropOffLocationSuggested: {
    icon: 'fa-solid fa-map-pin',
    color: '#d97706',
    label: 'Drop-off suggested',
    category: 'pickups',
    // Sent to the assigned volunteer mid-delivery → the card carrying that drop-off.
    action: { view: 'deliveries', label: 'Open my deliveries' },
  },
  RecipientRequested: {
    icon: 'fa-solid fa-hand',
    color: 'var(--fb-primary)',
    label: 'Drop-off confirmed',
    category: 'pickups',
    // Sent to the assigned volunteer when an NGO reserves the listing they're
    // carrying → the delivery card that now has a known destination.
    action: { view: 'deliveries', label: 'Open my deliveries' },
  },
  ClaimExpired: {
    icon: 'fa-solid fa-hourglass-end',
    color: '#c7442a',
    label: 'Claim expired',
    category: 'pickups',
    // Their claim lapsed and the listing left their deliveries → back to the open feed.
    action: { view: 'nearby', label: 'Find another pickup' },
  },
  // ---- Donor-facing: their donation moving through the volunteer's hands ----
  // NOTE: `categoryColor()` returns the first entry it finds per category, so the
  // representative of 'donations' must stay first in this group — DonationConfirmed's green
  // is the Donations chip colour in the inbox breakdown. Inserting above it repaints that chip.
  DonationConfirmed: {
    icon: 'fa-solid fa-circle-check',
    color: 'var(--fb-success)',
    label: 'Donation confirmed',
    category: 'donations',
    // The body tells the donor a certificate was issued → their certificates.
    action: { view: 'certificates', label: 'View certificates' },
  },
  ListingClaimed: {
    icon: 'fa-solid fa-hand',
    color: 'var(--fb-primary)',
    label: 'Donation claimed',
    category: 'donations',
    action: { view: 'listings', label: 'View my donations' },
  },
  ListingPickedUp: {
    icon: 'fa-solid fa-truck-fast',
    color: 'var(--fb-primary)',
    label: 'Donation collected',
    category: 'donations',
    action: { view: 'listings', label: 'View my donations' },
  },
  ListingUnclaimed: {
    icon: 'fa-solid fa-rotate-left',
    color: '#d97706',
    label: 'Claim released',
    category: 'donations',
    action: { view: 'listings', label: 'View my donations' },
  },
  ListingExpired: {
    icon: 'fa-solid fa-clock',
    color: 'var(--fb-muted)',
    label: 'Donation expired',
    // 'donations', not 'updates': it's an outcome of the donor's own donation and belongs
    // beside the rest of that lifecycle, rather than buried in a generic bucket.
    category: 'donations',
    action: { view: 'listings', label: 'View my donations' },
  },
  PointsAwarded: {
    icon: 'fa-solid fa-star',
    color: '#d97706',
    label: 'Points awarded',
    category: 'rewards',
    action: { view: 'leaderboard', label: 'View leaderboard' },
  },
  // Client-side events pushed by NotificationService.push() — no destination.
  Local: {
    icon: 'fa-solid fa-bell',
    color: 'var(--fb-primary)',
    label: 'Update',
    category: 'updates',
  },
};

const NOTIFICATION_FALLBACK: NotificationMeta = {
  icon: 'fa-solid fa-bell',
  color: 'var(--fb-muted)',
  label: 'Update',
  category: 'updates',
};

export function notificationMeta(type: string): NotificationMeta {
  return NOTIFICATION_META[type] ?? NOTIFICATION_FALLBACK;
}

/** The page a notification type opens, or null when it isn't actionable. */
export function notificationAction(type: string): NotificationAction | null {
  return notificationMeta(type).action ?? null;
}

/**
 * The accent colour to represent a whole category (for the inbox breakdown),
 * taken from the first type that belongs to it so there is no second palette
 * to keep in sync with {@link NOTIFICATION_META}.
 */
export function categoryColor(category: NotificationCategory): string {
  const match = Object.values(NOTIFICATION_META).find((m) => m.category === category);
  return (match ?? NOTIFICATION_FALLBACK).color;
}

export interface NotificationFilterDef {
  id: NotificationFilter;
  label: string;
  icon: string;
}

/**
 * The filter row, in display order — the single source of truth for both the
 * bell dropdown and the inbox page.
 */
export const NOTIFICATION_FILTERS: readonly NotificationFilterDef[] = [
  { id: 'all', label: 'All', icon: 'fa-solid fa-layer-group' },
  { id: 'unread', label: 'Unread', icon: 'fa-regular fa-circle-dot' },
  { id: 'pickups', label: 'Pickups', icon: 'fa-solid fa-truck-fast' },
  { id: 'donations', label: 'Donations', icon: 'fa-solid fa-hand-holding-heart' },
  { id: 'rewards', label: 'Rewards', icon: 'fa-solid fa-star' },
  { id: 'updates', label: 'Updates', icon: 'fa-solid fa-bell' },
];

export function matchesNotificationFilter(n: Notification, filter: NotificationFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'unread') {
    return !n.isRead;
  }
  return notificationMeta(n.type).category === filter;
}

export function filterNotifications(
  list: readonly Notification[],
  filter: NotificationFilter,
): Notification[] {
  return list.filter((n) => matchesNotificationFilter(n, filter));
}
