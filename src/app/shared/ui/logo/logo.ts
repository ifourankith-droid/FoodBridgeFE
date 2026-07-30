import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * FoodBridge brand mark — a leaf rising over a bridge arch, on the app's
 * primary gradient tile. Single source of truth for the logo; use it wherever
 * the brand appears (sidebar, auth screens, empty states).
 *
 * @example
 * <app-logo [size]="38" />
 * <app-logo [size]="64" [showWordmark]="true" />
 * <app-logo [size]="46" [showWordmark]="true" textClass="auth-brand-name" />
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="fb-logo-wrap">
      <span
        class="fb-logo-tile"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.border-radius.px]="radius()"
      >
      <i class="fa-solid fa-leaf"></i>
      </span>
      @if (showWordmark()) {
        <span [class]="wordClass()" [style.font-size.px]="wordSize()">FoodBridge</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .fb-logo-wrap {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .fb-logo-tile {
      display: inline-flex;
      align-items: center;
      color: #fff;
        font-size: 1.1rem;
      justify-content: center;
      background: linear-gradient(135deg, var(--fb-primary-bright), var(--fb-primary-deep));
      box-shadow: 0 8px 18px rgb(var(--fb-primary-deep-rgb) / 0.35);
      flex-shrink: 0;
    }
    .fb-logo-word {
      font-weight: 800;
      letter-spacing: -0.01em;
      /* Inherit the container's colour so the wordmark stays legible on both
         light surfaces (ink) and the brand gradient panel (white). */
      color: inherit;
      line-height: 1;
    }
  `,
})
export class FbLogo {
  readonly size = input(40);
  readonly showWordmark = input(false);
  /** Extra class(es) applied to the wordmark text (e.g. a brand-panel style). */
  readonly textClass = input('');

  protected radius(): number {
    return Math.round(this.size() * 0.3);
  }

  protected wordSize(): number {
    return Math.round(this.size() * 0.45);
  }

  protected wordClass(): string {
    return `fb-logo-word ${this.textClass()}`.trim();
  }
}
