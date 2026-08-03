import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChartPoint, PlatformReport } from '@core/models/report.model';
import { AdminService } from '@core/services/admin.service';
import { ToastService } from '@core/services/toast.service';
import { BarChart, BarChartPoint } from '@shared/ui/bar-chart/bar-chart';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { downloadCsv } from '@shared/util/csv';

interface StatTile {
  icon: string;
  color: string;
  value: string;
  label: string;
  hint: string;
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

/**
 * Platform-wide impact, from `GET /reports/platform`.
 *
 * Every figure here is reported by the backend or derived from two of its fields —
 * the page deliberately shows nothing it cannot source. The old hardcoded "CO₂
 * avoided" tile is gone for exactly that reason: the API has no such measure, and a
 * made-up number on a page labelled "CSR-ready" is worse than a missing one.
 */
@Component({
  selector: 'app-admin-reports',
  imports: [DecimalPipe, BarChart, FbButton, EmptyState, ListingLayout, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'Platform Reports'"
      description="CSR-ready, platform-wide impact for funders and partners."
      [hasActions]="true"
      [hasAside]="true"
      [hasFilters]="false"
      gridClass=""
    >
      <ng-container pageActions>
          <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
            Refresh
          </app-button>
        <app-button
          icon="fa-solid fa-file-export"
          [disabled]="!report()"
          (clicked)="exportCsv()"
        >
          Export CSV
        </app-button>
      </ng-container>

      <!-- Summary: the headline impact figure. -->
      <app-summary-header
        summary
        icon="fa-solid fa-bowl-food"
        [loading]="loading()"
        loadingText="Loading the platform report…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ report()?.totalMealsDonated ?? 0 | number }}</span>
          meals rescued
        </span>
        <span subtitle class="text-muted">
          {{ report()?.totalDeliveries ?? 0 | number }} deliveries ·
          {{ report()?.totalUsers ?? 0 | number }} users
        </span>
      </app-summary-header>

      @if (loading()) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          @for (s of skeletons; track $index) {
            <div class="card-fb stat-card">
              <div class="skeleton !rounded-[14px] w-12 h-12 mb-3.5"></div>
              <div class="skeleton h-7 w-16 mb-1.5"></div>
              <div class="skeleton h-3 w-24"></div>
            </div>
          }
        </div>
        <div class="card-fb p-4">
          <div class="skeleton h-4 w-48 mb-4"></div>
          <div class="skeleton h-60 w-full"></div>
        </div>
      } @else if (report(); as r) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          @for (tile of tiles(); track tile.label) {
            <div class="card-fb stat-card">
              <div class="stat-icon" [style.background]="tile.color">
                <i [class]="tile.icon"></i>
              </div>
              <div class="stat-value">{{ tile.value }}</div>
              <div class="stat-label">{{ tile.label }}</div>
              <div class="stat-hint">{{ tile.hint }}</div>
            </div>
          }
        </div>

        <div class="card-fb p-4">
          <div class="flex items-center justify-between mb-3">
            <h6 class="section-title !mb-0">Meals rescued over time</h6>
            @if (months().length) {
              <span class="text-muted text-xs">
                {{ months().length }} {{ months().length === 1 ? 'month' : 'months' }}
                @if (bestMonth(); as b) {
                  · best {{ b.label }} ({{ b.value | number }})
                }
              </span>
            }
          </div>

          @if (chart().length) {
            <app-bar-chart [data]="chart()" />
          } @else {
            <app-empty-state
              icon="fa-solid fa-chart-column"
              size="sm"
              [title]="'Nothing to chart yet'"
              text="Confirmed donations are grouped by month and appear here."
            />
          }
        </div>
      } @else {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-chart-column"
            [title]="'No report available'"
            text="We couldn't load the platform report. Try refreshing in a moment."
            actionLabel="Retry"
            actionIcon="fa-solid fa-rotate"
            (action)="load()"
          />
        </div>
      }

      <!-- Sticky stats aside — same shape as the donor/volunteer listing pages. -->
      <ng-container aside>
        <!-- Efficiency: the single ratio funders ask about most. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Meals per delivery</div>
          <div class="flex items-center gap-4">
            <div class="me-metric">
              <span class="me-metric-num">{{ mealsPerDelivery() }}</span>
              <span class="me-metric-cap">avg</span>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Deliveries</div>
              <div class="font-bold text-xl text-primary-deep">
                {{ report()?.totalDeliveries ?? 0 | number }}
              </div>
              @if (bestMonth(); as b) {
                <div class="text-primary-deep text-xs font-semibold mt-1 truncate">
                  <i class="fa-solid fa-arrow-trend-up mr-1"></i>Best {{ b.label }}
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Totals recap: the figures a partner deck quotes. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Platform totals</div>
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ report()?.totalUsers ?? 0 | number }}</div>
              <div class="text-muted text-[11px]">Users</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ report()?.totalCertificates ?? 0 | number }}</div>
              <div class="text-muted text-[11px]">Certificates</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ report()?.totalMealsDonated ?? 0 | number }}</div>
              <div class="text-muted text-[11px]">Meals</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ report()?.totalDeliveries ?? 0 | number }}</div>
              <div class="text-muted text-[11px]">Deliveries</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    .stat-hint {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--fb-muted);
      opacity: 0.85;
    }

    /* Aside "meals per delivery" tile — the primary-gradient square used across
       the listing asides (cf. leaderboard's "your rank" tile). */
    .me-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 74px;
      height: 74px;
      flex-shrink: 0;
      border-radius: 20px;
      color: #fff;
      background: linear-gradient(135deg, var(--fb-primary), var(--fb-primary-deep));
      box-shadow: 0 10px 24px var(--fb-glow-primary-deep);
    }
    .me-metric-num {
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
    }
    .me-metric-cap {
      margin-top: 3px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.85;
    }
  `,
})
export class AdminReports {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 4 });

  protected readonly report = signal<PlatformReport | null>(null);
  protected readonly loading = signal(true);

  private readonly series = computed<ChartPoint[]>(
    () => this.report()?.mealsDonatedByMonth ?? [],
  );

  protected readonly chart = computed<BarChartPoint[]>(() =>
    this.series().map((p) => ({ label: monthLabel(p.period), value: p.value })),
  );

  protected readonly months = computed(() => this.series());

  protected readonly bestMonth = computed(() => {
    const series = this.series();
    if (!series.length) {
      return null;
    }
    const best = series.reduce((a, b) => (b.value > a.value ? b : a));
    return { label: fullMonthLabel(best.period), value: best.value };
  });

  /** Meals rescued per completed delivery — the efficiency figure for the aside. */
  protected readonly mealsPerDelivery = computed(() => {
    const r = this.report();
    if (!r || !r.totalDeliveries) {
      return '0';
    }
    return (r.totalMealsDonated / r.totalDeliveries).toFixed(1);
  });

  protected readonly tiles = computed<StatTile[]>(() => {
    const r = this.report();
    const meals = r?.totalMealsDonated ?? 0;
    const deliveries = r?.totalDeliveries ?? 0;
    return [
      {
        icon: 'fa-solid fa-bowl-food',
        color: 'var(--fb-primary)',
        value: meals.toLocaleString(),
        label: 'Meals rescued',
        hint: 'Across every confirmed donation',
      },
      {
        icon: 'fa-solid fa-truck',
        color: 'var(--fb-orange)',
        value: deliveries.toLocaleString(),
        label: 'Deliveries completed',
        hint: 'Pickup through to confirmed receipt',
      },
      {
        icon: 'fa-solid fa-users',
        color: '#2258c7',
        value: (r?.totalUsers ?? 0).toLocaleString(),
        label: 'Registered users',
        hint: 'Donors, volunteers, NGOs and admins',
      },
      {
        icon: 'fa-solid fa-award',
        color: 'var(--fb-success)',
        value: (r?.totalCertificates ?? 0).toLocaleString(),
        label: 'Certificates issued',
        hint: 'One per confirmed donation',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin.platformReport().subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.error(err.message || 'Could not load the platform report');
      },
    });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (!r) {
      return;
    }
    const rows: (string | number)[][] = [
      ['Metric', 'Value'],
      ['Meals rescued', r.totalMealsDonated],
      ['Deliveries completed', r.totalDeliveries],
      ['Registered users', r.totalUsers],
      ['Certificates issued', r.totalCertificates],
      [
        'Meals per delivery',
        r.totalDeliveries ? (r.totalMealsDonated / r.totalDeliveries).toFixed(1) : '',
      ],
      [],
      ['Month', 'Meals rescued'],
      ...r.mealsDonatedByMonth.map((p) => [p.period, p.value]),
    ];
    downloadCsv('FoodBridge-platform-report.csv', rows);
    this.toast.success('Platform report exported');
  }
}

/** "2026-07" → "Jul" (chart axis). */
function monthLabel(period: string): string {
  const month = Number.parseInt(period.split('-')[1] ?? '0', 10);
  return MONTHS[month] ?? period;
}

/** "2026-07" → "Jul 2026" (where the year matters). */
function fullMonthLabel(period: string): string {
  const [year, month] = period.split('-');
  const name = MONTHS[Number.parseInt(month ?? '0', 10)];
  return name ? `${name} ${year}` : period;
}
