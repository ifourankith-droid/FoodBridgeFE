import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fb-auth-wrap">
      <div class="fb-glass w-full max-w-[420px] px-9 py-11 text-center">
        <div class="fb-brand-logo"><i class="fa-solid fa-leaf"></i></div>
        <h3 class="text-2xl font-bold tracking-tight mb-1">{{ title() }}</h3>
        <p class="text-muted text-sm mb-6">
          This screen is scaffolded next — the auth flow already routes here.
        </p>
        <a routerLink="/login" class="btn-fb w-full">
          <i class="fa-solid fa-arrow-left mr-2"></i>Back to login
        </a>
      </div>
    </div>
  `,
})
export class Placeholder {
  readonly title = input('FoodBridge');
}
