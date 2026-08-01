import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiListingStatus, ApiTimelineEvent, toListingStatus } from '@core/models/listing-api.model';
import { AdminListingSummary } from '@core/models/admin.model';
import { ListingStatus } from '@core/models/listing.model';
import { ListingService } from '@core/services/listing.service';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { TimelineHorizontal } from '@shared/ui/timeline-horizontal/timeline-horizontal';
import { APP_LOCALE, APP_TIME_ZONE } from '@shared/util/timezone';

/**
 * Read-only detail for a platform listing, opened from the admin All Listings card.
 *
 * The admin list endpoint only names the donor — volunteer and recipient come back
 * as ids — so this shows *presence* of each party (with the id on hover) rather than
 * inventing names, then fetches the shared rescue timeline for the full step trail.
 */
@Component({
  selector: 'app-admin-listing-detail-dialog',
  imports: [StatusBadge, TimelineHorizontal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between gap-2">
      <app-status-badge [status]="status()" />
      <span class="text-muted text-xs">{{ meals() }} meals · pickup by {{ deadline() }}</span>
    </div>

    <!-- Who is on the listing. Only the donor is named; the rest are ids. -->
    <dl class="parties">
      <dt>Donor</dt>
      <dd>{{ listing.donorName }}</dd>
      <dt>Volunteer</dt>
      <dd>
        @if (listing.volunteerId) {
          <span class="assigned" [title]="listing.volunteerId">
            <i class="fa-solid fa-truck mr-1"></i>Assigned
          </span>
        } @else {
          <span class="text-muted">Not assigned</span>
        }
      </dd>
      <dt>Recipient</dt>
      <dd>
        @if (listing.recipientId) {
          <span class="assigned" [title]="listing.recipientId">
            <i class="fa-solid fa-building mr-1"></i>Assigned
          </span>
        } @else {
          <span class="text-muted">Not assigned</span>
        }
      </dd>
      <dt>Created</dt>
      <dd>{{ created() }}</dd>
    </dl>

    <div class="section-title mt-4 mb-1">Timeline</div>
    @if (loading()) {
      <p class="text-muted text-sm m-0">
        <i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading timeline…
      </p>
    } @else if (entries().length) {
      <app-timeline-horizontal [entries]="entries()" />
    } @else {
      <p class="text-muted text-sm m-0">No steps recorded yet.</p>
    }
  `,
  styles: `
    .parties {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 16px 0 0;
      font-size: 13px;
    }
    .parties dt {
      color: var(--fb-muted);
    }
    .parties dd {
      margin: 0;
      font-weight: 600;
    }
    .assigned {
      color: var(--fb-primary-deep);
      cursor: help;
    }
  `,
})
export class AdminListingDetailDialog {
  protected readonly listing = inject<AdminListingSummary>(DIALOG_DATA);

  private readonly listingService = inject(ListingService);

  protected readonly entries = signal<ApiTimelineEvent[]>([]);
  protected readonly loading = signal(true);

  protected readonly status = computed<ListingStatus>(() =>
    toListingStatus(this.listing.status as ApiListingStatus),
  );

  protected readonly meals = computed(() => this.listing.quantityMeals);

  constructor() {
    this.listingService.timeline(this.listing.id).subscribe({
      next: (events) => {
        this.entries.set(events);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected deadline(): string {
    return this.when(this.listing.pickupDeadlineUtc);
  }

  protected created(): string {
    return this.when(this.listing.createdAtUtc);
  }

  private when(iso: string): string {
    return new Date(iso).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
