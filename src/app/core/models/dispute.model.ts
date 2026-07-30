export type DisputeStatus = 'Open' | 'Resolved';

/**
 * Dispute — GET /api/disputes (`DisputeResponse`).
 *
 * The backend records *who* resolved it, not when: there is no `resolvedAtUtc` on
 * the DTO, so "resolved" is read off `status` / `resolvedByUserId`.
 */
export interface Dispute {
  id: string;
  listingId: string;
  raisedByUserId: string;
  reason: string;
  status: DisputeStatus;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
  createdAtUtc: string;
}

/** Request body for POST /api/disputes. */
export interface RaiseDisputeBody {
  listingId: string;
  reason: string;
}
