import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import { PickupAddressService } from '@core/services/pickup-address.service';
import { ThemeService } from '@core/services/theme.service';
import { RoleBadge } from '@shared/ui/role-badge/role-badge';
import { Avatar } from '@shared/ui/avatar/avatar';
import { AvailabilityService } from '@core/services/availability.service';
import { LayoutService } from '@core/services/layout.service';
import { AvailabilityToggle } from '@shared/ui/availability-toggle/availability-toggle';
import {
  FbPopoverHeader,
  FbPopoverMenu,
  FbPopoverPanel,
} from '@shared/ui/popover-menu/popover-menu';
import { NotificationBell } from '../notification-bell/notification-bell';

@Component({
  selector: 'app-topbar',
  imports: [
    RouterLink,
    RoleBadge,
    Avatar,
    NotificationBell,
    AvailabilityToggle,
    FbPopoverMenu,
    FbPopoverPanel,
    FbPopoverHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topbar.html',
  styles: `
    .topbar {
      background: var(--fb-surface);
      border-bottom: 1px solid var(--fb-line);
      padding: 14px 28px 14px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      position: sticky;
      top: 0;
      z-index: 1020;
      flex-wrap: nowrap;
    }
    @media (max-width: 640px) {
      .topbar {
        padding: 10px 12px;
        gap: 8px;
      }
    }
    .search-box {
      position: relative;
      max-width: 340px;
      width: 100%;
    }
    .avatar-btn {
      border: 0;
      background: transparent;
      padding: 0;
      cursor: pointer;
      border-radius: 50%;
      display: inline-flex;
    }
    .addr-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      color: var(--fb-ink);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      max-width: 260px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .addr-btn:hover {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
    /* On phones the pickup selector collapses to an icon-only button so the
       topbar fits on a single line. */
    @media (max-width: 640px) {
      .addr-btn {
        width: 42px;
        padding: 0;
        justify-content: center;
        max-width: none;
      }
      .addr-label,
      .addr-caret {
        display: none;
      }
    }
    /* Dark-mode toggle button — matches the .btn-icon affordance, hidden on
       phones (the same toggle lives in the profile menu there). */
    .theme-btn {
      display: inline-flex;
    }
    @media (max-width: 640px) {
      .theme-btn {
        display: none;
      }
    }
    /* Dark-mode switch shown inside the profile dropdown. */
    .fb-switch {
      width: 40px;
      height: 22px;
      border-radius: 999px;
      background: var(--fb-line);
      border: 0;
      position: relative;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.2s ease;
    }
    .fb-switch.on {
      background: var(--fb-primary);
    }
    .fb-switch .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s ease;
    }
    .fb-switch.on .knob {
      transform: translateX(18px);
    }
    .addr-item {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
    }
    .addr-item:hover {
      background: var(--fb-primary-soft);
    }
    .addr-item.sel {
      background: var(--fb-primary-soft);
    }
    .addr-item a,
    a.addr-item {
      text-decoration: none;
    }
    /* Reads as a link, not another row of the list: no fill on hover, and the
       underline is the usual cue that this one leaves the panel. */
    .addr-add {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: none;
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-primary-deep);
      text-decoration: none;
      cursor: pointer;
    }
    .addr-add:hover {
      color: var(--fb-primary);
      text-decoration: underline;
    }
    .addr-add:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
      border-radius: 8px;
    }
    .addr-add .ext {
      font-size: 10px;
      opacity: 0.75;
    }
    .search-box input {
      border-radius: 12px;
      border: 1px solid var(--fb-line);
      padding: 10px 14px 10px 38px;
      width: 100%;
      background: var(--fb-bg);
      color: var(--fb-ink);
    }
    .search-box i {
      position: absolute;
      left: 13px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fb-muted);
    }
    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      color: inherit;
    }
    .dropdown-item:hover {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
  `,
})
export class Topbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  protected readonly availability = inject(AvailabilityService);
  protected readonly pickup = inject(PickupAddressService);

  protected readonly notifOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly addrOpen = signal(false);
  protected readonly isDonor = computed(() => this.auth.currentUser()?.role === 'donor');

  protected readonly userName = computed(() => this.auth.currentUser()?.name ?? '');
  protected readonly avatarUrl = computed(() => this.auth.currentUser()?.avatarUrl ?? null);
  protected readonly role = computed(() => this.auth.currentUser()?.role ?? null);

  /**
   * The bell owns its own open/close; the topbar only enforces that opening it
   * dismisses the sibling menus (and that the shared backdrop stays in sync).
   */
  protected onNotifOpenChange(open: boolean): void {
    if (open) {
      this.menuOpen.set(false);
      this.addrOpen.set(false);
    }
    this.notifOpen.set(open);
  }

  protected toggleMenu(): void {
    this.notifOpen.set(false);
    this.addrOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected toggleAddr(): void {
    this.notifOpen.set(false);
    this.menuOpen.set(false);
    this.addrOpen.update((open) => !open);
  }

  protected selectAddr(id: string): void {
    this.pickup.select(id).subscribe();
    this.addrOpen.set(false);
  }

  /** Addresses are managed on the Profile page, opened in its own tab. */
  protected readonly profileLink = APP_ROUTES.appView('profile');

  protected closeMenus(): void {
    this.notifOpen.set(false);
    this.menuOpen.set(false);
    this.addrOpen.set(false);
  }

  protected go(view: string): void {
    this.closeMenus();
    this.router.navigate([APP_ROUTES.app, view]);
  }

  protected logout(): void {
    this.closeMenus();
    this.auth.logout();
    this.router.navigate([APP_ROUTES.login]);
  }
}
