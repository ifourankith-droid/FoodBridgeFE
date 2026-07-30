import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DietType, DIET_LABELS, FreshnessTag, FRESHNESS_LABELS } from '@core/models/listing-api.model';

/** Attribute a pill can represent (extend as needed). */
export type PillType = 'quantity' | 'diet' | 'meal' | 'freshness';

const ICONS: Record<PillType, string> = {
  quantity: 'fa-solid fa-bowl-food',
  diet: 'fa-solid fa-leaf',
  meal: 'fa-solid fa-utensils',
  freshness: 'fa-solid fa-temperature-half',
};

/**
 * Common attribute pill. Pass the attribute `type` and its raw `value`; the pill
 * picks the icon and formats the label (enum → display name). Used by
 * `ListingCard` and listing detail views.
 *
 * @example
 * <app-pill type="quantity" [value]="l.quantityMeals" />   <!-- 🍲 441 meals -->
 * <app-pill type="diet" [value]="l.dietType" />            <!-- 🌿 Veg       -->
 * <app-pill type="freshness" [value]="l.freshnessTag" />   <!-- 🌡 Packaged  -->
 */
@Component({
  selector: 'app-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pill.html',
  styleUrl: './pill.scss',
})
export class Pill {
  readonly type = input.required<PillType>();
  readonly value = input<string | number | null | undefined>(null);
  /** Optional Font Awesome icon override. */
  readonly icon = input('');

  protected readonly iconClass = computed(() => this.icon() || ICONS[this.type()]);

  protected readonly text = computed(() => {
    const v = this.value();
    switch (this.type()) {
      case 'quantity':
        return `${v ?? 0} meals`;
      case 'diet':
        return v ? DIET_LABELS[v as DietType] ?? String(v) : '—';
      case 'meal':
        return v ? String(v) : '—';
      case 'freshness':
        return v ? FRESHNESS_LABELS[v as FreshnessTag] ?? String(v) : '—';
      default:
        return v != null ? String(v) : '—';
    }
  });
}
