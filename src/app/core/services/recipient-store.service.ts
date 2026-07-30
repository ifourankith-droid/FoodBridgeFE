import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiListing, ConfirmReceiptResult } from '@core/models/listing-api.model';
import { RecipientService } from './recipient.service';

/**
 * Holds the listings this recipient has accepted during the current session so
 * they can confirm receipt once delivered.
 *
 * The backend (Phase 6) lists a recipient's *incoming* (PickedUp) and *history*
 * (Confirmed) listings, but not the in-between "Delivered, awaiting my
 * confirmation" set — so accepted listings are tracked client-side. They don't
 * survive a full reload.
 */
@Injectable({ providedIn: 'root' })
export class RecipientStore {
  private readonly recipientService = inject(RecipientService);

  private readonly items = signal<ApiListing[]>([]);
  readonly accepted = computed(() => this.items());

  /** Track a listing the recipient just accepted. */
  track(listing: ApiListing): void {
    this.items.update((list) => [listing, ...list.filter((l) => l.id !== listing.id)]);
  }

  /** Confirm receipt; on success the listing drops out of the accepted set. */
  confirmReceipt(id: string): Observable<ConfirmReceiptResult> {
    return this.recipientService.confirmReceipt(id).pipe(
      tap(() => this.items.update((list) => list.filter((l) => l.id !== id))),
    );
  }
}
