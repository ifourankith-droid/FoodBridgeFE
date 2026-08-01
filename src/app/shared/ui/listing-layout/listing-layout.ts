import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

/**
 * The shared shell for every "list of listings" page — My Donations, Nearby
 * Listings and My Deliveries all render the same shape:
 *
 *   page header (title + description + actions)
 *   ├─ a summary card carrying a stat line and the filter controls
 *   ├─ a grid of listing cards (with skeleton loading + empty state)
 *   └─ a sticky right-hand stats aside
 *
 * This owns that layout once. A page supplies its own summary line, filter
 * controls, cards and aside through content slots; the two-column split, the
 * sticky positioning, the summary-card chrome and the {@link ListingGrid}'s
 * loading/empty handling all live here so they stay identical across pages.
 *
 * Slots:
 * - `[pageActions]` — header buttons (forwarded to {@link PageWrapper}).
 * - `[banner]`      — full-width block above the body; pair with `[bodyHidden]`
 *                     to replace the grid entirely (e.g. an offline prompt).
 * - `[summary]`     — the stat line at the top of the summary card.
 * - `[filters]`     — filter controls; rendered under a divider inside the card,
 *                     and folded behind a "Filters" toggle below 640px.
 * - default slot    — the listing cards, projected into the grid.
 * - `[belowGrid]`   — anything after the grid (e.g. an infinite-scroll sentinel).
 * - `[aside]`       — the stats column; only rendered when `[hasAside]`. Sticky
 *                     right column from 1280px up; below that it folds behind an
 *                     "Overview" toggle placed under the summary (not the list).
 *
 * @example
 * <app-listing-layout title="My Donations" description="…" [hasActions]="true"
 *   [hasAside]="true" [loading]="loading()" [empty]="!rows().length"
 *   emptyText="No donations yet" gridClass="lg:grid-cols-2">
 *   <div pageActions>…</div>
 *   <div summary>…</div>
 *   <div filters>…</div>
 *   @for (l of rows(); track l.id) { <app-listing-card … /> }
 *   <div aside>…</div>
 * </app-listing-layout>
 */
@Component({
  selector: 'app-listing-layout',
  imports: [PageWrapper, ListingGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="title()"
      [description]="description()"
      [hasActions]="hasActions()"
    >
      <ng-container pageActions><ng-content select="[pageActions]" /></ng-container>

      <!-- Full-width block above the body. When [bodyHidden] the grid/aside are
           skipped and only this shows — used for the "you're offline" prompt. -->
      <ng-content select="[banner]" />

      @if (!bodyHidden()) {
        <div class="ll-body" [class.ll-body--aside]="hasAside()">
          @if (hasSummary()) {
            <div class="ll-summary card-fb p-4">
              <ng-content select="[summary]" />
              @if (hasFilters()) {
                <!-- Phones fold the filter row behind a "Filters" disclosure:
                     three stacked dropdowns pushed the first card most of a
                     screen down. The toggle and the collapse are both inside a
                     media query, so from 641px up the row is simply always
                     open, exactly as before. -->
                <div class="ll-filter-block">
                  <button
                    type="button"
                    class="ll-filter-toggle"
                    [attr.aria-expanded]="filtersOpen()"
                    [attr.aria-controls]="filtersId"
                    (click)="filtersOpen.set(!filtersOpen())"
                  >
                    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                    <span class="ll-filter-label">Filters</span>
                    <i
                      class="fa-solid fa-chevron-down ll-filter-caret"
                      [class.is-open]="filtersOpen()"
                      aria-hidden="true"
                    ></i>
                  </button>
                  <div
                    class="ll-filters"
                    [id]="filtersId"
                    [class.is-collapsed]="!filtersOpen()"
                  >
                    <ng-content select="[filters]" />
                  </div>
                </div>
              }
            </div>
          }

          @if (hasAside()) {
            <!-- The stats. From 1280px up this is the sticky right-hand column.
                 Below that a two-thirds/one-third split gets cramped, so rather
                 than stacking the stats *under* the whole list (a long scroll
                 away), they fold behind an "Overview" disclosure right under the
                 summary — same pattern as the filters, one tap from the top. -->
            <div class="ll-aside">
              <button
                type="button"
                class="ll-aside-toggle"
                [attr.aria-expanded]="asideOpen()"
                [attr.aria-controls]="asideId"
                (click)="asideOpen.set(!asideOpen())"
              >
                <i class="fa-solid fa-chart-simple" aria-hidden="true"></i>
                <span class="ll-aside-label">Overview</span>
                <i
                  class="fa-solid fa-chevron-down ll-aside-caret"
                  [class.is-open]="asideOpen()"
                  aria-hidden="true"
                ></i>
              </button>
              <div class="ll-aside-content" [id]="asideId" [class.is-collapsed]="!asideOpen()">
                <ng-content select="[aside]" />
              </div>
            </div>
          }

          <div class="ll-grid min-w-0">
            <app-listing-grid
              [loading]="loading()"
              [empty]="empty()"
              [emptyIcon]="emptyIcon()"
              [emptyTitle]="emptyTitle()"
              [emptyText]="emptyText()"
              [skeletonCount]="skeletonCount()"
              [gridClass]="gridClass()"
            >
              <ng-content />
            </app-listing-grid>

            <ng-content select="[belowGrid]" />
          </div>
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* Body layout. With an aside: a sticky right-hand stats column from 1280px
       up; below that a single column that orders summary → stats → grid, so the
       stats sit under the summary (folded) rather than under the whole list. */
    .ll-body {
      display: grid;
      gap: 16px;
    }
    .ll-body--aside {
      grid-template-columns: 1fr;
      grid-template-areas:
        'summary'
        'aside'
        'grid';
    }
    .ll-body--aside .ll-summary {
      grid-area: summary;
    }
    .ll-body--aside .ll-aside {
      grid-area: aside;
    }
    .ll-body--aside .ll-grid {
      grid-area: grid;
    }
    @media (min-width: 1280px) {
      .ll-body--aside {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        grid-template-areas:
          'summary aside'
          'grid    aside';
        align-items: start;
      }
      .ll-body--aside .ll-aside {
        position: sticky;
        top: 84px;
      }
    }

    /* ---- Stats "Overview" disclosure ---- */
    .ll-aside-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    /* From 1280px the stats show outright in the sidebar; the toggle is the
       below-xl affordance only. */
    .ll-aside-toggle {
      display: none;
    }
    @media (max-width: 1279px) {
      /* Summary and Overview read as one panel; the list keeps its gap below. */
      .ll-body--aside {
        gap: 0;
      }
      .ll-body--aside .ll-grid {
        margin-top: 16px;
      }

      /* A gentler corner than the 20px card radius, so a short bar doesn't read
         as a pill. */
      .ll-aside-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--fb-line);
        background: var(--fb-surface);
        color: var(--fb-ink);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .ll-aside-toggle:hover {
        background: var(--fb-primary-soft);
      }

      /* When the summary sits directly above, the two merge into a single panel:
         the summary's bottom edge becomes the seam, and the Overview header hangs
         off it — so the summary content reads as part of the Overview area. */
      .ll-body--aside .ll-summary {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }
      .ll-summary + .ll-aside .ll-aside-toggle {
        margin-top: -1px;
        border-top-color: transparent;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
      }

      .ll-aside-label {
        flex: 1 1 auto;
        text-align: left;
      }
      .ll-aside-caret {
        flex: none;
        font-size: 12px;
        color: var(--fb-muted);
        transition: transform 0.15s ease;
      }
      .ll-aside-caret.is-open {
        transform: rotate(180deg);
      }
      /* Expanded stats sit just under the header, still inside the Overview. */
      .ll-aside-content {
        margin-top: 16px;
      }
      .ll-aside-content.is-collapsed {
        display: none;
      }
    }

    /* The divider lives on the block, not the row, so on a phone it sits above
       the "Filters" toggle rather than between it and the controls. */
    .ll-filter-block {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--fb-line);
    }

    /* Filter controls sit under a divider inside the summary card. Both dropdown
       multi-selects and chip buttons drop into this row unchanged. */
    .ll-filters {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    /* Wide screens show the controls outright — the toggle is phones-only. */
    .ll-filter-toggle {
      display: none;
    }

    @media (max-width: 640px) {
      .ll-filter-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 34px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--fb-ink);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .ll-filter-label {
        flex: 1 1 auto;
        text-align: left;
      }
      .ll-filter-caret {
        flex: none;
        font-size: 12px;
        color: var(--fb-muted);
        transition: transform 0.15s ease;
      }
      .ll-filter-caret.is-open {
        transform: rotate(180deg);
      }
      .ll-filters {
        margin-top: 12px;
      }
      .ll-filters.is-collapsed {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ll-filter-caret,
      .ll-aside-caret,
      .ll-aside-toggle {
        transition: none;
      }
    }
  `,
})
export class ListingLayout {
  /**
   * Whether the `[filters]` row is expanded. Only has any effect below 640px —
   * the rule that hides a collapsed row lives inside a media query — so the
   * default costs desktop nothing while phones start folded.
   */
  protected readonly filtersOpen = signal(false);

  /** Ties the toggle's aria-controls to the row it opens. */
  protected readonly filtersId = `ll-filters-${nextLayoutId++}`;

  /**
   * Whether the stats `[aside]` is expanded. Only matters below 1280px — from
   * there up the stats are the always-visible sticky sidebar (the collapse rule
   * lives inside a media query) — so phones/tablets start folded while wide
   * screens are unaffected.
   */
  protected readonly asideOpen = signal(false);

  /** Ties the "Overview" toggle's aria-controls to the stats it opens. */
  protected readonly asideId = `ll-aside-${nextLayoutId++}`;

  // ---- Page header (forwarded to PageWrapper) ----
  readonly title = input.required<string>();
  readonly description = input('');
  readonly hasActions = input(false);

  // ---- Structure ----
  /** Render the sticky right-hand `[aside]` column and split into two columns. */
  readonly hasAside = input(false);
  /** Render the summary card (stat line + filters). */
  readonly hasSummary = input(true);
  /** Render the `[filters]` row under its divider inside the summary card. */
  readonly hasFilters = input(true);
  /** Skip the whole body (grid + aside), leaving only `[banner]` — e.g. offline. */
  readonly bodyHidden = input(false);

  // ---- Grid (forwarded to ListingGrid) ----
  readonly loading = input(false);
  readonly empty = input(false);
  readonly emptyIcon = input('fa-solid fa-box-open');
  readonly emptyTitle = input('');
  readonly emptyText = input('Nothing here yet');
  readonly skeletonCount = input(6);
  readonly gridClass = input('lg:grid-cols-3');
}

let nextLayoutId = 0;
