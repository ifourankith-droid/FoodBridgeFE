import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AvailabilityService } from '@core/services/availability.service';

/**
 * The volunteer's on/off availability control.
 *
 * Shared by the topbar and the Profile page so the two can't drift. Previously
 * the topbar showed a status *pill* and Profile showed a *button* — neither
 * looked switchable, and they disagreed on wording. This renders an actual
 * switch with `role="switch"`, so its state and affordance are obvious to both
 * sighted users and assistive tech.
 *
 * @example
 * <app-availability-toggle />            <!-- topbar pill -->
 * <app-availability-toggle variant="row" /> <!-- Profile settings row -->
 */
@Component({
  selector: 'app-availability-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (variant() === 'row') {
      <div class="row-wrap" [class.is-on]="on()">
        <div class="min-w-0">
          <div class="row-title">Availability</div>
          <p class="row-desc">{{ description() }}</p>
          @if (!on()) {
            <p class="row-note">
              <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
              Going available shares your current location.
            </p>
          }
        </div>
        <button
          type="button"
          class="sw"
          role="switch"
          [class.is-on]="on()"
          [class.is-busy]="busy()"
          [attr.aria-checked]="on()"
          [attr.aria-busy]="busy()"
          [attr.aria-label]="ariaLabel()"
          [disabled]="busy()"
          (click)="availability.toggle()"
        >
          <span class="track"><span class="knob"></span></span>
          <span class="sw-label">{{ stateLabel() }}</span>
        </button>
      </div>
    } @else {
      <button
        type="button"
        class="pill"
        role="switch"
        [class.is-on]="on()"
        [class.is-busy]="busy()"
        [attr.aria-checked]="on()"
        [attr.aria-busy]="busy()"
        [attr.aria-label]="ariaLabel()"
        [disabled]="busy()"
        (click)="availability.toggle()"
      >
        <span class="track"><span class="knob"></span></span>
        <span class="pill-label">{{ stateLabel() }}</span>
      </button>
    }
  `,
  styles: `
    /* ---- The switch itself, shared by both variants ---- */
    .track {
      position: relative;
      flex: none;
      width: 32px;
      height: 18px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--fb-muted) 42%, transparent);
      transition: background 0.18s ease;
    }
    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.28);
      transition: transform 0.18s ease;
    }
    .is-on .track {
      background: var(--fb-success);
    }
    .is-on .knob {
      transform: translateX(14px);
    }
    /* Spinner in place of the knob while the geolocation round-trip runs. */
    .is-busy .knob {
      background: #fff;
      animation: fb-av-pulse 0.9s ease-in-out infinite;
    }
    @keyframes fb-av-pulse {
      50% {
        opacity: 0.45;
      }
    }

    /* ---- Topbar pill ---- */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      height: 42px;
      padding: 0 15px 0 12px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-muted);
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;
    }
    .pill:hover:not(:disabled) {
      border-color: var(--fb-muted);
    }
    .pill.is-on {
      /* An alpha wash, not --fb-success-soft: this has to composite over the
         topbar surface in both themes. */
      background: rgb(var(--fb-success-rgb) / 0.12);
      border-color: rgb(var(--fb-success-rgb) / 0.45);
      color: var(--fb-success-deep);
    }
    .pill.is-on:hover:not(:disabled) {
      background: rgb(var(--fb-success-rgb) / 0.18);
    }
    .pill:focus-visible,
    .sw:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .pill:disabled,
    .sw:disabled {
      cursor: progress;
      opacity: 0.75;
    }
    .pill-label {
      white-space: nowrap;
    }

    /* ---- Profile row ---- */
    .row-wrap {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border-radius: var(--fb-radius);
      border: 1px solid var(--fb-line);
      background: var(--fb-bg);
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .row-wrap.is-on {
      border-color: rgb(var(--fb-success-rgb) / 0.4);
      background: rgb(var(--fb-success-rgb) / 0.07);
    }
    .row-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--fb-ink);
    }
    .row-desc {
      margin: 3px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fb-muted);
    }
    .row-note {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0 0;
      font-size: 11.5px;
      color: var(--fb-muted);
    }
    .sw {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      flex: none;
      padding: 7px 13px 7px 10px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--fb-muted);
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;
    }
    .sw.is-on {
      background: rgb(var(--fb-success-rgb) / 0.12);
      border-color: rgb(var(--fb-success-rgb) / 0.45);
      color: var(--fb-success-deep);
    }
    .sw-label {
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .track,
      .knob,
      .pill,
      .sw,
      .row-wrap {
        transition: none;
      }
      .is-busy .knob {
        animation: none;
      }
    }
  `,
})
export class AvailabilityToggle {
  protected readonly availability = inject(AvailabilityService);

  /** `pill` for the topbar; `row` for a settings-style list on Profile. */
  readonly variant = input<'pill' | 'row'>('pill');

  protected readonly on = this.availability.isActive;
  protected readonly busy = this.availability.busy;

  protected readonly stateLabel = computed(() =>
    this.busy() ? 'Locating…' : this.on() ? 'Available' : 'Offline',
  );

  protected readonly description = computed(() =>
    this.on()
      ? 'You are visible to nearby pickups and can be matched.'
      : 'You are hidden from matching and will not receive new work.',
  );

  protected readonly ariaLabel = computed(
    () => `Availability: ${this.on() ? 'available' : 'offline'}. Activate to toggle.`,
  );
}
