import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Self-contained animated success graphic — a gradient badge that pops in with a
 * drawing checkmark and a pulsing ring. Used for "verified / done" moments in
 * place of a static icon (no external GIF/asset, works offline, theme-aware).
 *
 * @example <app-success-anim [size]="112" label="Mobile verified" />
 */
@Component({
  selector: 'app-success-anim',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="success-anim"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 120 120"
      role="img"
      [attr.aria-label]="label()"
    >
      <defs>
        <linearGradient id="fbSuccessGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--fb-success)" />
          <stop offset="100%" stop-color="var(--fb-success-deep)" />
        </linearGradient>
      </defs>

      <!-- pulsing rings -->
      <circle class="ring ring-1" cx="60" cy="60" r="46" />
      <circle class="ring ring-2" cx="60" cy="60" r="46" />

      <!-- badge -->
      <circle class="badge" cx="60" cy="60" r="44" fill="url(#fbSuccessGrad)" />

      <!-- checkmark -->
      <path class="check" d="M41 61 L54 74 L80 47" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .success-anim {
      overflow: visible;
    }

    .badge {
      transform-box: fill-box;
      transform-origin: center;
      animation: fb-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .check {
      fill: none;
      stroke: #fff;
      stroke-width: 8;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 60;
      stroke-dashoffset: 60;
      animation: fb-draw 0.4s ease-out 0.35s forwards;
    }

    .ring {
      fill: none;
      stroke: var(--fb-success);
      transform-box: fill-box;
      transform-origin: center;
      opacity: 0;
      animation: fb-ring 1.8s ease-out infinite;
    }
    .ring-1 {
      stroke-width: 3;
      animation-delay: 0.5s;
    }
    .ring-2 {
      stroke-width: 2;
      animation-delay: 1.15s;
    }

    @keyframes fb-pop {
      0% {
        transform: scale(0);
      }
      60% {
        transform: scale(1.08);
      }
      100% {
        transform: scale(1);
      }
    }
    @keyframes fb-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes fb-ring {
      0% {
        transform: scale(0.85);
        opacity: 0.5;
      }
      100% {
        transform: scale(1.6);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .badge,
      .check,
      .ring {
        animation: none;
      }
      .check {
        stroke-dashoffset: 0;
      }
      .ring {
        display: none;
      }
    }
  `,
})
export class SuccessAnim {
  readonly size = input(112);
  readonly label = input('Success');
}
