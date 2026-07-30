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

/**
 * The topbar bell: unread badge, and a dropdown previewing the latest few
 * notifications with type filters and a link through to the full inbox.
 *
 * `open` is two-way bound so the topbar can keep its menus mutually exclusive
 * and own the shared click-away backdrop.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, EmptyState, NotificationFilters, NotificationItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative' },
  template: `
    <button
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

    @if (open()) {
      <div class="panel" role="dialog" aria-label="Notifications">
        <header class="panel-head">
          <div class="min-w-0">
            <h2 class="panel-title">Notifications</h2>
            <p class="panel-sub">
              {{
                notifications.unreadCount()
                  ? notifications.unreadCount() + ' unread'
                  : "You're all caught up"
              }}
            </p>
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
    }
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

    /* ---- Dropdown panel ---- */
    .panel {
      position: absolute;
      right: 0;
      top: 52px;
      z-index: 1040;
      width: 380px;
      display: flex;
      flex-direction: column;
      background: var(--fb-surface);
      border: 1px solid var(--fb-line);
      border-radius: 18px;
      box-shadow: var(--fb-shadow-lg);
      overflow: hidden;
    }
    /* Never wider than the viewport on a phone, where the topbar bell sits only
       a few pixels from the right edge. */
    @media (max-width: 420px) {
      .panel {
        width: calc(100vw - 24px);
        right: -8px;
      }
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

    .panel-filters {
      padding: 10px 12px;
      border-bottom: 1px solid var(--fb-line);
    }

    .panel-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 7px;
      /* The preview is capped at four rows, so this only ever engages when a
         body wraps unusually long — it keeps the panel inside the viewport. */
      max-height: min(60vh, 420px);
      overflow-y: auto;
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
