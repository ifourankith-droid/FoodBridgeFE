import { ChangeDetectionStrategy, Component, inject, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, tap } from 'rxjs';
import { APP_ROUTES, fromView } from '@core/config/app-routes';
import {
  ApiListingStatus,
  ApiListingSummary,
  DIET_LABELS,
  DietType,
  MealType,
  toListingStatus,
} from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';
import { DialogService } from '@core/services/dialog.service';
import { ListingService } from '@core/services/listing.service';
import { ToastService } from '@core/services/toast.service';
import { InfiniteScroll } from '@shared/directives/infinite-scroll.directive';
import { FbButton } from '@shared/ui/button/button';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard } from '@shared/ui/listing-card/listing-card';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { ListingDetailDialog } from './listing-detail-dialog';

type Tab = 'all' | ListingStatus;

const PAGE_SIZE = 9;

@Component({
  selector: 'app-my-listings',
  imports: [FbButton, InfiniteScroll, ListingCard, ListingGrid, PageWrapper],
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

      <div class="flex flex-wrap gap-2 mb-3">
        @for (t of tabs; track t) {
          <button [class]="'tab-pill ' + tabClass(t)" (click)="setTab(t)">
            <i [class]="tabIcon[t]"></i><span>{{ tabLabel[t] }}</span>
          </button>
        }
      </div>

      <!-- Food filters, narrowed server-side alongside the status tab. -->
      <div class="filter-bar mb-4">
        <div class="filter-group">
          <span class="small-label !mb-0">Diet</span>
          @for (d of dietOptions; track d.id) {
            <button
              [class]="'chip' + (diet() === d.id ? ' on' : '')"
              (click)="setDiet(d.id)"
            >
              {{ d.label }}
            </button>
          }
        </div>
        <div class="filter-group">
          <span class="small-label !mb-0">Meal</span>
          @for (m of mealOptions; track m.id) {
            <button
              [class]="'chip' + (meal() === m.id ? ' on' : '')"
              (click)="setMeal(m.id)"
            >
              {{ m.label }}
            </button>
          }
        </div>
      </div>

      <app-listing-grid
        [loading]="loading()"
        [empty]="!listings().length"
        emptyIcon="fa-solid fa-box-open"
        emptyText="No listings match these filters"
      >
        @for (l of listings(); track l.id) {
          <app-listing-card [listing]="l" [clickable]="true" (cardClick)="openDetail(l)" />
        }
      </app-listing-grid>

      @if (!loading()) {
        <div
          appInfiniteScroll
          [appInfiniteScrollDisabled]="loadingMore() || done()"
          (scrolled)="loadMore()"
          class="py-5 text-center text-muted text-sm"
        >
          @if (loadingMore()) {
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading more…
          } @else if (done() && listings().length) {
            <span class="opacity-70">You've reached the end</span>
          }
        </div>
      }

    </app-page-wrapper>
  `,
  styles: `
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 22px;
    }
    .filter-group {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      padding: 4px 11px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: transparent;
      color: var(--fb-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition:
        color 0.15s ease,
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .chip:hover {
      color: var(--fb-primary-deep);
      border-color: var(--fb-primary);
    }
    .chip.on {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
    }
    .tab-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 16px;
      font-size: 13.5px;
      font-weight: 600;
      border-radius: 999px;
      border: 1.5px solid transparent;
      background: transparent;
      cursor: pointer;
      transition:
        background 0.15s ease,
        color 0.15s ease,
        border-color 0.15s ease;
    }
    .tab-pill i {
      font-size: 0.9em;
    }
    /* Per-status colours (match the status badges) */
    .t-all {
      color: var(--fb-primary-deep);
      border-color: var(--fb-primary);
    }
    .t-all:hover {
      background: var(--fb-primary-soft);
    }
    .t-all.active {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
    }
    .t-pending {
      color: #ea580c;
      border-color: #ea580c;
    }
    .t-pending:hover {
      background: rgba(234, 88, 12, 0.1);
    }
    .t-pending.active {
      background: #ea580c;
      border-color: #ea580c;
      color: #fff;
    }
    .t-claimed {
      color: #d97706;
      border-color: #d97706;
    }
    .t-claimed:hover {
      background: rgba(217, 119, 6, 0.1);
    }
    .t-claimed.active {
      background: #d97706;
      border-color: #d97706;
      color: #fff;
    }
    .t-delivered {
      color: #059669;
      border-color: #059669;
    }
    .t-delivered:hover {
      background: rgba(5, 150, 105, 0.1);
    }
    .t-delivered.active {
      background: #059669;
      border-color: #059669;
      color: #fff;
    }
    .t-expired {
      color: #64748b;
      border-color: #94a3b8;
    }
    .t-expired:hover {
      background: rgba(100, 116, 139, 0.1);
    }
    .t-expired.active {
      background: #64748b;
      border-color: #64748b;
      color: #fff;
    }
    .t-pickedup {
      color: #4f46e5;
      border-color: #6366f1;
    }
    .t-pickedup:hover {
      background: rgba(79, 70, 229, 0.1);
    }
    .t-pickedup.active {
      background: #4f46e5;
      border-color: #4f46e5;
      color: #fff;
    }
    .t-confirmed {
      color: #0d9488;
      border-color: #14b8a6;
    }
    .t-confirmed:hover {
      background: rgba(13, 148, 136, 0.1);
    }
    .t-confirmed.active {
      background: #0d9488;
      border-color: #0d9488;
      color: #fff;
    }
    .t-cancelled {
      color: #dc2626;
      border-color: #ef4444;
    }
    .t-cancelled:hover {
      background: rgba(220, 38, 38, 0.1);
    }
    .t-cancelled.active {
      background: #dc2626;
      border-color: #dc2626;
      color: #fff;
    }
    .t-rejected {
      color: #e11d48;
      border-color: #f43f5e;
    }
    .t-rejected:hover {
      background: rgba(225, 29, 72, 0.1);
    }
    .t-rejected.active {
      background: #e11d48;
      border-color: #e11d48;
      color: #fff;
    }
  `,
})
export class MyListings {
  private readonly listingService = inject(ListingService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly tabs: Tab[] = [
    'all',
    'pending',
    'claimed',
    'pickedup',
    'delivered',
    'confirmed',
    'expired',
    'cancelled',
    'rejected',
  ];
  protected readonly tab = signal<Tab>('all');

  /** Icon per tab (colour handled by the `.t-*` component styles). */
  protected readonly tabIcon: Record<Tab, string> = {
    all: 'fa-solid fa-layer-group',
    ...STATUS_ICONS,
  };

  /** Label per tab. */
  protected readonly tabLabel: Record<Tab, string> = {
    all: 'All',
    ...STATUS_LABELS,
  };

  protected tabClass(t: Tab): string {
    return `t-${t}${this.tab() === t ? ' active' : ''}`;
  }

  protected readonly listings = signal<ApiListingSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly done = signal(false);

  private page = 1;

  // ---- Food filters (server-side, like the volunteer's Nearby feed) ----
  protected readonly dietOptions: readonly { id: DietType | 'all'; label: string }[] = [
    { id: 'all', label: 'Any' },
    { id: 'Veg', label: DIET_LABELS.Veg },
    { id: 'NonVeg', label: DIET_LABELS.NonVeg },
  ];
  protected readonly mealOptions: readonly { id: MealType | 'all'; label: string }[] = [
    { id: 'all', label: 'Any' },
    { id: 'Breakfast', label: 'Breakfast' },
    { id: 'Lunch', label: 'Lunch' },
    { id: 'Dinner', label: 'Dinner' },
    { id: 'Snacks', label: 'Snacks' },
  ];
  protected readonly diet = signal<DietType | 'all'>('all');
  protected readonly meal = signal<MealType | 'all'>('all');

  constructor() {
    this.loadInitial();
  }

  protected setTab(t: Tab): void {
    if (this.tab() !== t) {
      this.tab.set(t);
      this.loadInitial();
    }
  }

  protected setDiet(d: DietType | 'all'): void {
    if (this.diet() !== d) {
      this.diet.set(d);
      this.loadInitial();
    }
  }

  protected setMeal(m: MealType | 'all'): void {
    if (this.meal() !== m) {
      this.meal.set(m);
      this.loadInitial();
    }
  }

  protected statusOf(l: ApiListingSummary): ListingStatus {
    return toListingStatus(l.status);
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

  private edit(l: ApiListingSummary): void {
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
            this.loadInitial();
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

  protected loadMore(): void {
    if (this.loading() || this.loadingMore() || this.done()) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch(this.page).subscribe({
      next: (rows) => {
        this.listings.update((cur) => [...cur, ...rows]);
        this.page++;
        this.done.set(rows.length < PAGE_SIZE);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  private loadInitial(): void {
    this.page = 1;
    this.done.set(false);
    this.loading.set(true);
    this.fetch(this.page).subscribe({
      next: (rows) => {
        this.listings.set(rows);
        this.page++;
        this.done.set(rows.length < PAGE_SIZE);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load listings');
      },
    });
  }

  /**
   * Every filter goes to the server. The status tab used to filter the *loaded*
   * page client-side, which quietly meant a tab only ever searched the rows already
   * scrolled into view — with paging that under-reports.
   */
  private fetch(page: number) {
    const tab = this.tab();
    return this.listingService.listMine(
      tab === 'all' ? undefined : TAB_TO_API_STATUS[tab],
      page,
      PAGE_SIZE,
      {
        dietType: this.diet() === 'all' ? undefined : (this.diet() as DietType),
        mealType: this.meal() === 'all' ? undefined : (this.meal() as MealType),
      },
    );
  }
}

/** App lowercase status → the backend enum name `GET /listings?status=` expects. */
const TAB_TO_API_STATUS: Record<ListingStatus, ApiListingStatus> = {
  pending: 'Pending',
  claimed: 'Claimed',
  pickedup: 'PickedUp',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};
