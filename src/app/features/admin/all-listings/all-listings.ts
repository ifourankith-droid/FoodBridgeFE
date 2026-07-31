import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminListingSummary } from '@core/models/admin.model';
import { ApiListingStatus, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { AdminService } from '@core/services/admin.service';
import { ToastService } from '@core/services/toast.service';
import { InfiniteScroll } from '@shared/directives/infinite-scroll.directive';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { APP_LOCALE, APP_TIME_ZONE } from '@shared/util/timezone';

type Filter = 'all' | ApiListingStatus;

const PAGE_SIZE = 30;

/** Server enum name → the label the admin sees on the filter chip. */
const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Claimed', label: 'Claimed' },
  { id: 'PickedUp', label: 'Picked Up' },
  { id: 'Delivered', label: 'Delivered' },
  { id: 'Confirmed', label: 'Confirmed' },
  { id: 'Expired', label: 'Expired' },
  { id: 'Cancelled', label: 'Cancelled' },
  { id: 'Rejected', label: 'Rejected' },
];

/**
 * Platform-wide listing table, from `GET /admin/listings`.
 *
 * The status filter is a **server-side** query param, not a client filter over a
 * fetched page — with paging, filtering locally would only ever search the rows
 * already downloaded.
 *
 * The endpoint names only the donor; volunteer and recipient come back as ids
 * (`AdminListingSummaryResponse`), so those columns show *whether* a party is
 * assigned, with the id on hover — not a name the API never sent.
 */
@Component({
  selector: 'app-all-listings',
  imports: [
    DecimalPipe,
    InfiniteScroll,
    FbButton,
    StatusBadge,
    EmptyState,
    PageWrapper,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="All Listings"
      description="Full live status trail across every listing on the platform."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="reload()">
          Refresh
        </app-button>
      </div>

      <div class="flex flex-wrap gap-2 mb-4">
        @for (f of FILTERS; track f.id) {
          <button
            [class]="(filter() === f.id ? 'btn-fb' : 'btn-fb-outline') + ' !py-1.5 !px-3 !text-sm'"
            (click)="setFilter(f.id)"
          >
            {{ f.label }}
          </button>
        }
      </div>

      <div class="card-fb overflow-hidden !p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left" style="background:var(--fb-primary-soft)">
                <th class="small-label px-4 py-3">Listing</th>
                <th class="small-label py-3">Donor</th>
                <th class="small-label py-3">Meals</th>
                <th class="small-label py-3">Volunteer</th>
                <th class="small-label py-3">Recipient</th>
                <th class="small-label py-3">Deadline</th>
                <th class="small-label py-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (s of skeletons; track $index) {
                  <tr class="border-t border-line">
                    <td class="px-4 py-3"><div class="skeleton h-3.5 w-40"></div></td>
                    <td class="py-3"><div class="skeleton h-3 w-24"></div></td>
                    <td class="py-3"><div class="skeleton h-3 w-8"></div></td>
                    <td class="py-3"><div class="skeleton h-3 w-16"></div></td>
                    <td class="py-3"><div class="skeleton h-3 w-16"></div></td>
                    <td class="py-3"><div class="skeleton h-3 w-24"></div></td>
                    <td class="py-3 pr-4"><div class="skeleton h-5 w-20"></div></td>
                  </tr>
                }
              } @else {
                @for (l of rows(); track l.id) {
                  <tr class="border-t border-line">
                    <td class="px-4 py-3 font-semibold">{{ l.title }}</td>
                    <td class="py-3 text-muted">{{ l.donorName }}</td>
                    <td class="py-3 text-muted">{{ l.quantityMeals | number }}</td>
                    <td class="py-3">
                      @if (l.volunteerId) {
                        <span class="party" [title]="l.volunteerId">
                          <i class="fa-solid fa-truck mr-1"></i>Assigned
                        </span>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td class="py-3">
                      @if (l.recipientId) {
                        <span class="party" [title]="l.recipientId">
                          <i class="fa-solid fa-building mr-1"></i>Assigned
                        </span>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td class="py-3 text-muted whitespace-nowrap">{{ when(l.pickupDeadlineUtc) }}</td>
                    <td class="py-3 pr-4"><app-status-badge [status]="statusOf(l)" /></td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7">
                      <app-empty-state
                        size="sm"
                        icon="fa-solid fa-inbox"
                        text="No listings match this filter"
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (!loading() && rows().length) {
        <div
          appInfiniteScroll
          [appInfiniteScrollDisabled]="loadingMore() || done()"
          (scrolled)="loadMore()"
          class="py-5 text-center text-muted text-sm"
        >
          @if (loadingMore()) {
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading more…
          } @else if (done()) {
            {{ rows().length }} {{ rows().length === 1 ? 'listing' : 'listings' }} shown — that's all of them.
          }
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* An assigned party we can only identify by id — readable, not a fake name. */
    .party {
      font-size: 12px;
      font-weight: 600;
      color: var(--fb-primary-deep);
      cursor: help;
    }
  `,
})
export class AllListings {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  protected readonly FILTERS = FILTERS;
  protected readonly skeletons = Array.from({ length: 8 });

  protected readonly rows = signal<AdminListingSummary[]>([]);
  protected readonly filter = signal<Filter>('all');
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  /** True once a short page proves there is nothing left to fetch. */
  protected readonly done = signal(false);

  private page = 1;

  constructor() {
    this.reload();
  }

  protected statusOf(l: AdminListingSummary): ListingStatus {
    return toListingStatus(l.status as ApiListingStatus);
  }

  protected setFilter(f: Filter): void {
    if (this.filter() !== f) {
      this.filter.set(f);
      this.reload();
    }
  }

  protected reload(): void {
    this.page = 1;
    this.done.set(false);
    this.loading.set(true);
    this.fetch().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.done.set(rows.length < PAGE_SIZE);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.error(err.message || 'Could not load listings');
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore() || this.done()) {
      return;
    }
    this.loadingMore.set(true);
    this.page += 1;
    this.fetch().subscribe({
      next: (rows) => {
        this.rows.update((list) => [...list, ...rows]);
        this.done.set(rows.length < PAGE_SIZE);
        this.loadingMore.set(false);
      },
      error: (err: Error) => {
        // Step back so the same page is retried on the next scroll.
        this.page -= 1;
        this.loadingMore.set(false);
        this.toast.error(err.message || 'Could not load more listings');
      },
    });
  }

  private fetch() {
    const status = this.filter() === 'all' ? undefined : this.filter();
    return this.admin.listings(status, this.page, PAGE_SIZE);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
