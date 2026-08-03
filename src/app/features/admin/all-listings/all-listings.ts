import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminListingSummary } from '@core/models/admin.model';
import { ApiListingStatus, FreshnessTag, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';
import { AdminService } from '@core/services/admin.service';
import { DialogService } from '@core/services/dialog.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { ListingCard, ListingCardData } from '@shared/ui/listing-card/listing-card';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { ListingFilters, statusOptionsFrom } from '@shared/ui/listing-filters/listing-filters';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { AdminListingDetailDialog } from './admin-listing-detail-dialog';

/** Status order shown in the Status filter + the aside breakdown. */
const STATUSES: readonly ListingStatus[] = [
  'pending',
  'claimed',
  'pickedup',
  'delivered',
  'confirmed',
  'expired',
  'cancelled',
  'rejected',
];

/** One page big enough to hold the platform history — filtering is client-side. */
const LOAD_LIMIT = 500;

/** Accent per status — shared by the donut segments and the breakdown rows. */
const STATUS_COLOR: Record<ListingStatus, string> = {
  pending: '#ea580c',
  claimed: '#d97706',
  pickedup: '#4f46e5',
  delivered: '#059669',
  confirmed: '#0d9488',
  expired: '#64748b',
  cancelled: '#dc2626',
  rejected: '#e11d48',
};

/** A platform listing paired with the common card shape it renders as. */
interface AdminRow {
  source: AdminListingSummary;
  card: ListingCardData;
}

/**
 * Map the admin summary onto the shared {@link ListingCardData}. The admin endpoint
 * trades food detail (diet/meal/freshness) for the parties, so those chips render
 * as "—"; the donor's name rides the food-type line and the parties go in the meta
 * slot the card projects.
 */
function toCard(l: AdminListingSummary): ListingCardData {
  return {
    title: l.title,
    foodType: l.donorName ? `by ${l.donorName}` : '',
    dietType: null,
    mealType: null,
    quantityMeals: l.quantityMeals,
    freshnessTag: '' as FreshnessTag,
    pickupDeadlineUtc: l.pickupDeadlineUtc,
    status: l.status as ApiListingStatus,
    createdAtUtc: l.createdAtUtc,
  };
}

/**
 * Platform-wide listings, from `GET /admin/listings`.
 *
 * Renders the same shell as the donor/volunteer listing pages — common cards, the
 * shared status filter, and a sticky stats aside with the status donut — so the
 * admin view reads as one family with the rest of the app. The full history is
 * loaded once and filtered client-side, matching My Donations.
 */
@Component({
  selector: 'app-all-listings',
  imports: [DecimalPipe, FbButton, ListingCard, ListingLayout, ListingFilters, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'All Listings'"
      description="Full live status trail across every listing on the platform."
      [hasActions]="true"
      [hasAside]="true"
      [loading]="loading()"
      [empty]="!filtered().length"
      emptyIcon="fa-solid fa-inbox"
      gridClass="lg:grid-cols-2"
      [emptyText]="statusSel().length ? 'No listings match this filter' : 'No listings yet'"
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="reload()">
          Refresh
        </app-button>
      </div>

      <!-- Summary: how many listings are loaded + their platform footprint. -->
      <app-summary-header
        summary
        icon="fa-solid fa-list-check"
        [loading]="loading()"
        loadingText="Loading listings…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ totalCount() }}</span>
          {{ totalCount() === 1 ? 'listing' : 'listings' }}
        </span>
        <span subtitle class="text-muted">
          {{ mealsTotal() | number }} meals · {{ assignedVolunteers() }} with a volunteer
        </span>
      </app-summary-header>

      <!-- Shared status filter (client-side over the loaded set). -->
      <app-listing-filters
        filters
        [showStatus]="true"
        [statusOptions]="statusOptions"
        [status]="statusSel()"
        (statusChange)="statusSel.set($event)"
      />

      @for (r of filtered(); track r.source.id) {
        <app-listing-card [listing]="r.card" [hasMeta]="true" [hasFooter]="true">
          <!-- Parties: only the donor is named; volunteer/recipient show presence. -->
          <div cardMeta class="admin-parties">
            <span [class.text-muted]="!r.source.volunteerId">
              <i class="fa-solid fa-truck mr-1"></i>{{ r.source.volunteerId ? 'Volunteer assigned' : 'No volunteer' }}
            </span>
            <span [class.text-muted]="!r.source.recipientId">
              <i class="fa-solid fa-building mr-1"></i>{{ r.source.recipientId ? 'Recipient assigned' : 'No recipient' }}
            </span>
          </div>
          <div cardFooter>
            <app-button
              size="sm"
              variant="outline"
              icon="fa fa-eye"
              [block]="true"
              (clicked)="openDetail(r.source)"
            >
              View
            </app-button>
          </div>
        </app-listing-card>
      }

      <!-- Sticky stats aside — the status donut, same as the donor listing page. -->
      <ng-container aside>
        <!-- Status donut: how many listed, how many reached someone, split by status. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Listing status</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ totalCount() }}</span>
                <span class="fb-ring-cap">listed</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Delivered</div>
              <div class="font-bold text-xl text-success-deep">{{ deliveredCount() }}</div>
              @if (totalCount()) {
                <div class="text-primary-deep text-xs font-semibold mt-1">
                  {{ deliveredPct() }}% completed
                </div>
              }
            </div>
          </div>
        </div>

        <!-- By status — each row toggles that status in the filter. -->
        <div class="card-fb p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-sm">By status</div>
            @if (statusSel().length) {
              <button type="button" class="fb-link text-xs" (click)="statusSel.set([])">Clear</button>
            }
          </div>
          @if (totalCount()) {
            <div class="flex flex-col gap-1">
              @for (s of statusStats(); track s.id) {
                <button
                  type="button"
                  class="fb-cat-row"
                  [class.is-active]="statusSel().includes(s.id)"
                  [attr.aria-pressed]="statusSel().includes(s.id)"
                  (click)="toggleStatus(s.id)"
                >
                  <span class="fb-cat-icon" [style.color]="s.color">
                    <i [class]="s.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ s.label }}</span>
                  <span class="fb-cat-count">{{ s.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="s.pct" [style.background]="s.color"></span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No listings loaded yet.</p>
          }
        </div>

        <!-- Reach: the platform footprint of every loaded listing. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Reach</div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ mealsTotal() | number }}</div>
              <div class="text-muted text-[11px]">Meals</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ assignedVolunteers() }}</div>
              <div class="text-muted text-[11px]">Volunteers</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ assignedRecipients() }}</div>
              <div class="text-muted text-[11px]">Recipients</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    /* Parties meta line inside the card — wraps to two rows on a narrow card. */
    .admin-parties {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fb-primary-deep);
    }
  `,
})
export class AllListings {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  /** The Status facet lists every lifecycle value, in canonical order. */
  protected readonly statusOptions = statusOptionsFrom(STATUSES);

  private readonly allListings = signal<AdminListingSummary[]>([]);
  protected readonly loading = signal(true);

  /** Selected statuses (empty = no filter); bound to the shared filter row. */
  protected readonly statusSel = signal<string[]>([]);

  /** Total listings loaded (basis for the donut + shares). */
  protected readonly totalCount = computed(() => this.allListings().length);

  /** The listings narrowed by the status filter, each paired with its card shape. */
  protected readonly filtered = computed<AdminRow[]>(() => {
    const statuses = new Set(this.statusSel());
    return this.allListings()
      .filter((l) => !statuses.size || statuses.has(toListingStatus(l.status as ApiListingStatus)))
      .map((l) => ({ source: l, card: toCard(l) }));
  });

  /** Per-status counts with colour/icon + share-of-total, non-empty statuses only. */
  protected readonly statusStats = computed(() => {
    const rows = this.allListings();
    const total = rows.length || 1;
    const counts = {} as Record<ListingStatus, number>;
    for (const l of rows) {
      const s = toListingStatus(l.status as ApiListingStatus);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return STATUSES.map((s) => ({
      id: s,
      label: STATUS_LABELS[s],
      icon: STATUS_ICONS[s],
      color: STATUS_COLOR[s],
      count: counts[s] ?? 0,
      pct: Math.round(((counts[s] ?? 0) / total) * 100),
    })).filter((row) => row.count > 0);
  });

  /** Delivered + confirmed = the food actually reached someone. */
  protected readonly deliveredCount = computed(
    () =>
      this.allListings().filter((l) => {
        const s = toListingStatus(l.status as ApiListingStatus);
        return s === 'delivered' || s === 'confirmed';
      }).length,
  );

  protected readonly deliveredPct = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.deliveredCount() / total) * 100) : 0;
  });

  /** Multi-segment conic gradient for the status donut. */
  protected readonly donutBackground = computed(() => {
    const total = this.totalCount();
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    let acc = 0;
    const segments = this.statusStats().map((s) => {
      const start = (acc / total) * 100;
      acc += s.count;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  protected readonly mealsTotal = computed(() =>
    this.allListings().reduce((sum, l) => sum + l.quantityMeals, 0),
  );
  protected readonly assignedVolunteers = computed(
    () => this.allListings().filter((l) => l.volunteerId).length,
  );
  protected readonly assignedRecipients = computed(
    () => this.allListings().filter((l) => l.recipientId).length,
  );

  constructor() {
    this.reload();
  }

  /** Toggle a status in the filter (from a breakdown row). */
  protected toggleStatus(id: string): void {
    const set = new Set(this.statusSel());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.statusSel.set([...set]);
  }

  protected reload(): void {
    this.loading.set(true);
    this.admin.listings(undefined, 1, LOAD_LIMIT).subscribe({
      next: (rows) => {
        this.allListings.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.error(err.message || 'Could not load listings');
      },
    });
  }

  /** Read-only detail: parties + the shared rescue timeline. */
  protected openDetail(l: AdminListingSummary): void {
    this.dialog.open<AdminListingSummary, void, AdminListingDetailDialog>({
      header: {
        title: l.title,
        subtitle: `Posted by ${l.donorName}`,
        icon: 'fa-solid fa-utensils',
      },
      content: AdminListingDetailDialog,
      data: l,
      size: 'lg',
      actions: [{ id: 'close', label: 'Close', variant: 'ghost', close: true }],
    });
  }
}
