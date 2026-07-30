import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { DashboardService } from '@core/services/dashboard.service';
import { AdminDashboard } from '@core/models/admin.model';
import { DonorDashboard, RecipientDashboard, VolunteerDashboard } from '@core/models/dashboard.model';
import { ApiListingStatus, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { ChartPoint } from '@core/models/report.model';
import { Role } from '@core/models/user.model';
import { Avatar } from '@shared/ui/avatar/avatar';
import { BarChart, BarChartPoint } from '@shared/ui/bar-chart/bar-chart';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { ListingCard } from '@shared/ui/listing-card/listing-card';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

interface Stat {
  icon: string;
  color: string;
  value: string;
  label: string;
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, StatusBadge, EmptyState, ListingCard, Avatar, BarChart, DatePipe, DecimalPipe, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styles: `
    /* Shared row style for Badges & Top Donors so both sections match */
    .info-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--fb-line);
      background: var(--fb-bg);
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .info-row.active {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
    .row-medal {
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 15px;
      font-weight: 700;
      color: var(--fb-muted);
      background: var(--fb-line);
    }
    .row-medal.active {
      color: #fff;
      background: linear-gradient(45deg, var(--fb-primary), var(--fb-primary-deep));
    }
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly dashboards = inject(DashboardService);
  private readonly admin = inject(AdminService);

  protected readonly user = this.auth.currentUser;
  protected readonly role = computed<Role>(() => this.user()?.role ?? 'donor');

  protected readonly loading = signal(true);
  protected readonly donor = signal<DonorDashboard | null>(null);
  protected readonly volunteer = signal<VolunteerDashboard | null>(null);
  protected readonly recipient = signal<RecipientDashboard | null>(null);
  protected readonly adminData = signal<AdminDashboard | null>(null);

  protected readonly skeletons = Array.from({ length: 4 });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    switch (this.role()) {
      case 'donor':
        this.dashboards.donor().subscribe({
          next: (d) => this.done(() => this.donor.set(d)),
          error: () => this.loading.set(false),
        });
        break;
      case 'volunteer':
        this.dashboards.volunteer().subscribe({
          next: (d) => this.done(() => this.volunteer.set(d)),
          error: () => this.loading.set(false),
        });
        break;
      case 'recipient':
        this.dashboards.recipient().subscribe({
          next: (d) => this.done(() => this.recipient.set(d)),
          error: () => this.loading.set(false),
        });
        break;
      default:
        this.admin.dashboard().subscribe({
          next: (d) => this.done(() => this.adminData.set(d)),
          error: () => this.loading.set(false),
        });
    }
  }

  private done(apply: () => void): void {
    apply();
    this.loading.set(false);
  }

  protected readonly greeting = computed(() => {
    const user = this.user();
    if (!user) {
      return 'Welcome';
    }
    const first = user.name.split(' ')[0];
    switch (user.role) {
      case 'donor':
        return `Good day, ${first} 👋`;
      case 'volunteer':
        return `Hey, ${first} 🚴`;
      case 'recipient':
        return `Welcome, ${user.name} ❤️`;
      default:
        return 'Admin Dashboard';
    }
  });

  protected readonly subtitle = computed(() => {
    switch (this.role()) {
      case 'donor':
        return "Here's your impact so far.";
      case 'volunteer':
        return 'Thanks for keeping food moving.';
      case 'recipient':
        return "Here's what's coming your way today.";
      default:
        return 'Platform-wide oversight at a glance.';
    }
  });

  /** Stat tiles for the current role, from the loaded dashboard payload. */
  protected readonly stats = computed<Stat[]>(() => {
    switch (this.role()) {
      case 'donor': {
        const d = this.donor();
        return d
          ? [
            { icon: 'fa-solid fa-bowl-food', color: 'var(--fb-primary)', value: `${d.totalMealsDonated}`, label: 'Meals Donated' },
            { icon: 'fa-solid fa-calendar-day', color: 'var(--fb-orange)', value: `${d.mealsDonatedToday}`, label: 'Donated Today' },
            { icon: 'fa-solid fa-boxes-stacked', color: '#2258c7', value: `${d.totalDonations}`, label: 'Total Donations' },
            { icon: 'fa-solid fa-award', color: '#9a6b00', value: `${d.totalCertificates}`, label: 'Certificates' },
          ]
          : [];
      }
      case 'volunteer': {
        const d = this.volunteer();
        return d
          ? [
            { icon: 'fa-solid fa-truck', color: 'var(--fb-primary)', value: `${d.totalDeliveries}`, label: 'Total Deliveries' },
            { icon: 'fa-solid fa-star', color: 'var(--fb-orange)', value: `${d.totalPoints}`, label: 'Points' },
            { icon: 'fa-solid fa-ranking-star', color: '#2258c7', value: d.leaderboardRank != null ? `#${d.leaderboardRank}` : '—', label: 'Leaderboard Rank' },
            { icon: 'fa-solid fa-bowl-food', color: '#9a6b00', value: `${d.totalMealsHelped}`, label: 'Meals Helped' },
          ]
          : [];
      }
      case 'recipient': {
        const d = this.recipient();
        return d
          ? [
            { icon: 'fa-solid fa-bowl-food', color: 'var(--fb-primary)', value: `${d.totalMealsReceived}`, label: 'Meals Received' },
            { icon: 'fa-solid fa-calendar-day', color: 'var(--fb-orange)', value: `${d.mealsReceivedToday}`, label: 'Received Today' },
            { icon: 'fa-solid fa-truck', color: '#2258c7', value: `${d.upcomingDeliveries}`, label: 'Upcoming' },
            { icon: 'fa-solid fa-warehouse', color: '#9a6b00', value: d.storageUsedPercentToday != null ? `${Math.round(d.storageUsedPercentToday)}%` : '—', label: 'Storage Used' },
          ]
          : [];
      }
      default: {
        const d = this.adminData();
        return d
          ? [
            { icon: 'fa-solid fa-list-check', color: 'var(--fb-primary)', value: `${d.totalListings}`, label: 'Total Listings' },
            { icon: 'fa-solid fa-user-shield', color: 'var(--fb-orange)', value: `${d.pendingRecipients}`, label: 'Pending Verifications' },
            { icon: 'fa-solid fa-triangle-exclamation', color: '#c7442a', value: `${d.openDisputes}`, label: 'Open Disputes' },
            { icon: 'fa-solid fa-bowl-food', color: 'var(--fb-success)', value: `${d.totalMealsDonated}`, label: 'Meals Rescued' },
          ]
          : [];
      }
    }
  });

  /** The role's monthly series as chart points ({ label, value }). */
  protected readonly monthly = computed<BarChartPoint[]>(() => {
    let series: ChartPoint[] | undefined;
    switch (this.role()) {
      case 'donor':
        series = this.donor()?.mealsDonatedByMonth;
        break;
      case 'volunteer':
        series = this.volunteer()?.deliveriesByMonth;
        break;
      case 'recipient':
        series = this.recipient()?.mealsReceivedByMonth;
        break;
    }
    return (series ?? []).map((p) => ({ label: this.monthLabel(p.period), value: p.value }));
  });

  protected readonly chartTitle = computed(() => {
    switch (this.role()) {
      case 'donor':
        return 'Meals donated by month';
      case 'volunteer':
        return 'Deliveries by month';
      case 'recipient':
        return 'Meals received by month';
      default:
        return '';
    }
  });

  private monthLabel(period: string): string {
    const month = Number.parseInt(period.split('-')[1] ?? '0', 10);
    return MONTHS[month] ?? period;
  }

  protected badgeStatus(status: string): ListingStatus {
    return toListingStatus(status as ApiListingStatus);
  }

  /** A donor's share of the recipient's total received meals, as a percentage. */
  protected sharePct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  /**
   * Volunteer's nearby open listings mapped onto the common ListingCard shape.
   * Nearby listings are Pending by definition and carry no createdAt, so the card's
   * deadline meter is disabled and pickup time / distance / address go in its footer.
   */
  protected readonly openCards = computed(() =>
    (this.volunteer()?.openListingsNearby ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      foodType: l.foodType,
      dietType: l.dietType,
      mealType: l.mealType,
      quantityMeals: l.quantityMeals,
      freshnessTag: l.freshnessTag,
      pickupDeadlineUtc: l.pickupDeadlineUtc,
      status: 'Pending' as ApiListingStatus,
      createdAtUtc: l.pickupDeadlineUtc,
      distanceKm: l.distanceKm,
      pickupAddress: l.pickupAddress,
    })),
  );
}
