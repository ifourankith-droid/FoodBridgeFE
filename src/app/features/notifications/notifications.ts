import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryColor,
  filterNotifications,
  Notification,
  NotificationCategory,
  NotificationFilter,
  NOTIFICATION_FILTERS,
} from '@core/models/notification.model';
import { ClockService } from '@core/services/clock.service';
import { NotificationRouter } from '@core/services/notification-router.service';
import { NotificationService } from '@core/services/notification.service';
import { InfiniteScroll } from '@shared/directives/infinite-scroll.directive';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { NotificationFilters } from '@shared/ui/notification-filters/notification-filters';
import { NotificationItem } from '@shared/ui/notification-item/notification-item';
import { dayBucket, DayBucket } from '@shared/util/time-ago';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

interface NotificationGroup {
  bucket: DayBucket;
  label: string;
  items: Notification[];
}

const BUCKET_LABELS: Record<DayBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

/** Drops the two read-state chips, leaving only the real category buckets. */
function isCategory(id: NotificationFilter): id is NotificationCategory {
  return id !== 'all' && id !== 'unread';
}

/**
 * The notifications inbox — the "View all" destination from the topbar bell.
 * Same rows and filters as the dropdown, but full-width, grouped by day and
 * paged through the whole history.
 */
@Component({
  selector: 'app-notifications',
  imports: [EmptyState, FbButton, InfiniteScroll, NotificationFilters, NotificationItem, RouterLink, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper [title]="'Notifications'" [description]="inboxSummary()" [hasActions]="true">
      <ng-container pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-rotate"
          [loading]="notifications.loading()"
          (clicked)="notifications.load()"
        >
          Refresh
        </app-button>
        @if (notifications.unreadCount()) {
          <app-button
            icon="fa-solid fa-check-double"
            [loading]="notifications.marking()"
            (clicked)="notifications.markAllRead()"
          >
            {{ notifications.marking() ? 'Marking…' : 'Mark all read' }}
          </app-button>
        }
      </ng-container>

      <app-notification-filters
        class="mb-4"
        [(active)]="filter"
        [counts]="notifications.filterCounts()"
      />

      <!-- Two columns from xl up: the inbox rows are short, so a single
           full-width card left most of a desktop viewport empty. Matches the
           create-listing layout (form + aside). -->
      <div class="grid gap-4 xl:grid-cols-3 items-start">
        <div class="card-fb overflow-hidden xl:col-span-2">
          @if (notifications.loading() && !total()) {
            @for (s of skeletons; track $index) {
              <div class="sk-row">
                <div class="sk w-9 h-9 !rounded-xl"></div>
                <div class="flex-1 min-w-0">
                  <div class="sk h-2.5 w-24 mb-2"></div>
                  <div class="sk h-3.5 w-2/3 mb-2"></div>
                  <div class="sk h-2.5 w-1/3"></div>
                </div>
              </div>
            }
          } @else if (!groups().length) {
            <app-empty-state
              icon="fa-regular fa-bell"
              [title]="emptyTitle()"
              [text]="emptyText()"
              [tone]="filter() === 'all' ? 'positive' : 'neutral'"
              [actionLabel]="filter() === 'all' ? '' : 'Clear filter'"
              actionIcon="fa-solid fa-filter-circle-xmark"
              actionVariant="outline"
              (action)="filter.set('all')"
            />
          } @else {
            @for (group of groups(); track group.bucket) {
              <section>
                <h6 class="group-head">
                  {{ group.label }}
                  <span class="group-count">{{ group.items.length }}</span>
                </h6>
                <div class="group-body">
                  @for (n of group.items; track n.id) {
                    <app-notification-item
                      [notification]="n"
                      [actionLabel]="notifRouter.actionLabel(n)"
                      (activate)="notifRouter.open(n)"
                    />
                  }
                </div>
              </section>
            }

            <!-- Paging sentinel: the API's total count is dropped by the envelope
                 interceptor, so hasMore is inferred from a full-length page. -->
            <div
              appInfiniteScroll
              [appInfiniteScrollDisabled]="!notifications.hasMore() || notifications.loadingMore()"
              (scrolled)="notifications.loadMore()"
            ></div>

            @if (notifications.loadingMore()) {
              <p class="state-row">
                <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading more…
              </p>
            } @else if (!notifications.hasMore()) {
              <p class="state-row is-quiet">You've reached the beginning.</p>
            }
          }
        </div>

        <aside class="flex flex-col gap-4 xl:sticky xl:top-[84px]">
          <!-- Read progress -->
          <div class="card-fb p-5">
            <div class="flex items-center gap-4">
              <div class="fb-ring" [style.background]="ringBackground()">
                <div class="fb-ring-inner">
                  <span class="fb-ring-num">{{ notifications.unreadCount() }}</span>
                  <span class="fb-ring-cap">unread</span>
                </div>
              </div>
              <div class="min-w-0">
                <div class="font-bold text-sm">Inbox</div>
                <div class="text-muted text-xs mt-0.5">
                  {{ readCount() }} of {{ total() }} read
                </div>
                @if (total()) {
                  <div class="text-primary-deep text-xs font-semibold mt-1.5">
                    {{ readPct() }}% cleared
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Breakdown by category — each row is also a filter shortcut -->
          <div class="card-fb p-5">
            <div class="flex items-center justify-between mb-3">
              <div class="font-bold text-sm">By category</div>
              @if (filter() !== 'all') {
                <button type="button" class="fb-link text-xs" (click)="filter.set('all')">
                  Clear
                </button>
              }
            </div>

            @if (total()) {
              <div class="flex flex-col gap-1">
                @for (c of categories(); track c.id) {
                  <button
                    type="button"
                    class="cat-row"
                    [class.is-active]="filter() === c.id"
                    [attr.aria-pressed]="filter() === c.id"
                    (click)="toggleCategory(c.id)"
                  >
                    <span class="cat-icon" [style.color]="c.color">
                      <i [class]="c.icon" aria-hidden="true"></i>
                    </span>
                    <span class="cat-label">{{ c.label }}</span>
                    <span class="cat-count">{{ c.count }}</span>
                    <span class="cat-bar" aria-hidden="true">
                      <span
                        class="cat-fill"
                        [style.width.%]="c.pct"
                        [style.background]="c.color"
                      ></span>
                    </span>
                  </button>
                }
              </div>
            } @else {
              <p class="text-muted text-xs m-0">
                Counts appear here once you have notifications.
              </p>
            }
          </div>

          <!-- Preferences pointer -->
          <div class="card-fb p-5">
            <div class="flex items-start gap-3">
              <div class="pref-icon"><i class="fa-solid fa-sliders" aria-hidden="true"></i></div>
              <div class="min-w-0">
                <div class="font-bold text-sm">Notification settings</div>
                <p class="text-muted text-xs mt-1 mb-2.5 leading-relaxed">
                  Choose which pickups, confirmations and rewards reach you.
                </p>
                <a [routerLink]="['/app', 'settings']" class="fb-link text-xs">
                  Manage preferences
                  <i class="fa-solid fa-arrow-right ml-1 text-[10px]" aria-hidden="true"></i>
                </a>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </app-page-wrapper>
  `,
  styles: `
    .group-head {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 11px 18px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--fb-muted);
      border-bottom: 1px solid var(--fb-line);
      /* Opaque, not a tint: rows scroll underneath this header. */
      background: var(--fb-surface);
    }
    .group-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 10.5px;
      letter-spacing: 0;
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
    }
    section + section .group-head {
      border-top: 1px solid var(--fb-line);
    }
    .group-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
    }

    .state-row {
      margin: 0;
      padding: 18px;
      text-align: center;
      font-size: 12.5px;
      color: var(--fb-muted);
      border-top: 1px solid var(--fb-line);
    }
    .state-row.is-quiet {
      font-size: 11.5px;
      opacity: 0.8;
    }

    /* ---- Loading skeleton (same shimmer as listing-grid) ---- */
    .sk-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 15px 18px;
    }
    .sk-row + .sk-row {
      border-top: 1px solid var(--fb-line);
    }
    .sk {
      border-radius: 8px;
      background: linear-gradient(
        90deg,
        var(--fb-line) 25%,
        var(--fb-bg) 37%,
        var(--fb-line) 63%
      );
      background-size: 400% 100%;
      animation: fb-shimmer 1.3s ease-in-out infinite;
    }
    @keyframes fb-shimmer {
      0% {
        background-position: 100% 0;
      }
      100% {
        background-position: -100% 0;
      }
    }

    /* ---- Read-progress ring ---- */
    .ring {
      width: 74px;
      height: 74px;
      flex-shrink: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
      /* The conic gradient itself is bound from the component so the swept
         angle can follow the read percentage. */
    }
    .ring-inner {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: var(--fb-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .ring-num {
      font-size: 20px;
      font-weight: 800;
      color: var(--fb-ink);
    }
    .ring-cap {
      margin-top: 2px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--fb-muted);
    }

    /* ---- Category breakdown rows ---- */
    .cat-row {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      grid-template-areas:
        'icon label count'
        'icon bar   bar';
      align-items: center;
      /* 7px row gap, not 2px — any tighter and the share bar reads as an
         underline on the label rather than its own element. */
      gap: 7px 10px;
      width: 100%;
      padding: 8px 10px 9px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    }
    .cat-row:hover {
      background: rgb(var(--fb-primary-rgb) / 0.07);
    }
    .cat-row.is-active {
      background: rgb(var(--fb-primary-rgb) / 0.11);
      border-color: var(--fb-primary);
    }
    .cat-row:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .cat-icon {
      grid-area: icon;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      font-size: 12px;
      /* currentColor is the category accent, so the tile tints itself. */
      background: color-mix(in srgb, currentColor 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);
    }
    /* The glyph is pushed away from the accent rather than left at full
       saturation: a mid-tone accent on a 14% wash of itself only reaches
       ~2.7:1, under the 3:1 floor for meaningful non-text content. Darkening
       in light mode (and lightening in dark) keeps the soft tile look while
       clearing it. */
    .cat-icon i {
      color: color-mix(in srgb, currentColor 72%, #000);
    }
    :host-context(.dark) .cat-icon i {
      color: color-mix(in srgb, currentColor 62%, #fff);
    }
    .cat-label {
      grid-area: label;
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-ink);
    }
    .cat-count {
      grid-area: count;
      font-size: 12px;
      font-weight: 700;
      color: var(--fb-muted);
      font-variant-numeric: tabular-nums;
    }
    .cat-bar {
      grid-area: bar;
      height: 4px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--fb-line);
    }
    .cat-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }

    /* ---- Preferences card ---- */
    .pref-icon {
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      font-size: 15px;
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
      box-shadow: inset 0 0 0 1px rgb(var(--fb-primary-rgb) / 0.2);
    }

    @media (prefers-reduced-motion: reduce) {
      .sk {
        animation: none;
      }
      .cat-row,
      .cat-fill {
        transition: none;
      }
    }
  `,
})
export class Notifications {
  private readonly clock = inject(ClockService);
  protected readonly notifications = inject(NotificationService);
  protected readonly notifRouter = inject(NotificationRouter);

  protected readonly filter = signal<NotificationFilter>('all');

  /** Placeholder rows while the first page loads. */
  protected readonly skeletons = Array.from({ length: 5 });

  protected readonly total = computed(() => this.notifications.notifications().length);

  protected readonly inboxSummary = computed(() => {
    const unread = this.notifications.unreadCount();
    return unread
      ? `${unread} unread of ${this.total()} notifications`
      : "Everything's read — nothing needs your attention.";
  });

  protected readonly readCount = computed(() => this.total() - this.notifications.unreadCount());

  protected readonly readPct = computed(() => {
    const total = this.total();
    return total ? Math.round((this.readCount() / total) * 100) : 0;
  });

  /**
   * The read-progress donut. Built here rather than in CSS because the swept
   * angle is data-driven, and a conic-gradient percentage cannot be expressed
   * with a plain class.
   */
  protected readonly ringBackground = computed(() => {
    const pct = this.total() ? this.readPct() : 0;
    return (
      `conic-gradient(var(--fb-primary) 0 ${pct}%, ` +
      `rgb(var(--fb-primary-rgb) / 0.15) ${pct}% 100%)`
    );
  });

  /** The four category buckets with counts and a share-of-total bar width. */
  protected readonly categories = computed(() => {
    const counts = this.notifications.filterCounts();
    // Share is relative to the busiest category, not the total, so the bars
    // stay comparable instead of all collapsing when one type dominates.
    const busiest = Math.max(
      1,
      ...NOTIFICATION_FILTERS.filter((f) => isCategory(f.id)).map((f) => counts[f.id]),
    );

    return NOTIFICATION_FILTERS.filter((f) => isCategory(f.id)).map((f) => ({
      id: f.id as NotificationCategory,
      label: f.label,
      icon: f.icon,
      color: categoryColor(f.id as NotificationCategory),
      count: counts[f.id],
      pct: Math.round((counts[f.id] / busiest) * 100),
    }));
  });

  /** Clicking the active category clears the filter, so the row toggles. */
  protected toggleCategory(category: NotificationCategory): void {
    this.filter.update((current) => (current === category ? 'all' : category));
  }

  /** Filtered rows bucketed into Today / Yesterday / Earlier, newest first. */
  protected readonly groups = computed<NotificationGroup[]>(() => {
    const rows = filterNotifications(this.notifications.notifications(), this.filter());
    const now = this.clock.now();
    const order: DayBucket[] = ['today', 'yesterday', 'earlier'];

    return order
      .map((bucket) => ({
        bucket,
        label: BUCKET_LABELS[bucket],
        items: rows.filter((n) => dayBucket(n.createdAtUtc, now) === bucket),
      }))
      .filter((group) => group.items.length > 0);
  });

  protected readonly emptyTitle = computed(() =>
    this.filter() === 'all' ? 'No notifications yet' : 'Nothing matches this filter',
  );

  protected readonly emptyText = computed(() =>
    this.filter() === 'all'
      ? 'Pickups, confirmations and rewards will show up here as they happen.'
      : 'Try a different filter to see the rest of your notifications.',
  );
}
