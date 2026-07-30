/** A `{ status, count }` breakdown bucket — `StatusCountResponse`. */
export interface StatusCount {
  status: string;
  count: number;
}

/** GET /api/admin/dashboard. */
export interface AdminDashboard {
  totalDonors: number;
  totalVolunteers: number;
  totalRecipients: number;
  pendingRecipients: number;
  totalListings: number;
  pendingListings: number;
  activeListings: number;
  confirmedListings: number;
  totalMealsDonated: number;
  totalCertificatesIssued: number;
  totalVolunteerPointsAwarded: number;
  openDisputes: number;
  resolvedDisputes: number;
  /** Per-status listing counts, chart-ready. */
  listingsByStatus: StatusCount[];
  /** Per-status account counts, chart-ready. */
  accountsByStatus: StatusCount[];
}

/** GET /api/admin/accounts row — `AdminUserSummaryResponse`. */
export interface AdminAccount {
  id: string;
  name: string;
  mobile: string;
  role: string;
  city: string | null;
  accountStatus: string;
  isAvailable: boolean;
  createdAtUtc: string;
}

/**
 * GET /api/admin/listings row — `AdminListingSummaryResponse`.
 *
 * Deliberately *not* `ApiListingSummary`: the admin view trades the food detail
 * (diet/meal/freshness) for the parties on the listing. Only the donor is named —
 * volunteer and recipient come back as ids, so the table shows presence, not names.
 */
export interface AdminListingSummary {
  id: string;
  title: string;
  status: string;
  donorId: string;
  donorName: string;
  volunteerId: string | null;
  recipientId: string | null;
  quantityMeals: number;
  pickupDeadlineUtc: string;
  createdAtUtc: string;
}
