import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiListing, ApiListingSummary } from '@core/models/listing-api.model';
import { ChartPoint } from '@core/models/report.model';
import { AuthService } from '@core/services/auth.service';
import { RecipientService } from '@core/services/recipient.service';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { VolunteerDeliveriesStore } from '@core/services/volunteer-deliveries.store';
import { BarChart, BarChartPoint } from '@shared/ui/bar-chart/bar-chart';
import { FbButton } from '@shared/ui/button/button';
import { ListingCard, ListingCardData } from '@shared/ui/listing-card/listing-card';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { downloadCsv } from '@shared/util/csv';

/** One completed record, normalised so volunteer and recipient rows render identically. */
interface HistoryRow {
  id: string;
  card: ListingCardData;
  /** Footer line — what happened, and when. */
  note: string;
  /** Extra detail line, e.g. who received it. Empty when unknown. */
  detail: string;
  /** Sort key + CSV column. */
  dateUtc: string;
}

interface StatTile {
  icon: string;
  color: string;
  value: string;
  label: string;
}

const MONTHS = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

@Component({
  selector: 'app-history',
  imports: [DatePipe, BarChart, FbButton, ListingCard, ListingGrid, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper [title]="title()" [description]="description()" [hasActions]="true">
      <ng-container pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-file-export"
          [disabled]="!rows().length"
          (clicked)="exportCsv()"
        >
          Export log
        </app-button>
        <app-button
          variant="outline"
          icon="fa-solid fa-rotate"
          [loading]="loading()"
          (clicked)="load()"
        >
          Refresh
        </app-button>
      </ng-container>

      <!-- Lifetime totals, straight from the role's report endpoint -->
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        @if (loading()) {
          @for (s of skeletons; track $index) {
            <div class="card-fb stat-card">
              <div class="skeleton !rounded-[14px] w-12 h-12 mb-3.5"></div>
              <div class="skeleton h-7 w-16 mb-1.5"></div>
              <div class="skeleton h-3 w-24"></div>
            </div>
          }
        } @else {
          @for (tile of tiles(); track tile.label) {
            <div class="card-fb stat-card">
              <div class="stat-icon" [style.background]="tile.color">
                <i [class]="tile.icon"></i>
              </div>
              <div class="stat-value">{{ tile.value }}</div>
              <div class="stat-label">{{ tile.label }}</div>
            </div>
          }
        }
      </div>

      @if (!loading() && chart().length) {
        <div class="card-fb p-4 mb-4">
          <h6 class="section-title !mb-3">{{ chartTitle() }}</h6>
          <app-bar-chart [data]="chart()" />
        </div>
      }

      <div class="flex items-center justify-between mb-3">
        <h6 class="section-title !mb-0">{{ listTitle() }}</h6>
        @if (rows().length) {
          <span class="text-muted text-xs">
            {{ rows().length }} {{ rows().length === 1 ? 'record' : 'records' }}
          </span>
        }
      </div>

      <app-listing-grid
        [loading]="loading()"
        [empty]="!rows().length"
        emptyIcon="fa-solid fa-clock-rotate-left"
        [emptyText]="emptyText()"
      >
        @for (row of rows(); track row.id) {
          <app-listing-card
            [listing]="row.card"
            icon="fa-solid fa-circle-check"
            iconBg="linear-gradient(135deg, var(--fb-success), var(--fb-success-deep))"
            [deadline]="false"
            [hasFooter]="true"
          >
            <div cardFooter class="text-xs">
              <div class="text-success-deep font-semibold">
                <i class="fa-regular fa-calendar-check mr-1"></i>{{ row.note }}
                {{ row.dateUtc | date: 'MMM d, y' }}
              </div>
              @if (row.detail) {
                <div class="text-muted mt-1 truncate">
                  <i class="fa-solid fa-hand-holding-heart mr-1"></i>{{ row.detail }}
                </div>
              }
            </div>
          </app-listing-card>
        }
      </app-listing-grid>

      @if (isVolunteer() && !loading()) {
        <p class="foot-note">
          <i class="fa-solid fa-circle-info mr-1.5"></i>
          The totals and chart above are your full server-side record. The cards list the
          deliveries tracked on this device — the API has no "my past deliveries" endpoint yet,
          so older ones aren't listed individually.
        </p>
      }
    </app-page-wrapper>
  `,
  styles: `
    .foot-note {
      margin: 16px 0 0;
      padding: 11px 13px;
      border-radius: 12px;
      font-size: 11.5px;
      line-height: 1.6;
      color: var(--fb-muted);
      background: var(--fb-bg);
      border: 1px solid var(--fb-line);
    }
  `,
})
export class History {
  private readonly auth = inject(AuthService);
  private readonly recipientService = inject(RecipientService);
  private readonly reports = inject(ReportService);
  private readonly deliveries = inject(VolunteerDeliveriesStore);
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 3 });

  protected readonly isVolunteer = computed(() => this.auth.currentUser()?.role === 'volunteer');

  protected readonly loading = signal(true);

  /** Recipient rows — GET /listings/history (their confirmed receipts). */
  private readonly received = signal<ApiListingSummary[]>([]);
  /** Lifetime totals + monthly series for whichever role is signed in. */
  private readonly totals = signal<{ a: number; b: number; c: number; } | null>(null);
  private readonly series = signal<ChartPoint[]>([]);

  // ---- Copy ----

  protected readonly title = computed(() =>
    this.isVolunteer() ? 'Delivery History' : 'Distribution History',
  );

  protected readonly description = computed(() =>
    this.isVolunteer()
      ? 'Every delivery you have completed, with the points they earned.'
      : 'Meals your organization has received and distributed.',
  );

  protected readonly listTitle = computed(() =>
    this.isVolunteer() ? 'Completed deliveries' : 'Received donations',
  );

  protected readonly chartTitle = computed(() =>
    this.isVolunteer() ? 'Deliveries by month' : 'Meals received by month',
  );

  protected readonly emptyText = computed(() =>
    this.isVolunteer()
      ? 'No completed deliveries yet — claim a nearby listing and confirm the drop-off.'
      : 'No confirmed receipts yet — accept an incoming delivery to start your history.',
  );

  // ---- Data ----

  protected readonly tiles = computed<StatTile[]>(() => {
    const t = this.totals();
    if (this.isVolunteer()) {
      return [
        {
          icon: 'fa-solid fa-truck-fast',
          color: 'var(--fb-primary)',
          value: (t?.a ?? 0).toLocaleString(),
          label: 'Deliveries completed',
        },
        {
          icon: 'fa-solid fa-star',
          color: 'var(--fb-accent)',
          value: (t?.b ?? 0).toLocaleString(),
          label: 'Points earned',
        },
        {
          icon: 'fa-solid fa-calendar-check',
          color: 'var(--fb-success)',
          value: `${t?.c ?? 0}`,
          label: t?.c === 1 ? 'Active month' : 'Active months',
        },
      ];
    }
    return [
      {
        icon: 'fa-solid fa-bowl-food',
        color: 'var(--fb-primary)',
        value: (t?.a ?? 0).toLocaleString(),
        label: 'Meals received',
      },
      {
        icon: 'fa-solid fa-truck',
        color: 'var(--fb-accent)',
        value: (t?.b ?? 0).toLocaleString(),
        label: 'Deliveries received',
      },
      {
        icon: 'fa-solid fa-calendar-check',
        color: 'var(--fb-success)',
        value: `${t?.c ?? 0}`,
        label: t?.c === 1 ? 'Active month' : 'Active months',
      },
    ];
  });

  protected readonly chart = computed<BarChartPoint[]>(() =>
    this.series().map((p) => ({ label: monthLabel(p.period), value: p.value })),
  );

  protected readonly rows = computed<HistoryRow[]>(() =>
    this.isVolunteer() ? this.volunteerRows() : this.recipientRows(),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    if (this.isVolunteer()) {
      this.loadVolunteer();
    } else {
      this.loadRecipient();
    }
  }

  /**
   * Volunteer: totals and the monthly series come from `GET /reports/volunteer`; the
   * individual cards come from the locally tracked claims, since no endpoint lists a
   * volunteer's past deliveries (see `VolunteerDeliveriesStore`).
   */
  private loadVolunteer(): void {
    this.reports.volunteer().subscribe({
      next: (r) => {
        this.totals.set({
          a: r.totalDeliveries,
          b: r.totalPoints,
          c: r.deliveriesByMonth.length,
        });
        this.series.set(r.deliveriesByMonth);
        this.loading.set(false);
      },
      error: (err: Error) => this.fail(err, 'Could not load your delivery history'),
    });
  }

  private loadRecipient(): void {
    this.recipientService.history().subscribe({
      next: (rows) => {
        this.received.set(rows);
        this.reports.recipient().subscribe({
          next: (r) => {
            this.totals.set({
              a: r.totalMealsReceived,
              b: r.totalDeliveriesReceived,
              c: r.mealsReceivedByMonth.length,
            });
            this.series.set(r.mealsReceivedByMonth);
            this.loading.set(false);
          },
          // The list already arrived — a failed summary shouldn't blank the page.
          error: () => this.loading.set(false),
        });
      },
      error: (err: Error) => this.fail(err, 'Could not load your history'),
    });
  }

  private fail(err: Error, fallback: string): void {
    this.loading.set(false);
    this.toast.show('fa-solid fa-triangle-exclamation', err.message || fallback);
  }

  private volunteerRows(): HistoryRow[] {
    return this.deliveries
      .completed()
      .map((l: ApiListing) => ({
        id: l.id,
        dateUtc: l.updatedAtUtc,
        note: l.status === 'Confirmed' ? 'Confirmed' : 'Delivered',
        detail: l.recipientName
          ? `Received by ${l.recipientName}`
          : (l.suggestedDropOffLocation?.name ?? ''),
        card: {
          title: l.title,
          foodType: l.foodType,
          dietType: l.dietType,
          mealType: l.mealType,
          quantityMeals: l.quantityMeals,
          freshnessTag: l.freshnessTag,
          pickupDeadlineUtc: l.pickupDeadlineUtc,
          status: l.status,
          createdAtUtc: l.createdAtUtc,
        },
      }))
      .sort((a, b) => b.dateUtc.localeCompare(a.dateUtc));
  }

  private recipientRows(): HistoryRow[] {
    // `ApiListingSummary` carries no confirm timestamp — only the listing's own
    // createdAtUtc — so the card is labelled "Listed", not "Received".
    return this.received().map((l) => ({
      id: l.id,
      dateUtc: l.createdAtUtc,
      note: 'Listed',
      detail: '',
      card: l,
    }));
  }

  protected exportCsv(): void {
    const rows = this.rows();
    const header = ['Title', 'Food type', 'Diet', 'Meal', 'Meals', 'Status', 'Date', 'Detail'];
    const body = rows.map((r) => [
      r.card.title,
      r.card.foodType,
      r.card.dietType ?? '',
      r.card.mealType ?? '',
      r.card.quantityMeals,
      r.card.status,
      r.dateUtc.slice(0, 10),
      r.detail,
    ]);
    const name = this.isVolunteer() ? 'delivery-log' : 'distribution-log';
    downloadCsv(`FoodBridge-${name}.csv`, [header, ...body]);
    this.toast.show('fa-solid fa-file-export', `Exported ${rows.length} records`);
  }
}

/** "2026-07" → "Jul". */
function monthLabel(period: string): string {
  const month = Number.parseInt(period.split('-')[1] ?? '0', 10);
  return MONTHS[month] ?? period;
}
