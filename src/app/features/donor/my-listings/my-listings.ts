import { ChangeDetectionStrategy, Component, computed, inject, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, tap } from 'rxjs';
import { APP_ROUTES, fromView } from '@core/config/app-routes';
import { ApiListingSummary, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';
import { DonorReport } from '@core/models/report.model';
import { DialogService } from '@core/services/dialog.service';
import { ListingService } from '@core/services/listing.service';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { openDeliveryDialog } from '@shared/ui/delivery-dialog/delivery-dialog';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard } from '@shared/ui/listing-card/listing-card';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { ListingFilters } from '@shared/ui/listing-filters/listing-filters';
import { appDateTime } from '@shared/util/timezone';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { ListingDetailDialog } from './listing-detail-dialog';

/** Status order shown in the Status filter. */
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

/** One page big enough to hold a donor's full history — filtering is client-side. */
const LOAD_LIMIT = 500;

@Component({
  selector: 'app-my-listings',
  imports: [FbButton, ListingCard, ListingLayout, ListingFilters, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'My Donations'"
      description="Track every donation from post to certificate."
      [hasActions]="true"
      [hasAside]="true"
      [loading]="loading()"
      [empty]="!filtered().length"
      emptyIcon="fa-solid fa-box-open"
      gridClass="lg:grid-cols-2"
      [emptyTitle]="hasFilters() ? 'No donations match these filters' : 'No donations yet'"
      [emptyText]="
        hasFilters()
          ? 'Clear or widen the filters to see your other donations.'
          : 'Post surplus food and nearby volunteers are notified straight away.'
      "
      [emptyActionLabel]="hasFilters() ? 'Clear filters' : ''"
      emptyActionIcon="fa-solid fa-filter-circle-xmark"
      emptyActionVariant="outline"
      (emptyAction)="clearFilters()"
    >
      <div pageActions>
        <app-button icon="fa-solid fa-plus" (clicked)="create()">New Donation</app-button>
      </div>

      <!-- Summary: lifetime totals + the filters. -->
      <app-summary-header
        summary
        icon="fa-solid fa-box-open"
        [loading]="loading()"
        loadingText="Loading your donations…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ report()?.totalListings ?? 0 }}</span>
          {{ (report()?.totalListings ?? 0) === 1 ? 'donation' : 'donations' }} posted
        </span>
        <span subtitle class="text-muted">
          {{ report()?.totalMealsDonated ?? 0 }} meals donated ·
          {{ report()?.totalCertificates ?? 0 }} certificates earned
        </span>
      </app-summary-header>

      <app-listing-filters
        filters
        [showStatus]="true"
        [showDiet]="true"
        [showMeal]="true"
        [status]="statusSel()"
        (statusChange)="statusSel.set($event)"
        [diet]="dietSel()"
        (dietChange)="dietSel.set($event)"
        [meal]="mealSel()"
        (mealChange)="mealSel.set($event)"
      />

      @for (l of filtered(); track l.id) {
        <app-listing-card [listing]="l" [hasFooter]="true">
          <div cardFooter class="footer-actions">
            <app-button
              class="btn-view"
              size="sm"
              icon="fa fa-eye"
              [block]="true"
              (clicked)="openDetail(l)"
            >
              View
            </app-button>
            <!-- Kept visible but disabled once a volunteer's involved; the wrapper
                 carries the tooltip since a disabled button can't show its own. -->
            <span class="btn-edit" [title]="editHint(l)">
              <app-button
                variant="outline"
                size="sm"
                icon="fa-solid fa-pen"
                [block]="true"
                [disabled]="!canEdit(l)"
                (clicked)="edit(l)"
              >
                Edit
              </app-button>
            </span>
          </div>
        </app-listing-card>
      }

      <!-- Stats aside — sticky below the topbar (like the Notifications page). -->
      <ng-container aside>
        <!-- Status donut: how many listed, how many delivered, split by status. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Donation status</div>
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
            <p class="text-muted text-xs m-0">Post a donation to see the breakdown.</p>
          }
        </div>

        <!-- Impact -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Your impact</div>
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ report()?.totalMealsDonated ?? 0 }}</div>
              <div class="text-muted text-[11px]">Meals donated</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ report()?.totalCertificates ?? 0 }}</div>
              <div class="text-muted text-[11px]">Certificates</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    /* ---- Card footer actions: View (wide) + Edit (remaining) ---- */
    .footer-actions {
      display: flex;
      gap: 8px;
    }
    .btn-view {
      flex: 2 1 0;
      min-width: 0;
    }
    .btn-edit {
      flex: 1 1 0;
      min-width: 0;
      display: block;
    }
  `,
})
export class MyListings {
  private readonly listingService = inject(ListingService);
  private readonly reportService = inject(ReportService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Lifetime donor totals for the summary card. */
  protected readonly report = signal<DonorReport | null>(null);

  // ---- Selected filter values (empty = no filter); the dropdowns live in
  //      ListingFilters, this page owns the state it also filters the list with. ----
  protected readonly statusSel = signal<string[]>([]);
  protected readonly dietSel = signal<string[]>([]);
  protected readonly mealSel = signal<string[]>([]);

  protected readonly hasFilters = computed(
    () => !!(this.statusSel().length || this.dietSel().length || this.mealSel().length),
  );

  private readonly allListings = signal<ApiListingSummary[]>([]);
  protected readonly loading = signal(true);

  /** Accent per status — shared by the donut segments and the breakdown rows. */
  private readonly STATUS_COLOR: Record<ListingStatus, string> = {
    pending: '#ea580c',
    claimed: '#d97706',
    pickedup: '#4f46e5',
    delivered: '#059669',
    confirmed: '#0d9488',
    expired: '#64748b',
    cancelled: '#dc2626',
    rejected: '#e11d48',
  };

  /** Total listings loaded (basis for the donut + shares). */
  protected readonly totalCount = computed(() => this.allListings().length);

  /** Per-status counts with colour/icon + share-of-total, non-empty statuses only. */
  protected readonly statusStats = computed(() => {
    const rows = this.allListings();
    const total = rows.length || 1;
    const counts = {} as Record<ListingStatus, number>;
    for (const l of rows) {
      const s = toListingStatus(l.status);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return STATUSES.map((s) => ({
      id: s,
      label: STATUS_LABELS[s],
      icon: STATUS_ICONS[s],
      color: this.STATUS_COLOR[s],
      count: counts[s] ?? 0,
      pct: Math.round(((counts[s] ?? 0) / total) * 100),
    })).filter((row) => row.count > 0);
  });

  /** Delivered + confirmed = the food actually reached someone. */
  protected readonly deliveredCount = computed(
    () =>
      this.allListings().filter((l) => {
        const s = toListingStatus(l.status);
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

  /** Drop every filter at once — the empty state's way back to the full list. */
  protected clearFilters(): void {
    this.statusSel.set([]);
    this.dietSel.set([]);
    this.mealSel.set([]);
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

  /** The donor's listings narrowed by the three multi-select filters (client-side). */
  protected readonly filtered = computed<ApiListingSummary[]>(() => {
    const statuses = new Set(this.statusSel());
    const diets = new Set(this.dietSel());
    const meals = new Set(this.mealSel());
    return this.allListings().filter((l) => {
      if (statuses.size && !statuses.has(toListingStatus(l.status))) {
        return false;
      }
      if (diets.size && (!l.dietType || !diets.has(l.dietType))) {
        return false;
      }
      if (meals.size && (!l.mealType || !meals.has(l.mealType))) {
        return false;
      }
      return true;
    });
  });

  constructor() {
    this.load();
    this.reportService.donor().subscribe({
      next: (r) => this.report.set(r),
      error: () => undefined,
    });
  }

  protected statusOf(l: ApiListingSummary): ListingStatus {
    return toListingStatus(l.status);
  }

  /** Editing is only allowed while a listing is still Pending (backend enforces this too). */
  protected canEdit(l: ApiListingSummary): boolean {
    return this.statusOf(l) === 'pending';
  }

  /** Tooltip shown on the disabled Edit button explaining why it can't be edited. */
  protected editHint(l: ApiListingSummary): string {
    return this.canEdit(l) ? '' : 'Only pending donations can be edited';
  }

  /**
   * Show the rescue timeline for a listing. Edit and Cancel are only offered while it
   * is still Pending — once a volunteer has claimed it, neither is allowed server-side.
   *
   * Cancel confirms first (a second dialog on top of this one), then returns the request
   * so the button spins until the server answers.
   */
  protected openDetail(l: ApiListingSummary): void {
    const isPending = this.statusOf(l) === 'pending';
    this.dialog.open<ApiListingSummary, void, ListingDetailDialog>({
      header: {
        title: l.title,
        subtitle: `${l.foodType} · Pickup by ${appDateTime(l.pickupDeadlineUtc)}`,
        icon: 'fa-solid fa-utensils',
      },
      content: ListingDetailDialog,
      data: l,
      size: 'lg',
      actions: isPending
        ? [
          {
            id: 'cancel-listing',
            label: 'Cancel',
            icon: 'fa-solid fa-ban',
            variant: 'danger',
            align: 'start',
            handler: (ref) => this.cancelListing(l, ref),
          },
          {
            id: 'edit',
            label: 'Edit',
            icon: 'fa-solid fa-pen',
            variant: 'outline',
            handler: (ref) => {
              ref.close();
              this.edit(l);
            },
          },
          // Available for the whole time a listing is unclaimed, not just after the halfway
          // nudge — a donor who already knows nobody is coming shouldn't have to wait for a
          // timer. The nudge notification just draws attention to it.
          {
            id: 'self-deliver',
            label: 'Deliver it myself',
            icon: 'fa-solid fa-person-walking',
            variant: 'outline',
            handler: (ref) => {
              ref.close();
              this.selfDeliver(l);
            },
          },
          { id: 'close', label: 'Close', variant: 'ghost', close: true },
        ]
        : [
          // Only once someone else is involved: a Pending listing has no other
          // party to dispute with, and the backend rejects it anyway.
          ...(this.canDispute(l)
            ? [
              {
                id: 'dispute',
                label: 'Report an issue',
                icon: 'fa-solid fa-triangle-exclamation',
                variant: 'outline' as const,
                align: 'start' as const,
                handler: (ref: DialogRef<void, ListingDetailDialog>) => {
                  ref.close();
                  this.reportIssue(l);
                },
              },
            ]
            : []),
          { id: 'close', label: 'Close', variant: 'ghost', close: true },
        ],
    });
  }

  /** A donor can dispute any listing that actually reached a volunteer. */
  private canDispute(l: ApiListingSummary): boolean {
    const status = this.statusOf(l);
    return status !== 'pending' && status !== 'cancelled' && status !== 'expired';
  }

  protected reportIssue(l: ApiListingSummary): void {
    openRaiseDisputeDialog(this.dialog, this.injector, {
      listingId: l.id,
      listingTitle: l.title,
    });
  }

  /**
   * Open the create form; it returns here via its back button or after
   * submitting. The `from` state is what makes that back button appear — the
   * form hides it when opened from the sidebar or a deep link.
   */
  protected create(): void {
    this.router.navigate([APP_ROUTES.appView('create')], fromView('listings'));
  }

  protected edit(l: ApiListingSummary): void {
    this.router.navigate([APP_ROUTES.appView('create')], {
      queryParams: { edit: l.id },
      ...fromView('listings'),
    });
  }

  /**
   * Confirm, then cancel. Returns the request so the detail dialog's button keeps
   * spinning; on failure the toast explains and the dialog stays open.
   */
  private async cancelListing(
    l: ApiListingSummary,
    ref: DialogRef<void, ListingDetailDialog>,
  ): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Cancel this donation?',
      message: `"${l.title}" will be withdrawn and volunteers will no longer see it. This can't be undone.`,
      confirmLabel: 'Cancel',
      cancelLabel: 'Keep it',
      confirmVariant: 'danger',
      icon: 'fa-solid fa-ban',
    });
    if (!confirmed) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.listingService
        .cancel(l.id)
        .pipe(
          tap(() => {
            ref.close();
            // 'success' stated outright: the icon is the cancelled-status glyph,
            // which says nothing about whether the request worked.
            this.toast.show('fa-solid fa-ban', 'Listing cancelled', 'success');
            this.load();
          }),
          catchError((err: Error) => {
            this.toast.show(
              'fa-solid fa-triangle-exclamation',
              err.message || 'Could not cancel listing',
            );
            return EMPTY;
          }),
        )
        .subscribe({ complete: () => resolve() });
    });
  }

  /**
   * Deliver an unclaimed donation yourself instead of waiting for a volunteer — the escape hatch
   * the halfway-unclaimed notification points at.
   *
   * Reuses the volunteer's delivery dialog verbatim, so the donor picks from the same nearby
   * drop-off spots and produces the same delivery record. The listing summary carries no
   * coordinates, so fetch the detail first to centre the spot search on the pickup point.
   */
  private selfDeliver(l: ApiListingSummary): void {
    this.listingService
      .getById(l.id)
      .pipe(
        catchError((err: Error) => {
          this.toast.show(
            'fa-solid fa-triangle-exclamation',
            err.message || 'Could not open this donation',
          );
          return EMPTY;
        }),
      )
      .subscribe((listing) => {
        openDeliveryDialog(
          this.dialog,
          {
            latitude: listing.latitude,
            longitude: listing.longitude,
            suggestedLocationId: null,
            // Nobody comes after the donor: this is the last step, and it issues the certificate.
            completesDonation: true,
            // Self-delivery only exists while the listing is unclaimed, so there is never a
            // matched recipient to offer as the destination.
            recipientName: null,
            selfDelivery: true,
          },
          (photo, dropOff) =>
            this.listingService.selfDeliver(l.id, photo, dropOff).pipe(
              tap(() => {
                this.toast.show(
                  'fa-solid fa-circle-check',
                  'Delivered — your certificate is ready',
                );
                this.load();
              }),
              catchError((err: Error) => {
                this.toast.show(
                  'fa-solid fa-triangle-exclamation',
                  err.message || 'Could not record this delivery',
                );
                // Swallowed so the dialog stays open with the photo and spot intact — but the
                // list still reloads, because a 409 means a volunteer claimed it a moment ago
                // and the donor's card is now out of date.
                this.load();
                return EMPTY;
              }),
            ),
        );
      });
  }

  /** Load the donor's full listing history once; the multi-selects filter it client-side. */
  private load(): void {
    this.loading.set(true);
    this.listingService.listMine(undefined, 1, LOAD_LIMIT).subscribe({
      next: (rows) => {
        this.allListings.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load listings');
      },
    });
  }
}
