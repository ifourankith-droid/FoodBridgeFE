import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChartPoint, PlatformReport } from '@core/models/report.model';
import { AdminService } from '@core/services/admin.service';
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
  imports: [DecimalPipe, BarChart, FbButton, EmptyState, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Platform Reports"
      description="CSR-ready, platform-wide impact for funders and partners."
      [hasActions]="true"
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
              title="Nothing to chart yet"
              text="Confirmed donations are grouped by month and appear here."
            />
          }
        </div>
      } @else {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-chart-column"
            title="No report available"
            text="We couldn't load the platform report. Try refreshing in a moment."
            actionLabel="Retry"
            actionIcon="fa-solid fa-rotate"
            (action)="load()"
          />
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    .stat-hint {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--fb-muted);
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
