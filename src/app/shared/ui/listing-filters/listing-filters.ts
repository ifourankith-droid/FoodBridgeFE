import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { DIET_LABELS } from '@core/models/listing-api.model';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';
import { FbButton } from '@shared/ui/button/button';
import { FbMultiSelect, FbMultiSelectOption } from '@shared/ui/multi-select/multi-select';

/** Every lifecycle status, in the order the Status filter lists them. */
export const ALL_LISTING_STATUSES: readonly ListingStatus[] = [
  'pending',
  'claimed',
  'pickedup',
  'delivered',
  'confirmed',
  'expired',
  'cancelled',
  'rejected',
];

/** Turn a set of statuses into multi-select options (icon + label per value). */
export function statusOptionsFrom(statuses: readonly ListingStatus[]): FbMultiSelectOption[] {
  return statuses.map((s) => ({ value: s, label: STATUS_LABELS[s], icon: STATUS_ICONS[s] }));
}

/** Diet + meal never vary, so their options live here once. */
const DIET_OPTIONS: readonly FbMultiSelectOption[] = [
  { value: 'Veg', label: DIET_LABELS.Veg, icon: 'fa-solid fa-leaf' },
  { value: 'NonVeg', label: DIET_LABELS.NonVeg, icon: 'fa-solid fa-drumstick-bite' },
];
const MEAL_OPTIONS: readonly FbMultiSelectOption[] = [
  { value: 'Breakfast', label: 'Breakfast', icon: 'fa-solid fa-mug-saucer' },
  { value: 'Lunch', label: 'Lunch', icon: 'fa-solid fa-bowl-food' },
  { value: 'Dinner', label: 'Dinner', icon: 'fa-solid fa-utensils' },
  { value: 'Snacks', label: 'Snacks', icon: 'fa-solid fa-cookie-bite' },
];

/**
 * The listing pages' shared filter row: status / diet / meal, each a multi-select
 * dropdown, shown or hidden per page via `[showStatus]`/`[showDiet]`/`[showMeal]`.
 * Every enabled facet is two-way bound (`[(status)]` etc.); an empty array means
 * "no filter". A Clear button appears while anything is selected and resets only
 * the facets this instance shows.
 *
 * Diet and meal options are fixed; status defaults to every lifecycle value but
 * can be narrowed with `[statusOptions]` (e.g. My Deliveries only ever sees the
 * claimed→confirmed span). The host is `display: contents`, so the dropdowns drop
 * straight into the parent's flex row (ListingLayout's `[filters]` slot).
 *
 * @example
 * <app-listing-filters [showStatus]="true" [showDiet]="true" [showMeal]="true"
 *   [status]="statusSel()" (statusChange)="statusSel.set($event)"
 *   [diet]="dietSel()"     (dietChange)="dietSel.set($event)"
 *   [meal]="mealSel()"     (mealChange)="mealSel.set($event)" />
 */
@Component({
  selector: 'app-listing-filters',
  imports: [FbButton, FbMultiSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (showStatus()) {
      <app-multi-select
        icon="fa-solid fa-layer-group"
        allLabel="All statuses"
        [options]="statusOptions()"
        [selected]="status()"
        (selectionChange)="status.set($event)"
      />
    }
    @if (showDiet()) {
      <app-multi-select
        icon="fa-solid fa-leaf"
        allLabel="Any diet"
        [options]="dietOptions"
        [selected]="diet()"
        (selectionChange)="diet.set($event)"
      />
    }
    @if (showMeal()) {
      <app-multi-select
        icon="fa-solid fa-clock"
        allLabel="Any meal"
        [options]="mealOptions"
        [selected]="meal()"
        (selectionChange)="meal.set($event)"
      />
    }
    @if (hasSelection()) {
      <app-button
        type="button"
        [iconOnly]="true"
        variant="outline"
        icon="fa-solid fa-xmark"
        (click)="clear()"
      >
        Clear
      </app-button>
    }
  `,
  styles: `
    app-multi-select {
      flex: 0 1 auto;
      min-width: 170px;
    }
  `,
})
export class ListingFilters {
  // ---- Which facets to show ----
  readonly showStatus = input(false);
  readonly showDiet = input(false);
  readonly showMeal = input(false);

  /** Status choices — defaults to every lifecycle status; narrow per page. */
  readonly statusOptions = input<readonly FbMultiSelectOption[]>(
    statusOptionsFrom(ALL_LISTING_STATUSES),
  );

  // ---- Two-way selections (empty = no filter) ----
  readonly status = model<string[]>([]);
  readonly diet = model<string[]>([]);
  readonly meal = model<string[]>([]);

  protected readonly dietOptions = DIET_OPTIONS;
  protected readonly mealOptions = MEAL_OPTIONS;

  protected readonly hasSelection = computed(
    () => !!(this.status().length || this.diet().length || this.meal().length),
  );

  /** Reset only the facets this instance actually shows. */
  protected clear(): void {
    if (this.showStatus()) {
      this.status.set([]);
    }
    if (this.showDiet()) {
      this.diet.set([]);
    }
    if (this.showMeal()) {
      this.meal.set([]);
    }
  }
}
