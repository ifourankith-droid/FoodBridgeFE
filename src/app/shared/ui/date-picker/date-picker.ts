import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  ElementRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ClockService } from '@core/services/clock.service';
import { FbPopoverMenu, FbPopoverPanel } from '@shared/ui/popover-menu/popover-menu';
import {
  clampToRange,
  DatePickerMode,
  formatDisplay,
  formatLocal,
  isDayDisabled,
  isMonthDisabled,
  isSameDay,
  monthGrid,
  monthLabels,
  parseLocal,
  roundUpToStep,
  weekdayLabels,
  withTime,
} from '@shared/util/date-value';

let uid = 0;

/**
 * Scrolls this element's currently-selected cell (`.is-sel`) into view once,
 * after it first renders. The time columns live inside the picker's `fbPanel`
 * template — stamped by {@link FbPopoverMenu} into a separate view — so the
 * component's own `viewChild` can't reach them; this runs in the template's own
 * context instead, which works wherever the panel is mounted.
 */
@Directive({ selector: '[fbScrollActiveIntoView]' })
export class FbScrollActiveIntoView {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      el.nativeElement.querySelector('.is-sel')?.scrollIntoView({ block: 'center' });
    });
  }
}

const PLACEHOLDERS: Record<DatePickerMode, string> = {
  date: 'Select date',
  time: 'Select time',
  datetime: 'Select date & time',
};

const TRIGGER_ICONS: Record<DatePickerMode, string> = {
  date: 'fa-regular fa-calendar',
  time: 'fa-regular fa-clock',
  datetime: 'fa-regular fa-calendar-check',
};

interface HourOption {
  value: number;
  label: string;
  disabled: boolean;
}

/**
 * Date / time / date-and-time picker with a real calendar and time columns,
 * instead of the browser's `datetime-local` widget (which looks different in
 * every browser and can't be themed).
 *
 * The control value uses the SAME string format as the native input it
 * replaces — `YYYY-MM-DD`, `HH:mm`, or `YYYY-MM-DDTHH:mm`, all local wall-clock
 * — so it swaps in without touching the surrounding form or its submit
 * mapping. `min`/`max` take the same format.
 *
 * @example
 * <app-date-picker mode="datetime" label="Pickup Deadline"
 *                  formControlName="pickupDeadline" [min]="nowValue" />
 * <app-date-picker mode="date" label="Date of birth" [max]="today" [clearable]="true" />
 */
@Component({
  selector: 'app-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FbPopoverMenu, FbPopoverPanel, FbScrollActiveIntoView],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FbDatePicker), multi: true },
  ],
  template: `
    @if (label()) {
      <label class="small-label mb-2 block" [attr.for]="id">
        {{ label() }}@if (required()) {<span class="text-red-500"> *</span>}
      </label>
    }

    <app-popover-menu
      [open]="open()"
      (openChange)="onPanelOpenChange($event)"
      align="start"
      [ariaLabel]="label() || resolvedPlaceholder()"
      [estimatedHeight]="420"
    >
      <button
        #trigger
        fbTrigger
        type="button"
        [id]="id"
        class="fb-trigger"
        [class.invalid]="!!error()"
        [class.is-open]="open()"
        [class.is-placeholder]="!selected()"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="dialog"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
        (blur)="onTouched()"
      >
        <i [class]="triggerIcon()" class="fb-trigger-lead" aria-hidden="true"></i>
        <span class="fb-trigger-text">{{ displayText() || resolvedPlaceholder() }}</span>
        @if (clearable() && selected() && !disabled()) {
          <span class="fb-trigger-clear" role="button" tabindex="-1" aria-label="Clear" (click)="clear($event)">
            <i class="fa-solid fa-xmark"></i>
          </span>
        }
        <i class="fa-solid fa-chevron-down fb-trigger-chevron" aria-hidden="true"></i>
      </button>

      <ng-template fbPanel>
        <div class="panel">
          <div class="panes">
            @if (mode() !== 'time') {
              <div class="cal">
                <div class="cal-head">
                  <button
                    type="button"
                    class="nav"
                    aria-label="Previous month"
                    [disabled]="prevMonthDisabled()"
                    (click)="stepMonth(-1)"
                  >
                    <i class="fa-solid fa-chevron-left"></i>
                  </button>
                  <button
                    type="button"
                    class="cal-title"
                    [attr.aria-expanded]="view() === 'months'"
                    (click)="toggleView()"
                  >
                    {{ monthName() }} {{ viewYear() }}
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="nav"
                    aria-label="Next month"
                    [disabled]="nextMonthDisabled()"
                    (click)="stepMonth(1)"
                  >
                    <i class="fa-solid fa-chevron-right"></i>
                  </button>
                </div>

                @if (view() === 'days') {
                  <div class="dow">
                    @for (d of weekdays(); track d) {
                      <span>{{ d }}</span>
                    }
                  </div>
                  <div class="grid" role="grid">
                    @for (cell of cells(); track cell.key) {
                      <button
                        type="button"
                        class="cell day"
                        [class.is-outside]="cell.outside"
                        [class.is-today]="cell.today"
                        [class.is-sel]="cell.selected"
                        [disabled]="cell.disabled"
                        [attr.aria-current]="cell.today ? 'date' : null"
                        [attr.aria-pressed]="cell.selected"
                        [attr.aria-label]="cell.label"
                        (click)="selectDay(cell.date)"
                      >
                        {{ cell.day }}
                      </button>
                    }
                  </div>
                } @else {
                  <div class="year-nav">
                    <button type="button" class="nav" aria-label="Previous year" (click)="stepYear(-1)">
                      <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <span class="year-label">{{ viewYear() }}</span>
                    <button type="button" class="nav" aria-label="Next year" (click)="stepYear(1)">
                      <i class="fa-solid fa-chevron-right"></i>
                    </button>
                  </div>
                  <div class="months">
                    @for (m of months; track m.index) {
                      <button
                        type="button"
                        class="cell month"
                        [class.is-sel]="m.index === viewMonth()"
                        [disabled]="monthDisabled(m.index)"
                        (click)="pickMonth(m.index)"
                      >
                        {{ m.label }}
                      </button>
                    }
                  </div>
                }
              </div>
            }

            @if (mode() !== 'date') {
              <div class="time">
                <div class="time-head">Time</div>
                <div class="cols">
                  <div fbScrollActiveIntoView class="col" role="listbox" aria-label="Hour">
                    @for (h of hourOptions(); track h.value) {
                      <button
                        type="button"
                        class="cell slot"
                        role="option"
                        [class.is-sel]="h.value === activeHour()"
                        [attr.aria-selected]="h.value === activeHour()"
                        [disabled]="h.disabled"
                        (click)="setHour(h.value)"
                      >
                        {{ h.label }}
                      </button>
                    }
                  </div>
                  <div fbScrollActiveIntoView class="col" role="listbox" aria-label="Minute">
                    @for (m of minuteOptions(); track m.value) {
                      <button
                        type="button"
                        class="cell slot"
                        role="option"
                        [class.is-sel]="m.value === activeMinute()"
                        [attr.aria-selected]="m.value === activeMinute()"
                        [disabled]="m.disabled"
                        (click)="setMinute(m.value)"
                      >
                        {{ m.label }}
                      </button>
                    }
                  </div>
                  @if (use12Hour()) {
                    <div class="col is-narrow" role="listbox" aria-label="AM or PM">
                      @for (p of meridiems; track p) {
                        <button
                          type="button"
                          class="cell slot"
                          role="option"
                          [class.is-sel]="p === meridiem()"
                          [attr.aria-selected]="p === meridiem()"
                          [disabled]="meridiemDisabled(p)"
                          (click)="setMeridiem(p)"
                        >
                          {{ p.toUpperCase() }}
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <div class="foot">
            @if (clearable()) {
              <button type="button" class="foot-btn" (click)="clearAndClose()">Clear</button>
            }
            <span class="spacer"></span>
            <button type="button" class="foot-btn" [disabled]="shortcutDisabled()" (click)="selectNow()">
              {{ mode() === 'date' ? 'Today' : 'Now' }}
            </button>
            <button type="button" class="foot-btn is-primary" (click)="close(true)">Done</button>
          </div>
        </div>
      </ng-template>
    </app-popover-menu>

    @if (error()) {
      <p class="fb-msg error">{{ error() }}</p>
    } @else if (hint()) {
      <p class="fb-msg hint">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    /* Trigger chrome comes from .fb-trigger in styles.scss and the panel's frame
       from <app-popover-menu> — only the picker-specific bits live here. */
    .panel {
      width: max-content;
      max-width: calc(100vw - 24px);
    }
    /* Calendar and time sit side by side, and stack when the field is narrow
       or the viewport can't take both. */
    .panes {
      display: flex;
      flex-wrap: wrap;
    }

    /* At <=640px the picker renders inside the <app-popover-menu> mobile modal.
       Fill the modal width and stack the calendar over the time, so nothing
       overflows sideways and the panel fits without its own scrollbars. */
    @media (max-width: 640px) {
      .panel {
        width: 100%;
        max-width: none;
      }
      .panes {
        flex-direction: column;
      }
      /* Full width, but capped and centred so the cells don't blow up (which
         would make the calendar tall enough to force a modal scroll). */
      .cal {
        width: 100%;
        max-width: 320px;
        margin-inline: auto;
        box-sizing: border-box;
      }
      /* Stacked: match the calendar's width and move the divider to the top. */
      .time {
        width: 100%;
        max-width: 320px;
        margin-inline: auto;
        border-left: 0;
        border-top: 1px solid var(--fb-line);
      }
      /* Hour / minute spread to fill the row; the AM·PM column stays compact.
         A shorter scroll window keeps the whole modal on screen. */
      .cols {
        gap: 8px;
      }
      .col {
        flex: 1;
        width: auto;
        max-height: 150px;
      }
      .col.is-narrow {
        flex: 0 0 auto;
        width: 58px;
      }
    }

    /* ---- Calendar ---- */
    .cal {
      padding: 12px;
      width: 262px;
    }
    .cal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 8px;
    }
    /* Outlined controls: month/year arrows and the footer actions. */
    .nav,
    .foot-btn {
      border: 1px solid var(--fb-line);
      border-radius: 9px;
      background: var(--fb-surface);
      color: var(--fb-ink);
      font: inherit;
      cursor: pointer;
    }
    .nav:hover:not(:disabled),
    .foot-btn:hover:not(:disabled) {
      background: var(--fb-primary-soft);
      border-color: var(--fb-primary);
      color: var(--fb-primary-deep);
    }
    .nav:disabled,
    .foot-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .nav {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }
    .cal-title {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 10px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--fb-ink);
      font: inherit;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
    }
    .cal-title i {
      font-size: 9px;
      color: var(--fb-muted);
    }
    .cal-title:hover {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }

    .dow,
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    .dow {
      margin-bottom: 4px;
    }
    .dow span {
      text-align: center;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--fb-muted);
      padding: 4px 0;
    }
    /* Every pickable thing in the panel — a day, a month, a time slot — is the
       same button: transparent until hovered, brand fill once chosen. */
    .cell {
      border: 1px solid transparent;
      border-radius: 9px;
      background: transparent;
      color: var(--fb-ink);
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
    }
    .cell:hover:not(:disabled) {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .cell:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .cell.is-sel {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
      font-weight: 700;
      opacity: 1;
    }
    .cell:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .day {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .day.is-outside {
      color: var(--fb-muted);
      opacity: 0.55;
    }
    /* Today is a ring, selection is a fill — so "today" stays visible even
       when another day is selected. */
    .day.is-today {
      border-color: var(--fb-primary);
      font-weight: 700;
    }

    .year-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin-bottom: 8px;
    }
    .year-label {
      font-size: 13.5px;
      font-weight: 700;
      min-width: 46px;
      text-align: center;
    }
    .months {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .month {
      padding: 11px 4px;
      border-radius: 10px;
    }

    /* ---- Time columns ---- */
    .time {
      padding: 12px;
      border-left: 1px solid var(--fb-line);
      flex: 1;
      min-width: 150px;
    }
    .time-head {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--fb-muted);
      margin-bottom: 7px;
    }
    .cols {
      display: flex;
      gap: 6px;
    }
    .col {
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 52px;
      max-height: 196px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    .col.is-narrow {
      width: 46px;
    }
    .slot {
      flex-shrink: 0;
      padding: 7px 0;
      font-variant-numeric: tabular-nums;
    }

    /* ---- Footer ---- */
    .foot {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-top: 1px solid var(--fb-line);
      background: rgb(var(--fb-ink-rgb) / 0.02);
    }
    .spacer {
      flex: 1;
    }
    .foot-btn {
      padding: 6px 13px;
      border-radius: 10px;
      font-size: 12.5px;
      font-weight: 600;
    }
    .foot-btn.is-primary {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
    }
    .foot-btn.is-primary:hover {
      background: var(--fb-primary);
      color: #fff;
    }
  `,
})
export class FbDatePicker implements ControlValueAccessor {
  private readonly clock = inject(ClockService);

  readonly mode = input<DatePickerMode>('date');
  readonly label = input('');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(false);
  readonly clearable = input(false);
  /** Earliest allowed value, in the same format as the control value. */
  readonly min = input<string | null>(null);
  /** Latest allowed value, in the same format as the control value. */
  readonly max = input<string | null>(null);
  /** Minute granularity of the time column. */
  readonly minuteStep = input(5);
  readonly use12Hour = input(true);
  /** 0 = Sunday, 1 = Monday. */
  readonly weekStartsOn = input(0);
  /** Close as soon as a day is picked. Defaults on for `date`, off otherwise. */
  readonly closeOnSelect = input<boolean | null>(null);

  readonly opened = output<void>();
  readonly closed = output<void>();

  protected readonly id = `fb-date-${uid++}`;
  protected readonly meridiems = ['am', 'pm'] as const;

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly view = signal<'days' | 'months'>('days');
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth());

  /**
   * The "now" the time columns fall back to before anything is picked, frozen
   * when the panel opens. Reading the live clock here instead would make the
   * highlighted default hop forward on the 30s tick while the user is looking
   * at it.
   */
  private readonly anchor = signal(new Date());

  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  // Locale-derived and fixed for the session.
  protected readonly months = monthLabels('short').map((label, index) => ({ label, index }));

  // computed, not a plain field: a field initialiser would capture the input's
  // default before a caller-supplied [weekStartsOn] ever arrived, leaving the
  // header row out of step with the grid.
  protected readonly weekdays = computed(() => weekdayLabels(this.weekStartsOn()));

  protected readonly selected = computed(() => parseLocal(this.value(), this.mode()));
  protected readonly minDate = computed(() => parseLocal(this.min(), this.mode()));
  protected readonly maxDate = computed(() => parseLocal(this.max(), this.mode()));

  protected readonly triggerIcon = computed(() => TRIGGER_ICONS[this.mode()]);
  protected readonly resolvedPlaceholder = computed(
    () => this.placeholder() || PLACEHOLDERS[this.mode()],
  );
  protected readonly displayText = computed(() => {
    const date = this.selected();
    return date ? formatDisplay(date, this.mode(), this.use12Hour()) : '';
  });

  protected readonly monthName = computed(
    () => monthLabels('long')[this.viewMonth()] ?? '',
  );

  /**
   * The date the time columns act on: the current value, or a sensible default
   * (now, rounded up to the step and pulled inside min/max) when still empty.
   */
  private readonly working = computed(
    () =>
      this.selected() ??
      clampToRange(
        roundUpToStep(this.anchor(), this.minuteStep()),
        this.minDate(),
        this.maxDate(),
      ),
  );

  protected readonly activeHour = computed(() => this.working().getHours());
  protected readonly activeMinute = computed(() => this.working().getMinutes());
  protected readonly meridiem = computed(() => (this.activeHour() < 12 ? 'am' : 'pm'));

  protected readonly cells = computed(() => {
    const today = new Date(this.clock.now());
    const selected = this.selected();
    const month = this.viewMonth();
    const min = this.minDate();
    const max = this.maxDate();

    return monthGrid(this.viewYear(), month, this.weekStartsOn()).map((date) => ({
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      day: date.getDate(),
      label: date.toLocaleDateString(undefined, { dateStyle: 'full' }),
      outside: date.getMonth() !== month,
      today: isSameDay(date, today),
      selected: isSameDay(date, selected),
      disabled: isDayDisabled(date, min, max),
    }));
  });

  protected readonly hourOptions = computed<HourOption[]>(() => {
    const twelve = this.use12Hour();
    const meridiem = this.meridiem();

    const values = twelve
      ? Array.from({ length: 12 }, (_, i) =>
        meridiem === 'pm' ? (i === 0 ? 12 : i + 12) : i,
      )
      : Array.from({ length: 24 }, (_, i) => i);

    return values.map((value) => ({
      value,
      label: twelve ? `${value % 12 === 0 ? 12 : value % 12}` : `${value}`.padStart(2, '0'),
      disabled: this.hourOutOfRange(value),
    }));
  });

  protected readonly minuteOptions = computed(() => {
    const step = Math.max(1, this.minuteStep());
    const hour = this.activeHour();
    return Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).map((value) => ({
      value,
      label: `${value}`.padStart(2, '0'),
      disabled: this.outOfRange(withTime(this.working(), hour, value)),
    }));
  });

  protected readonly prevMonthDisabled = computed(() =>
    isMonthDisabled(this.viewYear(), this.viewMonth() - 1, this.minDate(), this.maxDate()),
  );
  protected readonly nextMonthDisabled = computed(() =>
    isMonthDisabled(this.viewYear(), this.viewMonth() + 1, this.minDate(), this.maxDate()),
  );

  /** "Now"/"Today" can't be offered when the present falls outside the range. */
  protected readonly shortcutDisabled = computed(() => {
    const now = new Date(this.clock.now());
    return this.mode() === 'date'
      ? isDayDisabled(now, this.minDate(), this.maxDate())
      : this.outOfRange(roundUpToStep(now, this.minuteStep()));
  });

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected toggle(): void {
    this.open() ? this.close() : this.openPanel();
  }

  protected openPanel(): void {
    if (this.disabled() || this.open()) {
      return;
    }

    this.anchor.set(new Date(this.clock.now()));

    // Always open on the month being edited, not wherever we last browsed to.
    const focus = this.selected() ?? this.anchor();
    this.viewYear.set(focus.getFullYear());
    this.viewMonth.set(focus.getMonth());
    this.view.set('days');

    // <app-popover-menu> owns positioning (drop direction) and the small-screen
    // modal; scrolling the selected time into view is handled per-column by
    // fbScrollActiveIntoView, since the panel renders in the wrapper's view.
    this.open.set(true);
    this.opened.emit();
  }

  /** The wrapper closed itself (click-away, Esc, backdrop) → sync our state. */
  protected onPanelOpenChange(open: boolean): void {
    if (!open) {
      this.close();
    }
  }

  protected close(refocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.onTouched();
    this.closed.emit();
    if (refocus) {
      this.triggerBtn()?.nativeElement.focus();
    }
  }

  protected toggleView(): void {
    this.view.update((v) => (v === 'days' ? 'months' : 'days'));
  }

  protected stepMonth(delta: number): void {
    const next = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(next.getFullYear());
    this.viewMonth.set(next.getMonth());
  }

  protected stepYear(delta: number): void {
    this.viewYear.update((y) => y + delta);
  }

  protected pickMonth(month: number): void {
    this.viewMonth.set(month);
    this.view.set('days');
  }

  protected monthDisabled(month: number): boolean {
    return isMonthDisabled(this.viewYear(), month, this.minDate(), this.maxDate());
  }

  protected selectDay(day: Date): void {
    const base = this.working();
    const next = clampToRange(
      withTime(day, base.getHours(), base.getMinutes()),
      this.minDate(),
      this.maxDate(),
    );
    this.commit(next);

    // Keep the calendar on the month the user just picked from, even if the
    // clamp pushed the value into a neighbouring one.
    this.viewYear.set(day.getFullYear());
    this.viewMonth.set(day.getMonth());

    if (this.closeOnSelect() ?? this.mode() === 'date') {
      this.close(true);
    }
  }

  protected setHour(hour: number): void {
    this.commit(withTime(this.working(), hour, this.activeMinute()));
  }

  protected setMinute(minute: number): void {
    this.commit(withTime(this.working(), this.activeHour(), minute));
  }

  protected setMeridiem(meridiem: 'am' | 'pm'): void {
    if (meridiem === this.meridiem()) {
      return;
    }
    const hour = this.activeHour();
    this.commit(withTime(this.working(), hour < 12 ? hour + 12 : hour - 12, this.activeMinute()));
  }

  protected meridiemDisabled(meridiem: 'am' | 'pm'): boolean {
    const offset = meridiem === 'am' ? 0 : 12;
    return Array.from({ length: 12 }, (_, i) => i + offset).every((h) => this.hourOutOfRange(h));
  }

  protected selectNow(): void {
    const now = new Date(this.clock.now());
    const next = clampToRange(
      this.mode() === 'date' ? now : roundUpToStep(now, this.minuteStep()),
      this.minDate(),
      this.maxDate(),
    );
    this.viewYear.set(next.getFullYear());
    this.viewMonth.set(next.getMonth());
    this.view.set('days');
    this.commit(next);
  }

  protected clear(event: Event): void {
    // The ✕ lives inside the trigger button — don't let it reopen the panel.
    event.stopPropagation();
    this.commitEmpty();
    this.close();
  }

  protected clearAndClose(): void {
    this.commitEmpty();
    this.close(true);
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.open() && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openPanel();
    }
  }

  private outOfRange(date: Date): boolean {
    const min = this.minDate();
    const max = this.maxDate();
    return (!!min && date < min) || (!!max && date > max);
  }

  /** An hour is unreachable only when no minute inside it is in range. */
  private hourOutOfRange(hour: number): boolean {
    const day = this.working();
    return this.outOfRange(withTime(day, hour, 59)) && this.outOfRange(withTime(day, hour, 0));
  }

  private commit(date: Date): void {
    const next = formatLocal(date, this.mode());
    this.value.set(next);
    this.onChange(next);
  }

  private commitEmpty(): void {
    this.value.set('');
    this.onChange('');
  }

  // --- ControlValueAccessor ---
  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) {
      this.close();
    }
  }
}
