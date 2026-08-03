import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { EmptyState } from '@shared/ui/empty-state/empty-state';

/**
 * Wrapper for a grid of {@link ListingCard}s that owns the shared loading
 * (skeletons) and empty states. Project the cards as content.
 *
 * @example
 * <app-listing-grid [loading]="loading()" [empty]="!rows().length" emptyText="Nothing yet">
 *   @for (l of rows(); track l.id) { <app-listing-card [listing]="l" /> }
 * </app-listing-grid>
 */
@Component({
  selector: 'app-listing-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  templateUrl: './listing-grid.html',
  styleUrl: './listing-grid.scss',
})
export class ListingGrid {
  readonly loading = input(false);
  readonly empty = input(false);
  readonly emptyIcon = input('fa-solid fa-box-open');
  readonly emptyText = input('Nothing here yet');
  /** Optional headline; when set, `emptyText` drops to the supporting line. */
  readonly emptyTitle = input('');
  readonly skeletonCount = input(6);
  /** Responsive column utilities appended to the base `grid gap-4`. */
  readonly gridClass = input('lg:grid-cols-3');

  /**
   * Optional button under the empty message — typically "Clear filters", so a
   * filtered-to-nothing list offers its own way back instead of making the user
   * hunt for the control that emptied it.
   */
  readonly emptyActionLabel = input('');
  readonly emptyActionIcon = input('');
  readonly emptyActionVariant = input<'solid' | 'outline'>('solid');
  readonly emptyAction = output<void>();

  protected readonly gridClasses = computed(() => `grid gap-4 ${this.gridClass()}`);
  protected readonly skeletons = computed(() => Array.from({ length: this.skeletonCount() }));
}
