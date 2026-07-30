import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The standard shell for every in-app page: a heading block (title + description,
 * with optional actions on the right) above the page's own content.
 *
 * Every view used to repeat `<h3 class="page-title">` + `<p class="page-subtitle">`
 * — and the ones with header buttons repeated the `.page-header` flex row too. This
 * owns that layout once, so titles, spacing and the wrap behaviour of header
 * actions stay identical everywhere. The title renders as the page's `<h1>`: the
 * shell chrome has no heading of its own, so each view supplies the document's.
 *
 * @example
 * <app-page-wrapper title="My Deliveries" description="Confirm each step." [hasActions]="true">
 *   <div pageActions>
 *     <app-button icon="fa-solid fa-rotate" (clicked)="reload()">Refresh</app-button>
 *   </div>
 *   …page content…
 * </app-page-wrapper>
 */
@Component({
  selector: 'app-page-wrapper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="page-head">
      <div class="page-head-copy">
        <h1 class="page-heading">{{ title() }}</h1>
        @if (description()) {
          <p class="page-desc">{{ description() }}</p>
        }
      </div>

      @if (hasActions()) {
        <div class="page-head-actions"><ng-content select="[pageActions]" /></div>
      }
    </header>

    <ng-content />
  `,
  styles: `
    .page-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
    }
    .page-head-copy {
      min-width: 0;
    }
    .page-heading {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: var(--fb-ink);
    }
    .page-desc {
      margin: 4px 0 0;
      color: var(--fb-muted);
      /* Descriptions are prose — cap the measure so they stay readable on wide
         screens instead of running the full width of the content area. */
      max-width: 68ch;
      text-wrap: pretty;
    }

    /* Buttons keep their own gap; this only decides where the group sits. On a
       narrow screen the flex-wrap above drops it below the copy, full width. */
    .page-head-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      flex-shrink: 0;
    }
  `,
})
export class PageWrapper {
  readonly title = input.required<string>();
  readonly description = input('');
  /** Render the `[pageActions]` slot — header buttons, filters, export links. */
  readonly hasActions = input(false);
}
