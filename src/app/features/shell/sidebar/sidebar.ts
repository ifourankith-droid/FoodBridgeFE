import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { viewsForRole } from '@core/config/routes.config';
import { AuthService } from '@core/services/auth.service';
import { LayoutService } from '@core/services/layout.service';
import { FbLogo } from '@shared/ui/logo/logo';
import { RoleBadge } from '@shared/ui/role-badge/role-badge';
import { Avatar } from '@shared/ui/avatar/avatar';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, FbLogo, RoleBadge, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styles: `
    /* The shell is dark in both light and dark mode — it's navigation chrome,
       not content. Every colour in here comes from the --fb-sidebar-* ramp so it
       re-tints with the brand palette. */
    .sidebar {
      width: 260px;
      background: var(--fb-sidebar);
      color: var(--fb-sidebar-ink);
      border-right: 1px solid var(--fb-sidebar-line);
      padding: 22px 16px 6px;
      position: fixed;
      top: 0;
      left: 0;
      height: 100dvh;
      z-index: 1030;
      display: flex;
      flex-direction: column;
      transition:
        transform 0.25s ease,
        width 0.2s ease,
        padding 0.2s ease;
    }
    .nav-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      /* Bleed back over the sidebar's 16px gutter so a row can run edge to
         edge. Rows re-add the inset as their own padding, which keeps the
         label aligned with the brand block while the background stays full
         width. Kept in sync with .sidebar.collapsed's narrower padding below. */
      margin: 0 -16px;
      padding: 0;
    }
    .nav-fb a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 26px;
      border-radius: 0;
      color: var(--fb-sidebar-muted);
      text-decoration: none;
      font-weight: 500;
      font-size: 14.5px;
      /* Stated explicitly, and inherited by the icon below, so both children of
         this flex row produce the SAME line box. Font Awesome ships
         line-height 1 on its icons while the label inherits Tailwind's 1.5 —
         which meant the label was the tallest child and set the row height. On
         collapse the label is hidden, the row fell back to the icon's shorter
         box, and every row lost ~7px, jumping the whole list upward. */
      line-height: 1.5;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      overflow: hidden;
    }
    .nav-fb a i {
      width: 20px;
      text-align: center;
      flex-shrink: 0;
      line-height: inherit;
    }
    .nav-fb a:hover {
      background: var(--fb-sidebar-raised);
      color: var(--fb-sidebar-ink);
    }
    .nav-fb a.active {
      /* No solid fill. Against a 13%-lightness shell a brand block is caught
         between two failures: dark enough to hold white text means it barely
         separates from the shell, light enough to separate means the text
         stops being legible. So the state is carried by an edge marker and a
         wash instead, which lets the label sit at the sidebar's own audited
         ink colour rather than pure white on an unpredictable fill.

         Uses --fb-primary-bright rather than --fb-primary because the bright
         ramp is the one tuned to read against dark surfaces.

         The wash is a gradient that decays to fully transparent at the right
         edge: the row runs flush into the content border with no corner, so a
         flat fill would end in a hard vertical seam there. Fading it out means
         the row has no right edge to draw badly. */
      background: linear-gradient(
        90deg,
        rgb(var(--fb-primary-bright-rgb) / 0.26) 0%,
        rgb(var(--fb-primary-bright-rgb) / 0.1) 55%,
        rgb(var(--fb-primary-bright-rgb) / 0) 100%
      );
      color: var(--fb-sidebar-ink);
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--fb-primary-bright);
    }
    .nav-fb a.active i {
      color: var(--fb-primary-bright);
    }
    .nav-fb a.active:hover {
      background: linear-gradient(
        90deg,
        rgb(var(--fb-primary-bright-rgb) / 0.34) 0%,
        rgb(var(--fb-primary-bright-rgb) / 0.14) 55%,
        rgb(var(--fb-primary-bright-rgb) / 0) 100%
      );
      color: var(--fb-sidebar-ink);
    }

    /* User footer + popover */
    .side-user {
      position: relative;
      padding-top: 6px;
      border-top: 1px solid var(--fb-sidebar-line);
      flex-shrink: 0;
    }
    .side-user-btn {
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      padding: 9px 10px;
      border-radius: 14px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      text-align: left;
      color: inherit;
      transition: all 0.15s ease;
    }
    .side-user-btn:hover,
    .side-user-btn.is-open {
      background: var(--fb-sidebar-raised);
      border-color: var(--fb-sidebar-line);
    }
    .side-user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
      background: linear-gradient(135deg, var(--fb-accent), var(--fb-accent-deep));
      object-fit: cover;
    }
    .side-user-info {
      min-width: 0;
      flex: 1;
      /* Same reason as the nav rows: the role badge is inline-flex, so it sits
         in an anonymous line box whose strut would inherit line-height 1.5 and
         push this block past the 40px avatar. At 1.2 the badge itself sets that
         box, the avatar stays the tallest child, and hiding this text on
         collapse leaves the footer's height unchanged. */
      line-height: 1.2;
    }
    .side-user-name {
      font-weight: 600;
      font-size: 13.5px;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .side-user-role {
      color: var(--fb-sidebar-muted);
      font-size: 11.5px;
    }
    .side-user-chev {
      color: var(--fb-sidebar-muted);
      font-size: 12px;
      flex-shrink: 0;
      transition: transform 0.15s ease;
    }
    .side-user-btn.is-open .side-user-chev {
      transform: rotate(180deg);
    }
    .user-popover {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(100% + 6px);
      z-index: 1040;
      background: var(--fb-surface);
      border: 1px solid var(--fb-line);
      border-radius: 16px;
      box-shadow: var(--fb-shadow-lg);
      padding: 8px;
      /* Reset the shell's light-on-dark text — this panel sits on a card
         surface, not on the dark sidebar. */
      color: var(--fb-ink);
    }
    .popover-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      color: inherit;
      white-space: nowrap;
    }
    .popover-item i {
      width: 18px;
      text-align: center;
    }
    .popover-item:hover {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .popover-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1039;
    }

    @media (max-width: 1023px) {
      .sidebar {
        transform: translateX(-100%);
      }
      .sidebar.show {
        transform: translateX(0);
      }
    }

    /* Collapsed icon-only rail — desktop only */
    @media (min-width: 1024px) {
      .sidebar.collapsed {
        width: 76px;
        padding: 22px 12px;
      }
      .sidebar.collapsed .brand-text,
      .sidebar.collapsed .nav-label,
      .sidebar.collapsed .side-user-info,
      .sidebar.collapsed .side-user-chev {
        display: none;
      }
      .sidebar.collapsed .brand,
      .sidebar.collapsed .nav-fb a,
      .sidebar.collapsed .side-user-btn {
        justify-content: center;
        gap: 0;
      }
      .sidebar.collapsed .nav-fb a {
        padding: 11px 0;
      }
      /* Match the rail's narrower gutter so rows still reach both edges. */
      .sidebar.collapsed .nav-scroll {
        margin: 0 -12px;
      }
      .sidebar.collapsed .user-popover {
        left: 0;
        right: auto;
        min-width: 190px;
      }
    }
  `,
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly layout = inject(LayoutService);
  protected readonly routes = APP_ROUTES;

  protected readonly userMenuOpen = signal(false);

  protected readonly navItems = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role ? viewsForRole(role) : [];
  });

  protected readonly userName = computed(() => this.auth.currentUser()?.name ?? '');

  protected readonly role = computed(() => this.auth.currentUser()?.role ?? null);

  protected readonly avatarUrl = computed(() => this.auth.currentUser()?.avatarUrl ?? null);

  protected onNavigate(): void {
    this.userMenuOpen.set(false);
    this.layout.closeSidebar();
  }

  protected toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  protected goto(view: string): void {
    this.onNavigate();
    this.router.navigate([this.routes.app, view]);
  }

  protected logout(): void {
    this.userMenuOpen.set(false);
    this.layout.closeSidebar();
    this.auth.logout();
    this.router.navigate([this.routes.login]);
  }
}
