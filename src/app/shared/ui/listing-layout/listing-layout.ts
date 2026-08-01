import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
 * - `[filters]`     — filter controls; rendered under a divider inside the card.
 * - default slot    — the listing cards, projected into the grid.
 * - `[belowGrid]`   — anything after the grid (e.g. an infinite-scroll sentinel).
 * - `[aside]`       — the sticky right column; only rendered when `[hasAside]`.
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
        <div [class]="hasAside() ? 'grid gap-4 xl:grid-cols-3 items-start' : ''">
          <div [class]="hasAside() ? 'xl:col-span-2 min-w-0' : ''">
            @if (hasSummary()) {
              <div class="card-fb p-4 mb-4">
                <ng-content select="[summary]" />
                @if (hasFilters()) {
                  <div class="ll-filters"><ng-content select="[filters]" /></div>
                }
              </div>
            }

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

          @if (hasAside()) {
            <aside class="flex flex-col gap-4 xl:sticky xl:top-[84px]">
              <ng-content select="[aside]" />
            </aside>
          }
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* Filter controls sit under a divider inside the summary card. Both dropdown
       multi-selects and chip buttons drop into this row unchanged. */
    .ll-filters {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--fb-line);
    }
  `,
})
export class ListingLayout {
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
