import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '@core/services/theme.service';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

@Component({
  selector: 'app-settings',
  imports: [PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Settings"
      description="Appearance, notifications and account preferences."
    >
      <div class="card-fb p-5 max-w-xl divide-y divide-line">
        <div class="flex justify-between items-center py-3 first:pt-0">
          <div>
            <div class="text-sm font-semibold">Dark Mode</div>
            <div class="text-muted text-xs">Switch between light and dark theme</div>
          </div>
          <button class="fb-switch" [class.on]="theme.darkMode()" (click)="theme.toggle()" role="switch" [attr.aria-checked]="theme.darkMode()">
            <span class="knob"></span>
          </button>
        </div>
        <div class="py-3">
          <div class="mb-3">
            <div class="text-sm font-semibold">Brand Colour</div>
            <div class="text-muted text-xs">Sets the app's primary colour</div>
          </div>
          <div role="radiogroup" aria-label="Brand colour" class="flex flex-wrap gap-2.5">
            @for (t of theme.themes; track t.id) {
              <button
                type="button"
                class="brand-opt"
                [class.sel]="theme.brand() === t.id"
                (click)="theme.setBrand(t.id)"
                role="radio"
                [attr.aria-checked]="theme.brand() === t.id"
                [title]="t.label + ' — ' + t.hint"
              >
                <!-- The theme-* class scopes that palette's CSS vars to the
                     swatch, so it previews its real colour without any hex
                     duplicated here. -->
                <span class="dot" [class]="'theme-' + t.id"></span>
                <span class="flex flex-col items-start leading-tight">
                  <span class="text-[13px] font-semibold">{{ t.label }}</span>
                  <span class="text-[10.5px] text-muted">{{ t.hint }}</span>
                </span>
              </button>
            }
          </div>
        </div>
        <div class="flex justify-between items-center py-3">
          <div>
            <div class="text-sm font-semibold">Push Notifications</div>
            <div class="text-muted text-xs">New listings, claims, confirmations</div>
          </div>
          <button class="fb-switch on" (click)="noop()" role="switch" aria-checked="true"><span class="knob"></span></button>
        </div>
        <div class="flex justify-between items-center py-3 last:pb-0">
          <div>
            <div class="text-sm font-semibold">Email Updates</div>
            <div class="text-muted text-xs">Weekly summary of your activity</div>
          </div>
          <button class="fb-switch" (click)="noop()" role="switch" aria-checked="false"><span class="knob"></span></button>
        </div>
      </div>
    </app-page-wrapper>
  `,
  styles: `
    .fb-switch {
      width: 44px;
      height: 24px;
      border-radius: 999px;
      background: var(--fb-line);
      border: 0;
      position: relative;
      cursor: pointer;
      transition: background 0.2s ease;
      flex-shrink: 0;
    }
    .fb-switch.on {
      background: var(--fb-primary);
    }
    .fb-switch .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s ease;
    }
    .fb-switch.on .knob {
      transform: translateX(20px);
    }

    /* ---- Brand colour picker ---- */
    .brand-opt {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 8px 13px 8px 10px;
      border-radius: 14px;
      background: var(--fb-surface);
      border: 1.5px solid var(--fb-line);
      cursor: pointer;
      text-align: left;
      transition:
        border-color 0.15s ease,
        background 0.15s ease,
        transform 0.15s ease;
    }
    .brand-opt:hover {
      transform: translateY(-1px);
      border-color: var(--fb-primary-bright);
    }
    .brand-opt.sel {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
    .brand-opt:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .brand-opt .dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      flex-shrink: 0;
      /* Reads the swatch's own theme-* vars, not the active theme's. */
      background: linear-gradient(
        135deg,
        rgb(var(--fb-primary-rgb)),
        rgb(var(--fb-primary-deep-rgb))
      );
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    }
    .brand-opt.sel .dot {
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.08),
        0 0 0 2px var(--fb-surface),
        0 0 0 4px rgb(var(--fb-primary-rgb) / 0.5);
    }
  `,
})
export class Settings {
  protected readonly theme = inject(ThemeService);

  protected noop(el?: EventTarget): void {
    // Demo toggles (push/email) — persistence hook goes here.
    void el;
  }
}
