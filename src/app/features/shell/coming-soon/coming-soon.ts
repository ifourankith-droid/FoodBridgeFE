import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Generic placeholder for nav views not yet built. `view` is bound from the `:view` route param. */
@Component({
  selector: 'app-coming-soon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card-fb p-10 text-center max-w-[520px] mx-auto mt-10">
      <i class="fa-solid fa-screwdriver-wrench text-4xl text-primary mb-4"></i>
      <h3 class="text-xl font-bold tracking-tight mb-1">{{ title() }}</h3>
      <p class="text-muted text-sm">This section is scaffolded next.</p>
    </div>
  `,
})
export class ComingSoon {
  readonly view = input('');

  private readonly labels: Record<string, string> = {
    create: 'New Donation',
    listings: 'My Donations',
    certificates: 'Certificates',
    nearby: 'Nearby Listings',
    deliveries: 'My Deliveries',
    history: 'History',
    leaderboard: 'Leaderboard',
    incoming: 'Incoming Food',
    track: 'Track Delivery',
    reports: 'Reports',
    adminListings: 'All Listings',
    verifications: 'Verifications',
    disputes: 'Disputes',
    adminReports: 'Reports',
    profile: 'Profile',
    settings: 'Settings',
  };

  protected readonly title = computed(() => {
    const view = this.view();
    return this.labels[view] ?? view.charAt(0).toUpperCase() + view.slice(1);
  });
}
