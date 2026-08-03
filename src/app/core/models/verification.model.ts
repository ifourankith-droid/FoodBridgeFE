/** Kinds of verification evidence — matches the backend `UserDocumentType` enum names. */
export type UserDocumentType = 'IdProof' | 'Selfie';

/** One uploaded document — `UserDocumentResponse`. */
export interface UserDocument {
  id: string;
  type: UserDocumentType;
  /** Servable URL under `/uploads` (proxied in dev), same as avatars. */
  fileUrl: string;
  originalFileName: string | null;
  uploadedAtUtc: string;
}

/**
 * A user's verification state — `UserVerificationResponse`.
 *
 * Backing both the volunteer's own "am I approved yet?" screen and the admin's review panel,
 * from `GET /api/users/{id}/verification` (self or admin).
 *
 * Volunteers register as `Pending` and cannot claim or collect a listing until an admin has
 * reviewed their ID and selfie. Donors are `Verified` immediately and have no required documents.
 */
export interface UserVerification {
  userId: string;
  role: string;
  accountStatus: 'Pending' | 'Verified' | 'Suspended';
  documents: UserDocument[];
  /** What this role must submit. Empty ⇒ nothing to do. */
  requiredDocumentTypes: UserDocumentType[];
  /** Of the required set, what's still outstanding. */
  missingDocumentTypes: UserDocumentType[];
  /**
   * Everything required is in and the account is still Pending — the ball is with the admin.
   * Server-computed so this screen and the admin queue can't disagree.
   */
  isReadyForReview: boolean;
}

/** Human labels + guidance per document type, so copy lives in one place. */
export const DOCUMENT_META: Record<UserDocumentType, { label: string; hint: string; icon: string }> =
  {
    IdProof: {
      label: 'Government photo ID',
      hint: 'Aadhaar, driving licence, voter ID or passport. Any common image or a PDF, up to 5MB.',
      icon: 'fa-solid fa-id-card',
    },
    Selfie: {
      label: 'Selfie',
      hint: 'A clear photo of your face so we can check it against your ID.',
      icon: 'fa-solid fa-camera',
    },
  };
