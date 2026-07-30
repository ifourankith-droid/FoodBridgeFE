import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type FbButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger' | 'success';
export type FbButtonSize = 'sm' | 'md' | 'lg';
export type FbButtonType = 'button' | 'submit' | 'reset';
export type FbIconPosition = 'left' | 'right';

/**
 * App-wide button. Wraps the existing `.btn-fb*` styling with a single,
 * config-driven API so every screen renders consistent buttons.
 *
 * @example
 * <app-button icon="fa-solid fa-paper-plane" (clicked)="send()">Send OTP</app-button>
 * <app-button variant="outline" size="sm" [iconOnly]="true" icon="fa-solid fa-pen" />
 * <app-button variant="danger" [loading]="saving()" [block]="true">Delete</app-button>
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
      [attr.aria-label]="iconOnly() ? ariaLabel() : null"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="onClick($event)"
    >
      @if (loading()) {
        <i class="fa-solid fa-spinner fa-spin" [class.mr-2]="!iconOnly()"></i>
      } @else if (icon() && iconPosition() === 'left') {
        <i [class]="icon()" [class.mr-2]="!iconOnly()"></i>
      }

      @if (!iconOnly()) {
        <ng-content />
      }

      @if (!loading() && icon() && iconPosition() === 'right' && !iconOnly()) {
        <i [class]="icon()" class="ml-2"></i>
      }
    </button>
  `,
  host: {
    '[class.is-block]': 'block()',
  },
  styles: `
    :host {
      display: inline-flex;
    }
    :host.is-block {
      display: flex;
      width: 100%;
    }
    :host.is-block .fb-btn {
      width: 100%;
    }
    .fb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border-radius: var(--fb-radius-btn, 12px);
      border: 1px solid transparent;
      cursor: pointer;
      transition:
        transform 0.15s ease,
        background 0.15s ease,
        color 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;
      white-space: nowrap;
    }
    .fb-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .fb-btn:not(:disabled):hover {
      transform: translateY(-1px);
    }

    /* Sizes */
    .fb-btn.sm {
      padding: 7px 14px;
      font-size: 13px;
    }
    .fb-btn.md {
      padding: 11px 22px;
      font-size: 14.5px;
    }
    .fb-btn.lg {
      padding: 14px 28px;
      font-size: 16px;
    }
    .fb-btn.icon-only {
      padding: 0;
      aspect-ratio: 1;
    }
    .fb-btn.icon-only.sm {
      width: 34px;
      height: 34px;
    }
    .fb-btn.icon-only.md {
      width: 42px;
      height: 42px;
    }
    .fb-btn.icon-only.lg {
      width: 50px;
      height: 50px;
    }

    /* Variants */
    .fb-btn.solid {
      color: #fff;
      background: linear-gradient(135deg, var(--fb-primary), var(--fb-primary-deep));
      box-shadow: 0 8px 20px var(--fb-glow-primary-deep);
    }
    .fb-btn.outline {
      background: var(--fb-surface);
      color: var(--fb-primary-deep);
      border: 1px solid var(--fb-primary) ;
      outline: none;
    }
    .fb-btn.outline:not(:disabled):hover {
      background: var(--fb-primary-soft);
    }
    .fb-btn.ghost {
      background: transparent;
      color: var(--fb-muted);
      border: 1px solid var(--fb-muted);
    }
    .fb-btn.ghost:not(:disabled):hover {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .fb-btn.danger {
      color: #fff;
      background: linear-gradient(135deg, #ef4444, #b91c1c);
      box-shadow: 0 8px 20px rgba(185, 28, 28, 0.22);
    }
    .fb-btn.success {
      color: #fff;
      background: linear-gradient(135deg, var(--fb-success), var(--fb-success-deep));
      box-shadow: 0 8px 20px rgba(30, 158, 92, 0.22);
    }
  `,
})
export class FbButton {
  readonly variant = input<FbButtonVariant>('solid');
  readonly size = input<FbButtonSize>('md');
  readonly type = input<FbButtonType>('button');
  readonly icon = input<string>('');
  readonly iconPosition = input<FbIconPosition>('left');
  readonly iconOnly = input(false);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);
  /** Accessible label — required when `iconOnly` is true. */
  readonly ariaLabel = input<string>('');

  readonly clicked = output<MouseEvent>();

  protected readonly classes = computed(() => {
    const cls = ['fb-btn', this.variant(), this.size()];
    if (this.iconOnly()) {
      cls.push('icon-only');
    }
    return cls.join(' ');
  });

  protected onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      return;
    }
    this.clicked.emit(event);
  }
}
