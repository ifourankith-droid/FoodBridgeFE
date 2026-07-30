import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiListing } from '@core/models/listing-api.model';
import { AuthService } from './auth.service';
import { DropOffSelection, ListingService } from './listing.service';
import { StorageService } from './storage.service';

/** localStorage key prefix — one bucket per volunteer id, so accounts never mix. */
const STORAGE_PREFIX = 'foodbridge.volunteerDeliveries';

/**
 * Holds the listings this volunteer has claimed and drives their pickup/delivery
 * confirmations.
 *
 * The backend (Phases 2–5) has no "list my active deliveries" endpoint yet — that
 * arrives with the Volunteer Data module (Phase 8) — and `GET /listings` is DonorOnly,
 * so there is no way to re-read a volunteer's claims from the server. Claims are
 * therefore tracked client-side from claim time and mirrored into localStorage
 * (keyed by user id) so My Deliveries survives a page reload instead of emptying.
 */
@Injectable({ providedIn: 'root' })
export class VolunteerDeliveriesStore {
  private readonly listingService = inject(ListingService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);

  private readonly items = signal<ApiListing[]>([]);

  /** Whose claims `items` currently holds — decides hydrate vs. persist below. */
  private hydratedFor: string | null = null;

  /** Everything tracked, newest first. */
  readonly all = this.items.asReadonly();

  /** Still-in-progress deliveries (claimed or picked up). */
  readonly active = computed(() =>
    this.items().filter((l) => l.status === 'Claimed' || l.status === 'PickedUp'),
  );

  /** Claimed but not yet collected — the volunteer still has to reach the donor. */
  readonly awaitingPickup = computed(() => this.items().filter((l) => l.status === 'Claimed'));

  /** Collected and on the way to the recipient or drop-off point. */
  readonly inTransit = computed(() => this.items().filter((l) => l.status === 'PickedUp'));

  /**
   * Handed over. `Confirmed` arrives either from a recipient signing off on a `Delivered`
   * listing, or directly from this volunteer's own confirm-delivery when no recipient was
   * matched — both are finished work from the volunteer's point of view.
   */
  readonly completed = computed(() =>
    this.items().filter((l) => l.status === 'Delivered' || l.status === 'Confirmed'),
  );

  /** Meals currently in the volunteer's hands (picked up, not yet delivered). */
  readonly mealsInTransit = computed(() =>
    this.inTransit().reduce((sum, l) => sum + l.quantityMeals, 0),
  );

  constructor() {
    // One effect for both directions: a change of user hydrates that user's bucket,
    // any other change writes the current list back to it.
    effect(() => {
      const userId = this.auth.currentUser()?.id ?? null;
      const items = this.items();
      if (!userId) {
        return;
      }
      if (this.hydratedFor !== userId) {
        this.hydratedFor = userId;
        this.items.set(this.storage.getItem<ApiListing[]>(this.storageKey(userId)) ?? []);
        return;
      }
      this.storage.setItem(this.storageKey(userId), items);
    });
  }

  /** Add a freshly claimed listing (or replace an existing entry). */
  track(listing: ApiListing): void {
    this.upsert(listing);
  }

  confirmPickup(id: string, photo: File): Observable<ApiListing> {
    return this.listingService.confirmPickup(id, photo).pipe(tap((l) => this.upsert(l)));
  }

  confirmDelivery(id: string, photo: File, dropOff: DropOffSelection): Observable<ApiListing> {
    return this.listingService.confirmDelivery(id, photo, dropOff).pipe(tap((l) => this.upsert(l)));
  }

  /**
   * Hand a claim back (Claimed → Pending) and stop tracking it — it belongs to the
   * open feed again, not to this volunteer.
   */
  release(id: string): Observable<ApiListing> {
    return this.listingService.unclaim(id).pipe(tap(() => this.drop(id)));
  }

  /** Forget a tracked listing without calling the API (e.g. clearing a finished row). */
  drop(id: string): void {
    this.items.update((list) => list.filter((l) => l.id !== id));
  }

  private upsert(listing: ApiListing): void {
    this.items.update((list) => {
      const rest = list.filter((l) => l.id !== listing.id);
      return [listing, ...rest];
    });
  }

  private storageKey(userId: string): string {
    return `${STORAGE_PREFIX}.${userId}`;
  }
}
