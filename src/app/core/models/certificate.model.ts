/** Donor certificate — GET /api/certificates (`CertificateResponse`). */
export interface Certificate {
  id: string;
  certificateNumber: string;
  listingId: string;
  mealsCount: number;
  issuedAtUtc: string;
  /** Null until the PDF has been generated (GET .../pdf) at least once. */
  pdfUrl: string | null;
}
