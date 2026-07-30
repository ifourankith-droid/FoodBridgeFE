import { computed, inject, Injectable, signal } from '@angular/core';
import { INITIAL_LISTINGS, NGO_LIST } from '@core/data/mock-data';
import { Listing, ListingStatus } from '@core/models/listing.model';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { ToastService } from '@core/services/toast.service';

export interface NewListing {
  foodType: Listing['foodType'];
  mealType: Listing['mealType'];
  quantity: string;
  freshness: string;
  pickupTime: string;
  address: string;
  notes: string;
}

/**
 * In-memory signal store for listings + the full status lifecycle
 * (claim → pickup → deliver → confirm), mirroring the prototype.
 * Swap the mutations for ListingService HTTP calls when a backend exists.
 */
@Injectable({ providedIn: 'root' })
export class ListingStore {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationService);

  readonly listings = signal<Listing[]>(structuredClone(INITIAL_LISTINGS));
  private counter = 100;

  private get me(): string {
    return this.auth.currentUser()?.name ?? '';
  }

  readonly mine = computed(() => this.listings().filter((l) => l.donor === this.me));
  readonly openListings = computed(() => this.listings().filter((l) => l.status === 'pending'));
  readonly incoming = computed(() => this.listings().filter((l) => l.status === 'pickedup'));

  byId(id: number): Listing | undefined {
    return this.listings().find((l) => l.id === id);
  }

  add(input: NewListing): void {
    this.counter++;
    const listing: Listing = {
      id: this.counter,
      donor: this.me,
      status: 'pending',
      volunteer: null,
      recipient: null,
      ...input,
    };
    this.listings.update((list) => [listing, ...list]);
    this.toast.show('fa-solid fa-circle-check', 'Listing posted — nearby volunteers notified!');
    this.notifications.push('fa-solid fa-circle-plus', `Your listing (${input.quantity}) is live`);
  }

  update(id: number, input: NewListing): void {
    this.patch(id, { ...input });
    this.toast.show('fa-solid fa-circle-check', 'Listing updated');
  }

  cancel(id: number): void {
    this.listings.update((list) => list.filter((l) => l.id !== id));
    this.toast.show('fa-solid fa-ban', 'Listing cancelled');
  }

  claim(id: number): void {
    this.patch(id, { status: 'claimed', volunteer: this.me });
    this.toast.show('fa-solid fa-circle-check', 'Listing claimed — starting navigation');
    this.notifications.push('fa-solid fa-truck', `${this.me} claimed a listing near you`);
  }

  confirmPickup(id: number): void {
    const recipient = NGO_LIST[Math.floor(this.byId(id)!.id % NGO_LIST.length)];
    this.patch(id, { status: 'pickedup', recipient });
    this.toast.show('fa-solid fa-circle-check', `Pickup confirmed — matched with ${recipient}`);
    this.notifications.push('fa-solid fa-box', `Pickup completed — en route to ${recipient}`);
  }

  confirmDelivery(id: number): void {
    this.patch(id, { status: 'delivered' });
    this.toast.show('fa-solid fa-circle-check', 'Delivery marked complete — awaiting confirmation');
    this.notifications.push('fa-solid fa-truck-ramp-box', 'Delivery completed — awaiting confirmation');
  }

  accept(id: number): void {
    this.patch(id, { recipient: this.me });
    this.toast.show('fa-solid fa-circle-check', "Accepted — you're expecting this delivery");
  }

  reject(id: number): void {
    const alt = NGO_LIST.filter((n) => n !== this.me);
    this.patch(id, { recipient: alt[this.byId(id)!.id % alt.length] });
    this.toast.show('fa-solid fa-rotate', 'Reassigned to another nearby organization');
  }

  confirmReceipt(id: number): void {
    this.patch(id, { status: 'confirmed' });
    const donor = this.byId(id)?.donor ?? '';
    this.toast.show('fa-solid fa-circle-check', 'Delivery confirmed — donor certificate issued');
    this.notifications.push('fa-solid fa-award', `Certificate generated for ${donor}`);
  }

  private patch(id: number, changes: Partial<Listing>): void {
    this.listings.update((list) =>
      list.map((l) => (l.id === id ? { ...l, ...changes } : l)),
    );
  }
}

export function statusLabel(status: ListingStatus): string {
  return status;
}
