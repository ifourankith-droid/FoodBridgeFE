import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fb-toast-stack" role="region" aria-live="polite" aria-label="Notifications">
      @for (t of toast.toasts(); track t.id) {
        <div class="fb-toast" [attr.data-type]="t.type" role="alert">
          <span class="fb-toast__icon">
            <i [class]="t.icon" aria-hidden="true"></i>
          </span>
          <div class="fb-toast__body">
            <p class="fb-toast__title">{{ t.title }}</p>
            <p class="fb-toast__msg">{{ t.message }}</p>
          </div>
          <button
            type="button"
            class="fb-toast__close"
            aria-label="Dismiss notification"
            (click)="toast.dismiss(t.id)"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
          <span class="fb-toast__bar" [style.animation-duration.ms]="t.duration"></span>
        </div>
      }
    </div>
  `,
  styles: `
    .fb-toast-stack {
      position: fixed;
      top: 22px;
      right: 22px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: min(380px, calc(100vw - 32px));
      pointer-events: none;
    }

    .fb-toast {
      --accent: var(--fb-primary);
      --accent-soft: var(--fb-primary-soft);
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 14px 15px 16px;
      border-radius: 14px;
      background: var(--fb-surface);
      color: var(--fb-ink);
      border: 1px solid var(--fb-line);
      border-left: 4px solid var(--accent);
      box-shadow: var(--fb-shadow-lg);
      overflow: hidden;
      pointer-events: auto;
      animation: fb-toast-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .fb-toast[data-type='success'] {
      --accent: var(--fb-success);
      --accent-soft: var(--fb-success-soft);
    }
    .fb-toast[data-type='error'] {
      --accent: #e04434;
      --accent-soft: rgba(224, 68, 52, 0.14);
    }
    .fb-toast[data-type='warning'] {
      --accent: var(--fb-orange);
      --accent-soft: var(--fb-orange-soft);
    }
    .fb-toast[data-type='info'] {
      --accent: var(--fb-primary);
      --accent-soft: var(--fb-primary-soft);
    }

    .fb-toast__icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 15px;
    }

    .fb-toast__body {
      flex: 1 1 auto;
      min-width: 0;
      padding-top: 1px;
    }

    .fb-toast__title {
      margin: 0;
      font-weight: 700;
      font-size: 13.5px;
      line-height: 1.3;
      color: var(--fb-ink);
    }

    .fb-toast__msg {
      margin: 2px 0 0;
      font-size: 13px;
      line-height: 1.4;
      color: var(--fb-muted);
      word-break: break-word;
    }

    .fb-toast__close {
      flex: none;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      margin: -2px -2px 0 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--fb-muted);
      font-size: 13px;
      cursor: pointer;
      transition:
        background 0.2s ease,
        color 0.2s ease;
    }
    .fb-toast__close:hover {
      background: var(--fb-bg);
      color: var(--fb-ink);
    }

    .fb-toast__bar {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      transform-origin: left;
      background: var(--accent);
      opacity: 0.55;
      animation-name: fb-toast-bar;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }

    @keyframes fb-toast-in {
      from {
        opacity: 0;
        transform: translateX(24px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes fb-toast-bar {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fb-toast {
        animation: none;
      }
      .fb-toast__bar {
        display: none;
      }
    }
  `,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
