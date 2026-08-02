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
  /** Verification documents this role must submit; empty when none are needed. */
  requiredDocumentTypes: string[];
  /** What they've actually uploaded. */
  submittedDocumentTypes: string[];
  /**
   * Pending *and* everything required is in — i.e. waiting on the admin, not on the user.
   * Server-computed, so don't re-derive it from the two arrays above.
   */
  isReadyForReview: boolean;
  /**
   * The user's submitted selfie URL (server-relative, under `/uploads`), or null. Batched into the
   * list response so the queue can show a face thumbnail without a per-row fetch. Absolutise with
   * `mediaUrl` before use.
   */
  selfieUrl: string | null;
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
