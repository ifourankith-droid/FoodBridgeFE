import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import {
  filterNotifications,
  Notification,
  NOTIFICATION_PREVIEW_COUNT,
  NotificationFilter,
} from '@core/models/notification.model';
import { NotificationRouter } from '@core/services/notification-router.service';
import { NotificationService } from '@core/services/notification.service';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { NotificationFilters } from '@shared/ui/notification-filters/notification-filters';
import { NotificationItem } from '@shared/ui/notification-item/notification-item';
import {
  FbPopoverHeader,
  FbPopoverMenu,
  FbPopoverPanel,
} from '@shared/ui/popover-menu/popover-menu';

/**
 * The topbar bell: unread badge, and a dropdown previewing the latest few
 * notifications with type filters and a link through to the full inbox.
 *
 * `open` is two-way bound so the topbar can keep its menus mutually exclusive
 * and own the shared click-away backdrop.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [
    RouterLink,
    EmptyState,
    NotificationFilters,
    NotificationItem,
    FbPopoverMenu,
    FbPopoverPanel,
    FbPopoverHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-popover-menu
      [open]="open()"
      (openChange)="open.set($event)"
      align="end"
      panelClass="w-[380px]"
      ariaLabel="Notifications"
      [panelScrolls]="true"
    >
      <button
        fbTrigger
        type="button"
        class="btn-icon"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="bellLabel()"
        (click)="toggle()"
      >
        <i class="fa-solid fa-bell"></i>
        @if (notifications.unreadCount()) {
          <span class="notif-badge">{{ badgeText() }}</span>
        }
      </button>

      <!-- On phones the panel's own header would sit under the modal's header
           bar, so the title and count move up into the bar (left) and the head
           row below keeps only Mark all read. -->
      <ng-template fbPanelHeader>
        <div class="min-w-0">
          <h2 class="panel-title">Notifications</h2>
          <p class="panel-sub">{{ unreadSummary() }}</p>
        </div>
      </ng-template>

      <ng-template fbPanel>
      <div class="notif">
        <header class="panel-head" [class.is-quiet]="!notifications.unreadCount()">
          <div class="panel-head-copy min-w-0">
            <h2 class="panel-title">Notifications</h2>
            <p class="panel-sub">{{ unreadSummary() }}</p>
          </div>
          @if (notifications.unreadCount()) {
            <button
              type="button"
              class="head-action"
              [disabled]="notifications.marking()"
              (click)="notifications.markAllRead()"
            >
              <i
                [class]="
                  notifications.marking()
                    ? 'fa-solid fa-spinner fa-spin'
                    : 'fa-solid fa-check-double'
                "
                aria-hidden="true"
              ></i>
              Mark all read
            </button>
          }
        </header>

        <div class="panel-filters">
          <app-notification-filters
            [(active)]="filter"
            [counts]="notifications.filterCounts()"
            [showCounts]="false"
            [compact]="true"
          />
        </div>

        <div class="panel-list">
          @if (notifications.loading() && !notifications.notifications().length) {
            <p class="panel-loading">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…
            </p>
          } @else {
            @for (n of preview(); track n.id) {
              <app-notification-item
                [notification]="n"
                [compact]="true"
                [actionLabel]="notifRouter.actionLabel(n)"
                (activate)="openRow(n)"
              />
            } @empty {
              <app-empty-state
                icon="fa-regular fa-bell"
                [text]="emptyText()"
                size="sm"
                tone="positive"
              />
            }
          }
        </div>

        <footer class="panel-foot">
          <a class="view-all" [routerLink]="inboxLink" (click)="close()">
            View all notifications
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
        </footer>
      </div>
      </ng-template>
    </app-popover-menu>
  `,
  styles: `
    .notif-badge {
      position: absolute;
      top: 0px;
      right: 3px;
      background: var(--fb-accent);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ---- Panel body (frame + positioning come from <app-popover-menu>) ---- */
    /* min-height:0 is what lets .panel-list actually shrink and scroll inside the
       popover's max-height instead of pushing the footer past its bottom edge. */
    .notif {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* Header and filters stay put; only the list moves. */
    .panel-head,
    .panel-filters,
    .panel-foot {
      flex: none;
    }

    .panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--fb-line);
    }
    .panel-title {
      font-size: 14.5px;
      font-weight: 700;
      margin: 0;
    }
    .panel-sub {
      margin: 2px 0 0;
      font-size: 11.5px;
      color: var(--fb-muted);
    }
    .head-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 11.5px;
      font-weight: 700;
      color: var(--fb-primary-deep);
      cursor: pointer;
    }
    .head-action:hover:not(:disabled) {
      text-decoration: underline;
    }
    .head-action:disabled {
      opacity: 0.6;
      cursor: default;
    }

    /* Phones: the modal's header bar carries the title and count, so this row is
       left with Mark all read alone — and disappears entirely when there's
       nothing to mark. Matches app-popover-menu's own modal breakpoint. */
    @media (max-width: 640px) {
      .panel-head-copy {
        display: none;
      }
      .panel-head {
        justify-content: flex-end;
        padding: 10px 16px;
      }
      .panel-head.is-quiet {
        display: none;
      }
    }

    .panel-filters {
      padding: 10px 12px;
      border-bottom: 1px solid var(--fb-line);
    }

    /* The only scrolling region in the panel. It takes whatever height is left
       after the header, filters and footer, rather than carrying a max-height of
       its own — two competing height caps is what produced the second scrollbar. */
    .panel-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 7px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .panel-loading {
      margin: 0;
      padding: 22px 0;
      text-align: center;
      font-size: 12.5px;
      color: var(--fb-muted);
    }

    .panel-foot {
      padding: 9px;
      border-top: 1px solid var(--fb-line);
      background: rgb(var(--fb-ink-rgb) / 0.02);
    }
    .view-all {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      color: var(--fb-primary-deep);
      transition: background 0.15s ease;
    }
    .view-all:hover {
      background: var(--fb-primary-soft);
    }
    .view-all i {
      font-size: 11px;
      transition: transform 0.15s ease;
    }
    .view-all:hover i {
      transform: translateX(2px);
    }

    @media (prefers-reduced-motion: reduce) {
      .view-all,
      .view-all i {
        transition: none;
      }
      .view-all:hover i {
        transform: none;
      }
    }
  `,
})
export class NotificationBell {
  protected readonly notifications = inject(NotificationService);
  protected readonly notifRouter = inject(NotificationRouter);

  /** Two-way bound: the topbar closes this when another menu opens. */
  readonly open = model(false);

  protected readonly inboxLink = APP_ROUTES.appView('notifications');
  protected readonly filter = signal<NotificationFilter>('all');

  /** Latest few matching the active filter — the rest live on the inbox page. */
  protected readonly preview = computed(() =>
    filterNotifications(this.notifications.notifications(), this.filter()).slice(
      0,
      NOTIFICATION_PREVIEW_COUNT,
    ),
  );

  protected readonly badgeText = computed(() => {
    const count = this.notifications.unreadCount();
    return count > 9 ? '9+' : `${count}`;
  });

  protected readonly bellLabel = computed(() => {
    const count = this.notifications.unreadCount();
    return count ? `Notifications, ${count} unread` : 'Notifications';
  });

  /** Header subtitle — shared by the panel's own head and the modal's header bar. */
  protected readonly unreadSummary = computed(() => {
    const count = this.notifications.unreadCount();
    return count ? `${count} unread` : "You're all caught up";
  });

  protected readonly emptyText = computed(() =>
    this.filter() === 'all' ? 'No notifications yet' : 'Nothing matches this filter',
  );

  /** Open the row's related page, closing the dropdown so it doesn't hang over it. */
  protected openRow(n: Notification): void {
    this.notifRouter.open(n);
    this.close();
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected close(): void {
    this.open.set(false);
  }
}
