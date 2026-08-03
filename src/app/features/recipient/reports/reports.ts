import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChartPoint, RecipientReport } from '@core/models/report.model';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { BarChart, BarChartPoint } from '@shared/ui/bar-chart/bar-chart';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { downloadCsv } from '@shared/util/csv';

interface StatTile {
  icon: string;
  color: string;
  value: string;
  label: string;
  hint: string;
}

/** One month of the series, decorated for the breakdown table. */
interface MonthRow {
  period: string;
  label: string;
  value: number;
  /** Share of the busiest month, for the row's bar. */
  pct: number;
  isBest: boolean;
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
  selector: 'app-reports',
  imports: [DecimalPipe, BarChart, EmptyState, FbButton, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="'Reports'"
      description="Statistics for your own records and funders — every confirmed receipt, month by month."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-file-export"
          [disabled]="!report()"
          (clicked)="exportCsv()"
        >
          Export report
        </app-button>
        <app-button
          variant="outline"
          icon="fa-solid fa-rotate"
          [loading]="loading()"
          (clicked)="load()"
        >
          Refresh
        </app-button>
      </div>

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
          <div class="skeleton h-4 w-40 mb-4"></div>
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

        <!-- Chart and the month breakdown side by side: the same series read two
             ways, shape first then exact figures. -->
        <div class="grid gap-4 xl:grid-cols-3 items-start">
          <div class="card-fb p-4 xl:col-span-2">
            <div class="flex items-center justify-between mb-3">
              <h6 class="section-title !mb-0">Meals received over time</h6>
              @if (months().length) {
                <span class="text-muted text-xs">
                  {{ months().length }} {{ months().length === 1 ? 'month' : 'months' }}
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
                text="Confirmed receipts are grouped by month and appear here."
              />
            }
          </div>

          <div class="card-fb p-4">
            <h6 class="section-title !mb-3">Month by month</h6>
            @if (months().length) {
              <div class="flex flex-col gap-1">
                @for (m of months(); track m.period) {
                  <div class="month-row" [class.is-best]="m.isBest">
                    <span class="month-label">{{ m.label }}</span>
                    <span class="month-value">{{ m.value | number }}</span>
                    <span class="month-rail" aria-hidden="true">
                      <span class="month-fill" [style.width.%]="m.pct"></span>
                    </span>
                  </div>
                }
              </div>
              <p class="month-foot">
                <i class="fa-solid fa-arrow-trend-up mr-1.5"></i>Best month:
                <strong>{{ bestMonth()?.label }}</strong> with
                {{ bestMonth()?.value | number }} meals.
              </p>
            } @else {
              <p class="text-muted text-xs m-0">
                Your monthly breakdown appears once a delivery is confirmed.
              </p>
            }
          </div>
        </div>
      } @else {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-chart-column"
            [title]="'No report available'"
            text="We couldn't load your statistics. Try refreshing in a moment."
            actionLabel="Retry"
            actionIcon="fa-solid fa-rotate"
            (action)="load()"
          />
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* A third line under the stat label, for the derivation behind the number. */
    .stat-hint {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--fb-muted);
      opacity: 0.85;
    }

    .month-row {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'label value'
        'rail  rail';
      align-items: center;
      gap: 6px 10px;
      padding: 7px 9px;
      border-radius: 10px;
      border: 1px solid transparent;
    }
    .month-row.is-best {
      background: rgb(var(--fb-primary-rgb) / 0.08);
      border-color: rgb(var(--fb-primary-rgb) / 0.25);
    }
    .month-label {
      grid-area: label;
      font-size: 12.5px;
      font-weight: 600;
    }
    .month-value {
      grid-area: value;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--fb-primary-deep);
      font-variant-numeric: tabular-nums;
    }
    .month-rail {
      grid-area: rail;
      height: 4px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--fb-line);
    }
    .month-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: var(--fb-primary);
    }
    .month-foot {
      margin: 12px 0 0;
      padding-top: 11px;
      border-top: 1px solid var(--fb-line);
      font-size: 11.5px;
      line-height: 1.6;
      color: var(--fb-muted);
    }
  `,
})
export class Reports {
  private readonly reportService = inject(ReportService);
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 4 });

  protected readonly report = signal<RecipientReport | null>(null);
  protected readonly loading = signal(true);

  private readonly series = computed<ChartPoint[]>(() => this.report()?.mealsReceivedByMonth ?? []);

  protected readonly chart = computed<BarChartPoint[]>(() =>
    this.series().map((p) => ({ label: monthLabel(p.period), value: p.value })),
  );

  /** Newest month first — the table reads as a recent-activity log, not an axis. */
  protected readonly months = computed<MonthRow[]>(() => {
    const series = this.series();
    const busiest = Math.max(1, ...series.map((p) => p.value));
    return series
      .map((p) => ({
        period: p.period,
        label: fullMonthLabel(p.period),
        value: p.value,
        pct: Math.round((p.value / busiest) * 100),
        isBest: p.value === busiest,
      }))
      .sort((a, b) => b.period.localeCompare(a.period));
  });

  protected readonly bestMonth = computed(() => this.months().find((m) => m.isBest) ?? null);

  protected readonly tiles = computed<StatTile[]>(() => {
    const r = this.report();
    const meals = r?.totalMealsReceived ?? 0;
    const deliveries = r?.totalDeliveriesReceived ?? 0;
    const months = this.series().length;
    return [
      {
        icon: 'fa-solid fa-bowl-food',
        color: 'var(--fb-primary)',
        value: meals.toLocaleString(),
        label: 'Meals received',
        hint: 'Across every confirmed receipt',
      },
      {
        icon: 'fa-solid fa-truck',
        color: 'var(--fb-accent)',
        value: deliveries.toLocaleString(),
        label: 'Deliveries received',
        hint: 'Completed drop-offs you confirmed',
      },
      {
        icon: 'fa-solid fa-scale-balanced',
        color: 'var(--fb-success)',
        value: deliveries ? (meals / deliveries).toFixed(1) : '—',
        label: 'Meals per delivery',
        hint: 'Average size of a drop-off',
      },
      {
        icon: 'fa-solid fa-calendar-check',
        color: '#2258c7',
        value: `${months}`,
        label: months === 1 ? 'Active month' : 'Active months',
        hint: 'Months with at least one receipt',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.reportService.recipient().subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show(
          'fa-solid fa-triangle-exclamation',
          err.message || 'Could not load your report',
        );
      },
    });
  }

  /** Totals plus the monthly series — the same figures the page shows. */
  protected exportCsv(): void {
    const r = this.report();
    if (!r) {
      return;
    }
    const rows: (string | number)[][] = [
      ['Metric', 'Value'],
      ['Meals received', r.totalMealsReceived],
      ['Deliveries received', r.totalDeliveriesReceived],
      [
        'Meals per delivery',
        r.totalDeliveriesReceived
          ? (r.totalMealsReceived / r.totalDeliveriesReceived).toFixed(1)
          : '',
      ],
      ['Active months', r.mealsReceivedByMonth.length],
      [],
      ['Month', 'Meals received'],
      ...r.mealsReceivedByMonth.map((p) => [p.period, p.value]),
    ];
    downloadCsv('FoodBridge-recipient-report.csv', rows);
    this.toast.show('fa-solid fa-file-export', 'Report exported');
  }
}

/** "2026-07" → "Jul" (chart axis). */
function monthLabel(period: string): string {
  const month = Number.parseInt(period.split('-')[1] ?? '0', 10);
  return MONTHS[month] ?? period;
}

/** "2026-07" → "Jul 2026" (breakdown table, where the year matters). */
function fullMonthLabel(period: string): string {
  const [year, month] = period.split('-');
  const name = MONTHS[Number.parseInt(month ?? '0', 10)];
  return name ? `${name} ${year}` : period;
}
