import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiListing } from '@core/models/listing-api.model';
import { AuthService } from './auth.service';
import { DropOffSelection, ListingService } from './listing.service';

/**
 * Holds the listings this volunteer has claimed and drives their pickup/delivery
 * confirmations.
 *
 * The list is loaded from the backend — `GET /listings/deliveries` returns every
 * listing whose `VolunteerId` is the signed-in volunteer, across all stages
 * (Claimed → Confirmed). It reloads whenever the signed-in volunteer changes.
 *
 * Confirmations and claims still update the in-memory list optimistically from
 * the action's own response (so, e.g., a just-picked-up listing keeps the
 * suggested drop-off the confirm-pickup call returned, which a plain reload
 * wouldn't carry), but the source of truth is the server, not local storage.
 */
@Injectable({ providedIn: 'root' })
export class VolunteerDeliveriesStore {
  private readonly listingService = inject(ListingService);
  private readonly auth = inject(AuthService);

  private readonly items = signal<ApiListing[]>([]);

  /** True while the volunteer's deliveries are being (re)loaded from the API. */
  readonly loading = signal(false);

  /** Whose deliveries `items` currently holds — guards a reload per signed-in volunteer. */
  private loadedFor: string | null = null;

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
    // Load the signed-in volunteer's claimed listings from the API, and reload
    // when the user changes. Non-volunteers (or signed-out) hold an empty list.
    effect(() => {
      const user = this.auth.currentUser();
      const id = user?.id ?? null;
      if (!id || user?.role !== 'volunteer') {
        this.items.set([]);
        this.loadedFor = null;
        return;
      }
      if (this.loadedFor !== id) {
        this.loadedFor = id;
        this.load();
      }
    });
  }

  /** (Re)fetch this volunteer's claimed listings from the backend. */
  load(): void {
    this.loading.set(true);
    this.listingService.myDeliveries().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Add a freshly claimed listing (or replace an existing entry) — optimistic. */
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
}
