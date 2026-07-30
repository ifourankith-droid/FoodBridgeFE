import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ApiListingSummary, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { Pill } from '@shared/ui/pill/pill';
import { RescueTimeline } from '@shared/ui/rescue-timeline/rescue-timeline';

/**
 * Body of the donor's listing-detail dialog: where the donation is in the rescue
 * chain, plus its attributes. The Edit / Cancel buttons are dialog actions owned
 * by the opener, so this stays a read-only view.
 */
@Component({
  selector: 'app-listing-detail-dialog',
  imports: [DatePipe, Pill, RescueTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-muted text-sm mb-3">
      {{ listing.foodType }} · Pickup by {{ listing.pickupDeadlineUtc | date: 'MMM d, h:mm a' }}
    </div>

    @if (isEnded()) {
      <div class="ended-banner">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span>{{ endedMessage() }}</span>
      </div>
    } @else {
      <app-rescue-timeline [status]="status()" />
    }

    <div class="flex flex-wrap gap-2 mt-4">
      <app-pill type="quantity" [value]="listing.quantityMeals" />
      <app-pill type="diet" [value]="listing.dietType" />
      <app-pill type="meal" [value]="listing.mealType" />
      <app-pill type="freshness" [value]="listing.freshnessTag" />
    </div>
  `,
  styles: `
    .ended-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 14px;
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    :host-context(body.dark) .ended-banner {
      background: var(--fb-bg);
      color: var(--fb-muted);
    }
    .ended-banner i {
      font-size: 18px;
    }
  `,
})
export class ListingDetailDialog {
  protected readonly listing = inject<ApiListingSummary>(DIALOG_DATA);

  protected readonly status = computed<ListingStatus>(() => toListingStatus(this.listing.status));

  /** Ended off the happy path (expired / cancelled / rejected) — no timeline to show. */
  protected readonly isEnded = computed(() => {
    const s = this.status();
    return s === 'expired' || s === 'cancelled' || s === 'rejected';
  });

  protected readonly endedMessage = computed(() => {
    switch (this.listing.status) {
      case 'Cancelled':
        return 'This listing was cancelled.';
      case 'Rejected':
        return 'This listing was rejected.';
      case 'Expired':
        return 'This listing’s pickup window expired before it was claimed.';
      default:
        return 'This listing is no longer active.';
    }
  });
}
