import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  ApiListingStatus,
  DietType,
  FreshnessTag,
  MealType,
  toListingStatus,
} from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { DeadlineMeter } from '@shared/ui/deadline-meter/deadline-meter';
import { Pill } from '@shared/ui/pill/pill';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';

/** Minimal shape a listing card needs — satisfied by ApiListingSummary and ApiListing. */
export interface ListingCardData {
  title: string;
  foodType: string;
  dietType: DietType | null;
  mealType: MealType | null;
  quantityMeals: number;
  freshnessTag: FreshnessTag;
  pickupDeadlineUtc: string;
  status: ApiListingStatus;
  /** Start of the pickup window; the deadline meter falls back to deadline − 6h without it. */
  createdAtUtc?: string;
}

/**
 * Reusable listing card: icon + title + food type, colour status badge, attribute
 * chips, an optional projected meta line, an optional deadline meter, and a
 * projected footer for action buttons.
 *
 * @example
 * <app-listing-card [listing]="l" [deadline]="true" [hasMeta]="true" [hasFooter]="true">
 *   <div cardMeta>…address / distance…</div>
 *   <div cardFooter class="flex gap-2.5">…buttons…</div>
 * </app-listing-card>
 */
@Component({
  selector: 'app-listing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadge, DeadlineMeter, Pill],
  templateUrl: './listing-card.html',
  styleUrl: './listing-card.scss',
  host: {
    '[class.clickable]': 'clickable()',
    '(click)': 'onClick()',
  },
})
export class ListingCard {
  readonly listing = input.required<ListingCardData>();
  readonly icon = input('fa-solid fa-utensils');
  /** Any CSS background value for the icon tile. */
  readonly iconBg = input('var(--fb-primary)');
  readonly deadline = input(true);
  readonly clickable = input(false);
  /** Render the `[cardMeta]` slot (extra lines under the chips, e.g. address + distance). */
  readonly hasMeta = input(false);
  readonly hasFooter = input(false);

  readonly cardClick = output<void>();

  protected readonly status = computed<ListingStatus>(() => toListingStatus(this.listing().status));

  protected onClick(): void {
    if (this.clickable()) {
      this.cardClick.emit();
    }
  }
}
