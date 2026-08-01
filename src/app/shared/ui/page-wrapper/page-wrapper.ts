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
        <!-- fb-compact-actions is the app-wide opt-in that collapses the buttons
             inside it to their icon on phones — FbButton reacts to it via
             :host-context, so any other action row can use it too. -->
        <div class="page-head-actions fb-compact-actions">
          <ng-content select="[pageActions]" />
        </div>
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
      /* Grows into the space the actions don't need, and min-width:0 lets it
         shrink so a long title wraps instead of pushing the actions off-screen. */
      flex: 1 1 auto;
      min-width: 0;
    }
    /* Heading and description scale with the viewport: the desktop sizes (24px /
       16px) are the clamp ceilings, so wide screens are unchanged and phones get
       a proportionate heading instead of one that eats three lines. */
    .page-heading {
      margin: 0;
      font-size: clamp(18px, 4.4vw, 24px);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: var(--fb-ink);
      text-wrap: balance;
    }
    .page-desc {
      margin: 4px 0 0;
      font-size: clamp(13px, 3.4vw, 16px);
      line-height: 1.55;
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

    /* Phones: keep the actions on the title's line rather than letting them wrap
       below it, which pushed the page content down by a whole button row. They
       fit because fb-compact-actions collapses each button to its icon. */
    @media (max-width: 640px) {
      .page-head {
        flex-wrap: nowrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 18px;
      }
      .page-head-actions {
        flex-wrap: nowrap;
        gap: 6px;
      }
    }
  `,
})
export class PageWrapper {
  readonly title = input.required<string>();
  readonly description = input('');
  /** Render the `[pageActions]` slot — header buttons, filters, export links. */
  readonly hasActions = input(false);
}
