import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ListingStatus, TIMELINE_STEPS } from '@core/models/listing.model';

@Component({
  selector: 'app-rescue-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rescue-timeline">
      <div class="tl-progress" [style.width.%]="progress()"></div>
      @for (step of steps; track step.status; let i = $index) {
        <div class="tl-step" [class.done]="i < currentIndex()" [class.current]="i === currentIndex()">
          <div class="tl-dot"><i class="fa-solid" [class]="step.icon"></i></div>
          <div class="tl-step-label">{{ step.label }}</div>
        </div>
      }
    </div>
  `,
  styles: `
    .rescue-timeline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      position: relative;
      padding: 20px 0;
    }
    .rescue-timeline::before {
      content: '';
      position: absolute;
      top: 39px;
      left: 6%;
      right: 6%;
      height: 3px;
      background: var(--fb-line);
      z-index: 0;
    }
    .tl-progress {
      position: absolute;
      top: 39px;
      left: 6%;
      height: 3px;
      background: linear-gradient(90deg, var(--fb-primary-bright), var(--fb-primary-deep));
      z-index: 1;
      transition: width 0.5s ease;
    }
    .tl-step {
      flex: 1;
      text-align: center;
      position: relative;
      z-index: 2;
    }
    .tl-dot {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: var(--fb-surface);
      border: 3px solid var(--fb-line);
      margin: 0 auto 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: var(--fb-muted);
      transition: all 0.3s ease;
    }
    .tl-step.done .tl-dot {
      background: var(--fb-success);
      border-color: var(--fb-success);
      color: #fff;
    }
    .tl-step.current .tl-dot {
      background: var(--fb-orange);
      border-color: var(--fb-orange);
      color: #fff;
    }
    .tl-step-label {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--fb-muted);
    }
    .tl-step.done .tl-step-label,
    .tl-step.current .tl-step-label {
      color: var(--fb-ink);
    }
  `,
})
export class RescueTimeline {
  readonly status = input.required<ListingStatus>();
  protected readonly steps = TIMELINE_STEPS;

  protected readonly currentIndex = computed(() => {
    const status = this.status();
    // Expired/cancelled/rejected aren't on the happy path — no active step.
    if (status === 'expired') {
      return -1;
    }
    return TIMELINE_STEPS.findIndex((s) => s.status === status);
  });

  protected readonly progress = computed(
    () => (Math.max(0, this.currentIndex()) / (TIMELINE_STEPS.length - 1)) * 88,
  );
}
