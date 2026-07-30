import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ClockService } from '@core/services/clock.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DEFAULT_WINDOW = 6 * HOUR;

/**
 * Pickup-deadline progress bar. The fill represents the fraction of the pickup
 * window still remaining and shifts colour as it runs out:
 * green → amber (< 2h) → red (< 30m) → grey (expired). Ticks via {@link ClockService}.
 *
 * @example <app-deadline-meter [deadline]="l.pickupDeadlineUtc" [createdAt]="l.createdAtUtc" />
 */
@Component({
  selector: 'app-deadline-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dm">
      <div class="dm-row">
        <span class="dm-label" [style.color]="color()">
          <i class="fa-regular fa-clock"></i> {{ label() }}
        </span>
      </div>
      <div class="dm-track">
        <div class="dm-fill" [style.width.%]="pct()" [style.background]="color()"></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .dm-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .dm-label {
      font-size: 12px;
      font-weight: 600;
    }
    .dm-track {
      height: 6px;
      border-radius: 999px;
      background: var(--fb-line);
      overflow: hidden;
    }
    .dm-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease, background 0.4s ease;
    }
  `,
})
export class DeadlineMeter {
  private readonly clock = inject(ClockService);

  readonly deadline = input.required<string>();
  readonly createdAt = input<string | null>(null);

  private readonly deadlineMs = computed(() => new Date(this.deadline()).getTime());
  private readonly startMs = computed(() => {
    const created = this.createdAt();
    return created ? new Date(created).getTime() : this.deadlineMs() - DEFAULT_WINDOW;
  });
  private readonly remaining = computed(() => this.deadlineMs() - this.clock.now());

  protected readonly pct = computed(() => {
    const total = this.deadlineMs() - this.startMs();
    if (total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (this.remaining() / total) * 100));
  });

  protected readonly color = computed(() => {
    const ms = this.remaining();
    if (ms <= 0) {
      return '#8a8a8a';
    }
    if (ms < 30 * MINUTE) {
      return '#e04434';
    }
    if (ms < 2 * HOUR) {
      return 'var(--fb-orange)';
    }
    return 'var(--fb-success)';
  });

  protected readonly label = computed(() => {
    const ms = this.remaining();
    if (ms <= 0) {
      return 'Pickup window expired';
    }
    return `${this.humanize(ms)} left`;
  });

  private humanize(ms: number): string {
    const totalMinutes = Math.floor(ms / MINUTE);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
