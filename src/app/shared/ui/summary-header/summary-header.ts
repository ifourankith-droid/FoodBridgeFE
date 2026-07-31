import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The summary strip at the top of the listing pages' summary card: a
 * primary-gradient icon tile beside a bold heading and a smaller subtitle line.
 *
 * The heading and subtitle carry page-specific numbers/markup, so they're
 * projected via the `[heading]` and `[subtitle]` slots. While `[loading]` is
 * true the subtitle is replaced by a spinner + `loadingText`, so a page can show
 * "Loading…" (or "Finding your location…") without wiring that itself.
 *
 * The icon tile always uses the brand primary gradient (`bg-gradient-primary`),
 * so every page's summary reads as one consistent family.
 *
 * @example
 * <app-summary-header icon="fa-solid fa-box-open" [loading]="loading()"
 *   loadingText="Loading your donations…">
 *   <span heading><span class="text-primary-deep text-2xl">{{ n() }}</span> donations</span>
 *   <span subtitle class="text-muted">{{ meals() }} meals · {{ certs() }} certificates</span>
 * </app-summary-header>
 */
@Component({
  selector: 'app-summary-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-3' },
  template: `
    <div class="stat-icon !mb-0 bg-gradient-primary">
      <i [class]="icon()" aria-hidden="true"></i>
    </div>
    <div class="min-w-0">
      <div class="font-bold"><ng-content select="[heading]" /></div>
      <div class="text-xs mt-0.5">
        @if (loading()) {
          <span class="flex items-center gap-1 text-muted">
            <i class="fa-solid fa-spinner fa-spin"></i><span>{{ loadingText() }}</span>
          </span>
        } @else {
          <ng-content select="[subtitle]" />
        }
      </div>
    </div>
  `,
})
export class SummaryHeader {
  /** Font Awesome class for the tile icon. */
  readonly icon = input.required<string>();
  /** While true the subtitle is swapped for a spinner + `loadingText`. */
  readonly loading = input(false);
  readonly loadingText = input('Loading…');
}
