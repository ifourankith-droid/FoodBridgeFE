import { ChangeDetectionStrategy, Component, computed, inject, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, tap } from 'rxjs';
import { APP_ROUTES, fromView } from '@core/config/app-routes';
import {
  ApiListingSummary,
  DIET_LABELS,
  DietType,
  MealType,
  toListingStatus,
} from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';
import { DonorReport } from '@core/models/report.model';
import { DialogService } from '@core/services/dialog.service';
import { ListingService } from '@core/services/listing.service';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard } from '@shared/ui/listing-card/listing-card';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { FbMultiSelect, FbMultiSelectOption } from '@shared/ui/multi-select/multi-select';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
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
  imports: [FbButton, ListingCard, ListingGrid, FbMultiSelect, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="My Donations"
      description="Track every donation from post to certificate."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button icon="fa-solid fa-plus" (clicked)="create()">New Donation</app-button>
      </div>

      <div class="grid gap-4 xl:grid-cols-3 items-start">
        <div class="xl:col-span-2">
          <!-- Summary card (mirrors My Deliveries): lifetime totals + the filters. -->
          <div class="card-fb p-4 mb-4">
            <div class="flex items-center gap-3">
              <div
                class="stat-icon !mb-0"
                style="background:linear-gradient(135deg,var(--fb-primary),var(--fb-primary-deep))"
              >
                <i class="fa-solid fa-box-open"></i>
              </div>
              <div class="min-w-0">
                <div class="font-bold">
                  <span class="text-primary-deep text-2xl">{{ report()?.totalListings ?? 0 }}</span>
                  {{ (report()?.totalListings ?? 0) === 1 ? 'donation' : 'donations' }} posted
                </div>
                <div class="text-muted text-xs mt-0.5">
                  {{ report()?.totalMealsDonated ?? 0 }} meals donated ·
                  {{ report()?.totalCertificates ?? 0 }} certificates earned
                </div>
              </div>
            </div>

            <div class="filter-row">
              <app-multi-select
                icon="fa-solid fa-layer-group"
                allLabel="All statuses"
                [options]="statusOptions"
                [selected]="statusSel()"
                (selectionChange)="statusSel.set($event)"
              />
              <app-multi-select
                icon="fa-solid fa-leaf"
                allLabel="Any diet"
                [options]="dietOptions"
                [selected]="dietSel()"
                (selectionChange)="dietSel.set($event)"
              />
              <app-multi-select
                icon="fa-solid fa-clock"
                allLabel="Any meal"
                [options]="mealOptions"
                [selected]="mealSel()"
                (selectionChange)="mealSel.set($event)"
              />
              @if (hasFilters()) {
                <app-button type="button" [iconOnly]="true" variant="outline" icon="fa-solid fa-xmark" (click)="clearFilters()">
                  Clear
                </app-button>
              }
            </div>
          </div>

          <app-listing-grid
            [loading]="loading()"
            [empty]="!filtered().length"
            emptyIcon="fa-solid fa-box-open"
            gridClass="lg:grid-cols-2"
            [emptyText]="hasFilters() ? 'No donations match these filters' : 'No donations yet'"
          >
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
          </app-listing-grid>
        </div>

        <!-- Stats aside — sticky below the topbar (like the Notifications page). -->
        <aside class="flex flex-col gap-4 xl:sticky xl:top-[84px]">
          <!-- Status donut: how many listed, how many delivered, split by status. -->
          <div class="card-fb p-5">
            <div class="font-bold text-sm mb-4">Donation status</div>
            <div class="flex items-center gap-4">
              <div class="ring" [style.background]="donutBackground()">
                <div class="ring-inner">
                  <span class="ring-num">{{ totalCount() }}</span>
                  <span class="ring-cap">listed</span>
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
                    class="cat-row"
                    [class.is-active]="statusSel().includes(s.id)"
                    [attr.aria-pressed]="statusSel().includes(s.id)"
                    (click)="toggleStatus(s.id)"
                  >
                    <span class="cat-icon" [style.color]="s.color">
                      <i [class]="s.icon" aria-hidden="true"></i>
                    </span>
                    <span class="cat-label">{{ s.label }}</span>
                    <span class="cat-count">{{ s.count }}</span>
                    <span class="cat-bar" aria-hidden="true">
                      <span class="cat-fill" [style.width.%]="s.pct" [style.background]="s.color"></span>
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
                <div class="impact-num">{{ report()?.totalMealsDonated ?? 0 }}</div>
                <div class="text-muted text-[11px]">Meals donated</div>
              </div>
              <div>
                <div class="impact-num">{{ report()?.totalCertificates ?? 0 }}</div>
                <div class="text-muted text-[11px]">Certificates</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </app-page-wrapper>
  `,
  styles: `
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--fb-line);
    }
    .filter-row app-multi-select {
      flex: 0 1 auto;
      min-width: 170px;
    }

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

    /* ---- Status donut (data-driven conic gradient) ---- */
    .ring {
      width: 84px;
      height: 84px;
      flex-shrink: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
    }
    .ring-inner {
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: var(--fb-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .ring-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--fb-ink);
    }
    .ring-cap {
      margin-top: 2px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--fb-muted);
    }
    .impact-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      line-height: 1.1;
    }

    /* ---- By-status breakdown rows (mirrors the notifications aside) ---- */
    .cat-row {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      grid-template-areas:
        'icon label count'
        'icon bar   bar';
      align-items: center;
      gap: 7px 10px;
      width: 100%;
      padding: 8px 10px 9px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    }
    .cat-row:hover {
      background: rgb(var(--fb-primary-rgb) / 0.07);
    }
    .cat-row.is-active {
      background: rgb(var(--fb-primary-rgb) / 0.11);
      border-color: var(--fb-primary);
    }
    .cat-icon {
      grid-area: icon;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      font-size: 12px;
      background: color-mix(in srgb, currentColor 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);
    }
    .cat-icon i {
      color: color-mix(in srgb, currentColor 72%, #000);
    }
    :host-context(.dark) .cat-icon i {
      color: color-mix(in srgb, currentColor 62%, #fff);
    }
    .cat-label {
      grid-area: label;
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-ink);
    }
    .cat-count {
      grid-area: count;
      font-size: 12px;
      font-weight: 700;
      color: var(--fb-muted);
      font-variant-numeric: tabular-nums;
    }
    .cat-bar {
      grid-area: bar;
      height: 4px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--fb-line);
    }
    .cat-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .cat-row,
      .cat-fill {
        transition: none;
      }
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

  // ---- Filter options (icons per value) ----
  protected readonly statusOptions: FbMultiSelectOption[] = STATUSES.map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
    icon: STATUS_ICONS[s],
  }));
  protected readonly dietOptions: FbMultiSelectOption[] = [
    { value: 'Veg', label: DIET_LABELS.Veg, icon: 'fa-solid fa-leaf' },
    { value: 'NonVeg', label: DIET_LABELS.NonVeg, icon: 'fa-solid fa-drumstick-bite' },
  ];
  protected readonly mealOptions: FbMultiSelectOption[] = [
    { value: 'Breakfast', label: 'Breakfast', icon: 'fa-solid fa-mug-saucer' },
    { value: 'Lunch', label: 'Lunch', icon: 'fa-solid fa-bowl-food' },
    { value: 'Dinner', label: 'Dinner', icon: 'fa-solid fa-utensils' },
    { value: 'Snacks', label: 'Snacks', icon: 'fa-solid fa-cookie-bite' },
  ];

  // ---- Selected filter values (empty = no filter) ----
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

  protected clearFilters(): void {
    this.statusSel.set([]);
    this.dietSel.set([]);
    this.mealSel.set([]);
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
      header: { title: l.title, icon: 'fa-solid fa-utensils' },
      content: ListingDetailDialog,
      data: l,
      size: 'lg',
      actions: isPending
        ? [
          {
            id: 'cancel-listing',
            label: 'Cancel donation',
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
      confirmLabel: 'Cancel donation',
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
            this.toast.show('fa-solid fa-ban', 'Listing cancelled');
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
