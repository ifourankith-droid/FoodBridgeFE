import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import {
  ApiListingStatus,
  DietType,
  FreshnessTag,
  MealType,
  toListingStatus,
} from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { DialogService } from '@core/services/dialog.service';
import { DeadlineMeter } from '@shared/ui/deadline-meter/deadline-meter';
import { openImageDialog } from '@shared/ui/image-viewer/image-viewer-dialog';
import { Pill } from '@shared/ui/pill/pill';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { mediaUrl } from '@shared/util/media-url';

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
  /** Optional thumbnail — when present the card shows it in place of the icon. */
  imageUrl?: string | null;
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

  private readonly dialog = inject(DialogService);

  protected readonly status = computed<ListingStatus>(() => toListingStatus(this.listing().status));

  /** Broken image URLs fall back to the icon. */
  private readonly imageFailed = signal(false);
  protected readonly showImage = computed(() => !!this.listing().imageUrl && !this.imageFailed());

  /**
   * Absolutised against the API's origin — the API returns `/uploads/…`, which the browser would
   * otherwise resolve against the frontend's origin and 404 in production.
   */
  protected readonly resolvedImageUrl = computed(() => mediaUrl(this.listing().imageUrl));

  protected onClick(): void {
    if (this.clickable()) {
      this.cardClick.emit();
    }
  }

  /** Open the shared image viewer (item name as the heading). Stops the card click. */
  protected openImage(event: Event): void {
    event.stopPropagation();
    const url = this.listing().imageUrl;
    if (url) {
      openImageDialog(this.dialog, { title: this.listing().title, imageUrl: url });
    }
  }

  protected onImageError(): void {
    this.imageFailed.set(true);
  }
}
