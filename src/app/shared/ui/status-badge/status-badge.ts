import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ListingStatus, STATUS_ICONS, STATUS_LABELS } from '@core/models/listing.model';

/** Tailwind colour classes per status (light + dark). Literal strings so Tailwind keeps them. */
const STATUS_CLASSES: Record<ListingStatus, string> = {
  pending: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  claimed: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  pickedup: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  confirmed: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
};

const BASE_CLASS =
  'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap';

/**
 * Common listing-status pill — a distinct, theme-aware colour + icon per status.
 * Styled entirely with Tailwind utilities (light + `dark:` variants).
 *
 * @example <app-status-badge [status]="'pickedup'" />
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="badgeClass()">
      <i [class]="icon()" class="text-[0.85em]"></i>{{ STATUS_LABELS[status()] }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<ListingStatus>();
  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly icon = computed(() => STATUS_ICONS[this.status()]);
  protected readonly badgeClass = computed(() => `${BASE_CLASS} ${STATUS_CLASSES[this.status()]}`);
}
