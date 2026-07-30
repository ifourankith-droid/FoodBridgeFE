import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Notification, notificationMeta } from '@core/models/notification.model';
import { ClockService } from '@core/services/clock.service';
import { timeAgo } from '@shared/util/time-ago';

/**
 * One notification row. Shared by the topbar bell dropdown (`compact`) and the
 * notifications inbox so both read identically — only the density differs.
 *
 * @example
 * <app-notification-item [notification]="n" [compact]="true" (activate)="markRead(n.id)" />
 */
@Component({
  selector: 'app-notification-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      class="row"
      [class.is-compact]="compact()"
      [class.is-unread]="!notification().isRead"
      [attr.aria-label]="ariaLabel()"
      (click)="activate.emit(notification())"
    >
      <span class="medallion" [style.color]="meta().color">
        <i [class]="meta().icon" aria-hidden="true"></i>
      </span>

      <span class="body">
        @if (!compact()) {
          <span class="eyebrow">{{ meta().label }}</span>
        }
        <span class="title">{{ notification().title }}</span>
        @if (notification().body) {
          <span class="text">{{ notification().body }}</span>
        }
        <span class="foot">
          <span class="time">
            <i class="fa-regular fa-clock" aria-hidden="true"></i>{{ when() }}
          </span>
          @if (actionLabel()) {
            <span class="action">
              {{ actionLabel() }}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </span>
          }
        </span>
      </span>

      @if (!notification().isRead) {
        <span class="dot" aria-hidden="true"></span>
      }
    </button>
  `,
  styles: `
    .row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
      text-align: left;
      padding: 13px 14px;
      border: 1px solid transparent;
      border-radius: 14px;
      background: transparent;
      color: var(--fb-ink);
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    }
    .row:hover {
      background: var(--fb-primary-soft);
      border-color: var(--fb-line);
    }
    .row:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .row.is-compact {
      gap: 10px;
      padding: 10px 11px;
      border-radius: 12px;
    }

    /* Unread rows carry a brand wash plus a leading rail — colour alone would
       be the only cue otherwise, and the dot is small. Alpha rather than
       --fb-primary-soft so it composites over the card in dark mode too. */
    .row.is-unread {
      background: rgb(var(--fb-primary-rgb) / 0.07);
      box-shadow: inset 3px 0 0 var(--fb-primary);
    }
    .row.is-unread:hover {
      background: rgb(var(--fb-primary-rgb) / 0.13);
    }

    /* ---- Type medallion ---- */
    .medallion {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 11px;
      font-size: 14px;
      /* currentColor is the type's accent, so the tile tints itself. */
      background: color-mix(in srgb, currentColor 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);
    }
    /* Push the glyph away from the accent instead of leaving it at full
       saturation: a mid-tone accent on a 14% wash of itself measured as low as
       1.9:1, under the 3:1 floor for meaningful non-text content. */
    .medallion i {
      color: color-mix(in srgb, currentColor 72%, #000);
    }
    :host-context(.dark) .medallion i {
      color: color-mix(in srgb, currentColor 62%, #fff);
    }
    .is-compact .medallion {
      width: 31px;
      height: 31px;
      border-radius: 9px;
      font-size: 12.5px;
    }

    /* ---- Copy ---- */
    .body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .eyebrow {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--fb-muted);
    }
    .title {
      font-size: 13.5px;
      font-weight: 600;
      line-height: 1.35;
    }
    .text {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--fb-muted);
      text-wrap: pretty;
    }
    /* The dropdown is a preview, not the record — clamp long bodies there and
       let the inbox show them in full. */
    .is-compact .text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
    /* Timestamp on the left, the "where this goes" affordance on the right. */
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin-top: 3px;
    }
    .time {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--fb-muted);
    }
    .action {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--fb-primary-deep);
    }
    .action i {
      font-size: 9px;
      transition: transform 0.15s ease;
    }
    .row:hover .action i,
    .row:focus-visible .action i {
      transform: translateX(2px);
    }

    .dot {
      width: 8px;
      height: 8px;
      margin-top: 6px;
      flex-shrink: 0;
      border-radius: 50%;
      background: var(--fb-orange);
    }

    @media (prefers-reduced-motion: reduce) {
      .row,
      .action i {
        transition: none;
      }
      .row:hover .action i,
      .row:focus-visible .action i {
        transform: none;
      }
    }
  `,
})
export class NotificationItem {
  private readonly clock = inject(ClockService);

  readonly notification = input.required<Notification>();

  /** Denser layout with a clamped body — for the bell dropdown. */
  readonly compact = input(false);

  /**
   * Where activating this row leads, e.g. "View nearby listings". Supplied by the
   * parent from `NotificationRouter.actionLabel()` (which is role-aware); empty
   * for rows that only mark themselves read.
   */
  readonly actionLabel = input('');

  readonly activate = output<Notification>();

  protected readonly meta = computed(() => notificationMeta(this.notification().type));
  protected readonly when = computed(() =>
    timeAgo(this.notification().createdAtUtc, this.clock.now()),
  );
  protected readonly ariaLabel = computed(() => {
    const n = this.notification();
    const action = this.actionLabel();
    return `${n.isRead ? '' : 'Unread: '}${n.title}. ${this.when()}${action ? `. ${action}` : ''}`;
  });
}
