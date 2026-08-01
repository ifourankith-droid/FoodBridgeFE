import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ApiTimelineEvent } from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS, TIMELINE_STEPS } from '@core/models/listing.model';
import { DialogService } from '@core/services/dialog.service';
import { openImageDialog } from '@shared/ui/image-viewer/image-viewer-dialog';

/** One rendered lifecycle step — reached or not, with its event details if reached. */
interface Step {
  status: ListingStatus;
  icon: string;
  label: string;
  /** This step has been reached (line + dot filled). */
  done: boolean;
  /** The connector to the next step is filled (this step is before the furthest reached). */
  connectorDone: boolean;
  at: string | null;
  actorName: string | null;
  photoUrl: string | null;
  note: string | null;
}

/**
 * A horizontal lifecycle timeline for a listing. It always shows the full chain
 * (Posted → Claimed → Picked Up → Delivered → Confirmed): steps that have happened
 * are filled and carry their details — the time, who did it, and (when captured) a
 * photo button that opens the shared image viewer — while steps not yet reached stay
 * greyed. Feed it the events from `GET /listings/{id}/timeline`.
 */
@Component({
  selector: 'app-timeline-horizontal',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tlh">
      @for (s of steps(); track s.status) {
        <div class="tlh-step" [class.is-done]="s.done" [class.connector-done]="s.connectorDone">
          <div class="tlh-dot"><i [class]="s.icon" aria-hidden="true"></i></div>
          <div class="tlh-label">{{ s.label }}</div>
          @if (s.at) {
            <div class="tlh-time">{{ s.at | date: 'MMM d, h:mm a' }}</div>
            @if (s.actorName) {
              <div class="tlh-actor"><i class="fa-solid fa-user mr-1"></i>{{ s.actorName }}</div>
            }
            @if (s.note) {
              <div class="tlh-note">{{ s.note }}</div>
            }
            @if (s.photoUrl) {
              <button type="button" class="tlh-photo" (click)="viewPhoto(s)" title="View photo">
                <i class="fa-solid fa-image"></i>
              </button>
            }
          } @else {
            <div class="tlh-hint">{{ s.done ? '—' : 'Pending' }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .tlh {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      overflow-x: auto;
      padding: 8px 0 4px;
    }
    .tlh-step {
      position: relative;
      flex: 1 0 0;
      min-width: 104px;
      text-align: center;
    }
    /* Connector to the next dot — grey by default, filled when this step is done. */
    .tlh-step:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 21px;
      left: 50%;
      width: 100%;
      height: 2px;
      background: var(--fb-line);
      z-index: 0;
    }
    .tlh-step.connector-done::after {
      background: var(--fb-primary);
    }
    .tlh-dot {
      position: relative;
      z-index: 1;
      width: 44px;
      height: 44px;
      margin: 0 auto 8px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      /* Not-yet-reached: quiet grey. */
      color: var(--fb-muted);
      background: var(--fb-surface);
      border: 2px solid var(--fb-line);
    }
    /* Reached: brand gradient. */
    .tlh-step.is-done .tlh-dot {
      color: #fff;
      border-color: transparent;
      background: linear-gradient(135deg, rgb(var(--fb-primary-rgb)), rgb(var(--fb-primary-deep-rgb)));
    }
    .tlh-label {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--fb-muted);
    }
    .tlh-step.is-done .tlh-label {
      color: var(--fb-ink);
    }
    .tlh-time {
      margin-top: 2px;
      font-size: 11px;
      color: var(--fb-muted);
      font-variant-numeric: tabular-nums;
    }
    .tlh-actor {
      margin-top: 1px;
      font-size: 11px;
      color: var(--fb-muted);
    }
    .tlh-note {
      margin-top: 2px;
      font-size: 11px;
      color: var(--fb-muted);
      line-height: 1.4;
    }
    .tlh-hint {
      margin-top: 2px;
      font-size: 11px;
      color: var(--fb-muted);
      opacity: 0.7;
    }
    .tlh-photo {
      margin-top: 7px;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      border: 1px solid var(--fb-line);
      background: var(--fb-bg);
      color: var(--fb-primary-deep);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      transition: background 0.15s ease;
    }
    .tlh-photo:hover {
      background: var(--fb-primary-soft);
    }
  `,
})
export class TimelineHorizontal {
  readonly entries = input.required<readonly ApiTimelineEvent[]>();

  private readonly dialog = inject(DialogService);

  protected readonly steps = computed<Step[]>(() => {
    // Events carry PascalCase status names ('PickedUp'); the lifecycle is keyed lowercase.
    const byStatus = new Map<string, ApiTimelineEvent>();
    for (const e of this.entries()) {
      byStatus.set(e.status.toLowerCase(), e);
    }

    // Furthest lifecycle step that actually happened — everything up to it is "done".
    let reached = -1;
    TIMELINE_STEPS.forEach((step, i) => {
      if (byStatus.has(step.status)) {
        reached = i;
      }
    });

    return TIMELINE_STEPS.map((step, i) => {
      const e = byStatus.get(step.status) ?? null;
      return {
        status: step.status,
        icon: STATUS_ICONS[step.status],
        label: STATUS_LABELS[step.status],
        done: i <= reached,
        connectorDone: i < reached,
        at: e?.createdAtUtc ?? null,
        actorName: e?.actorName ?? null,
        photoUrl: e?.photoUrl ?? null,
        note: e?.note ?? null,
      };
    });
  });

  protected viewPhoto(s: Step): void {
    if (s.photoUrl) {
      openImageDialog(this.dialog, { title: s.label, imageUrl: s.photoUrl });
    }
  }
}
