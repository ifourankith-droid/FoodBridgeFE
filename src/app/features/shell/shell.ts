import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocationBroadcastService } from '@core/realtime/location-broadcast.service';
import { LayoutService } from '@core/services/layout.service';
import { Sidebar } from './sidebar/sidebar';
import { Topbar } from './topbar/topbar';
import { VerificationBanner } from './verification-banner/verification-banner';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Topbar, VerificationBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styles: `
    .fb-shell {
      display: flex;
      min-height: 100dvh;
    }
    .fb-main {
      margin-left: 260px;
      flex: 1;
      min-width: 0;
      transition: margin-left 0.2s ease;
    }
    @media (min-width: 1024px) {
      .fb-main.collapsed {
        margin-left: 76px;
      }
    }
    .fb-page-body {
      padding: 18px 16px 48px;
    }
    @media (min-width: 768px) {
      .fb-page-body {
        padding: 26px 28px 60px;
      }
    }
    .fb-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 1029;
    }
    @media (max-width: 1023px) {
      .fb-main {
        margin-left: 0;
      }
    }
  `,
})
export class Shell {
  protected readonly layout = inject(LayoutService);

  /**
   * Instantiated for its side effect: while a volunteer has a delivery in transit
   * it streams their position to `TrackingHub`. It lives here rather than on the
   * Deliveries page so broadcasting survives navigation — a volunteer checking the
   * leaderboard mid-delivery shouldn't drop off the recipient's map. It self-gates
   * on `inTransit()`, so for every other role it does nothing.
   */
  private readonly locationBroadcast = inject(LocationBroadcastService);
}
