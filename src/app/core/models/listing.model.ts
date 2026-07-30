export type ListingStatus =
  | 'pending'
  | 'claimed'
  | 'pickedup'
  | 'delivered'
  | 'confirmed'
  | 'expired'
  | 'cancelled'
  | 'rejected';

export interface Listing {
  id: number;
  donor: string;
  foodType: 'Veg' | 'Non-Veg';
  mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
  quantity: string;
  freshness: string;
  pickupTime: string;
  address: string;
  status: ListingStatus;
  volunteer: string | null;
  recipient: string | null;
  notes: string;
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'Posted',
  claimed: 'Claimed',
  pickedup: 'Picked Up',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/** Font Awesome icon per status — used by the common status badge. */
export const STATUS_ICONS: Record<ListingStatus, string> = {
  pending: 'fa-solid fa-clock',
  claimed: 'fa-solid fa-hand',
  pickedup: 'fa-solid fa-box',
  delivered: 'fa-solid fa-truck',
  confirmed: 'fa-solid fa-circle-check',
  expired: 'fa-solid fa-hourglass-end',
  cancelled: 'fa-solid fa-ban',
  rejected: 'fa-solid fa-circle-xmark',
};

export interface TimelineStep {
  status: ListingStatus;
  label: string;
  icon: string;
}

/** Ordered lifecycle used by the rescue timeline. */
export const TIMELINE_STEPS: readonly TimelineStep[] = [
  { status: 'pending', label: 'Posted', icon: 'fa-clipboard-check' },
  { status: 'claimed', label: 'Claimed', icon: 'fa-hand' },
  { status: 'pickedup', label: 'Picked Up', icon: 'fa-box' },
  { status: 'delivered', label: 'Delivered', icon: 'fa-truck' },
  { status: 'confirmed', label: 'Confirmed', icon: 'fa-circle-check' },
];
