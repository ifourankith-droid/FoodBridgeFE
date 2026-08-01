import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiListingSummary, ApiTimelineEvent, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { ListingService } from '@core/services/listing.service';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { Pill } from '@shared/ui/pill/pill';
import { TimelineHorizontal } from '@shared/ui/timeline-horizontal/timeline-horizontal';

/**
 * Body of the donor's listing-detail dialog: where the donation is in the rescue
 * chain, its attributes, and the full step-by-step timeline (each status with who
 * did it, when, and any proof photo) fetched from the shared timeline endpoint.
 * The Edit / Cancel buttons are dialog actions owned by the opener, so this stays
 * a read-only view.
 */
@Component({
  selector: 'app-listing-detail-dialog',
  imports: [Pill, TimelineHorizontal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isEnded()) {
      <div class="ended-banner">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span>{{ endedMessage() }}</span>
      </div>
    }

    <div class="flex flex-wrap gap-2 mt-4">
      <app-pill type="quantity" [value]="listing.quantityMeals" />
      <app-pill type="diet" [value]="listing.dietType" />
      <app-pill type="meal" [value]="listing.mealType" />
      <app-pill type="freshness" [value]="listing.freshnessTag" />
    </div>

    @if (!isEnded()) {
      <div class="section-title mt-4 mb-1">Timeline</div>
      @if (loading()) {
        <p class="text-muted text-sm m-0"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading timeline…</p>
      } @else if (entries().length) {
        <app-timeline-horizontal [entries]="entries()" />
      } @else {
        <p class="text-muted text-sm m-0">No steps recorded yet.</p>
      }
    }
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

  private readonly listingService = inject(ListingService);

  protected readonly entries = signal<ApiTimelineEvent[]>([]);
  protected readonly loading = signal(true);

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

  constructor() {
    this.listingService.timeline(this.listing.id).subscribe({
      next: (events) => {
        this.entries.set(events);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
