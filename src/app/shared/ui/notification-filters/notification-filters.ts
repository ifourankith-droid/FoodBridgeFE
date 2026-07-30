import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import {
  NOTIFICATION_FILTERS,
  NotificationFilter,
  NotificationFilterDef,
} from '@core/models/notification.model';

/**
 * Type/read-state filter chips for notifications. Two-way bound to the caller's
 * filter signal, so the bell dropdown and the inbox each keep their own
 * selection while sharing this row.
 *
 * @example
 * <app-notification-filters [(active)]="filter" [counts]="notifications.filterCounts()" />
 */
@Component({
  selector: 'app-notification-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'tablist', 'aria-label': 'Filter notifications' },
  template: `
    <div class="chips" [class.is-compact]="compact()">
      @for (f of filters(); track f.id) {
        <button
          type="button"
          class="chip"
          role="tab"
          [class.is-active]="active() === f.id"
          [attr.aria-selected]="active() === f.id"
          (click)="active.set(f.id)"
        >
          <i [class]="f.icon" aria-hidden="true"></i>
          <span>{{ f.label }}</span>
          @if (showCounts() && count(f) > 0) {
            <span class="count">{{ count(f) }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .chips {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }
    /* The dropdown is too narrow to wrap gracefully — scroll the row instead so
       the panel keeps a fixed height. */
    .chips.is-compact {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 1px;
    }
    .chips.is-compact::-webkit-scrollbar {
      display: none;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      height: 32px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      color: var(--fb-muted);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
    }
    .chip i {
      font-size: 11px;
    }
    .chip:hover {
      border-color: var(--fb-primary);
      color: var(--fb-primary-deep);
    }
    .chip:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .chip.is-active {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
      /* Same reasoning as the sidebar's active pill: an inset highlight locates
         the chip's edge on palettes where the fill sits close to the surface. */
      box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.28),
        0 4px 12px var(--fb-glow-primary-deep);
    }
    .chip.is-active:hover {
      color: #fff;
    }

    .count {
      min-width: 18px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      background: rgb(var(--fb-ink-rgb) / 0.08);
      color: inherit;
    }
    .chip.is-active .count {
      background: rgb(255 255 255 / 0.24);
    }

    .chips.is-compact .chip {
      height: 29px;
      padding: 0 10px;
      font-size: 12px;
    }

    @media (prefers-reduced-motion: reduce) {
      .chip {
        transition: none;
      }
    }
  `,
})
export class NotificationFilters {
  readonly active = model.required<NotificationFilter>();

  /** Row count per filter id — pass `NotificationService.filterCounts()`. */
  readonly counts = input<Partial<Record<NotificationFilter, number>>>({});

  readonly showCounts = input(true);

  /** Scrolling single-line row with smaller chips — for the bell dropdown. */
  readonly compact = input(false);

  readonly filters = input<readonly NotificationFilterDef[]>(NOTIFICATION_FILTERS);

  protected count(f: NotificationFilterDef): number {
    return this.counts()[f.id] ?? 0;
  }
}
