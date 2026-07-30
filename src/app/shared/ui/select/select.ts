import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FbSelectOption } from '@shared/ui/input/input';

export type FbSelectValue = string | number | null;

let uid = 0;

/** Roughly the panel's tallest rendering — used to decide whether to flip up. */
const PANEL_MAX_HEIGHT = 320;

/**
 * Searchable select (combobox). A type-to-filter replacement for a native
 * `<select>` when the list is long enough that scanning it is work, or when
 * options need an icon or a second line.
 *
 * Shares {@link FbSelectOption} and the label/hint/error chrome with
 * {@link FbInput}, and implements ControlValueAccessor, so it drops into
 * reactive forms exactly like the other fields.
 *
 * @example
 * <app-select label="City" [options]="cities" formControlName="city" />
 * <app-select label="Recipient" [options]="ngos" [clearable]="true"
 *             placeholder="Any NGO" hint="Leave empty to match all" />
 */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FbSelect), multi: true },
  ],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (label()) {
      <label class="small-label mb-2 block" [attr.for]="id">
        {{ label() }}@if (required()) {<span class="text-red-500"> *</span>}
      </label>
    }

    <div class="wrap">
      <button
        #trigger
        type="button"
        role="combobox"
        [id]="id"
        class="fb-trigger"
        [class.invalid]="!!error()"
        [class.is-open]="open()"
        [class.is-placeholder]="!selected()"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? panelId : null"
        aria-haspopup="listbox"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
        (blur)="onTouched()"
      >
        @if (selected(); as opt) {
          @if (opt.icon) {
            <i [class]="opt.icon" class="fb-trigger-lead"></i>
          } @else if (icon()) {
            <i [class]="icon()" class="fb-trigger-lead"></i>
          }
          <span class="fb-trigger-text">{{ opt.label }}</span>
        } @else {
          @if (icon()) {
            <i [class]="icon()" class="fb-trigger-lead"></i>
          }
          <span class="fb-trigger-text">{{ placeholder() }}</span>
        }

        @if (clearable() && selected() && !disabled()) {
          <span
            class="fb-trigger-clear"
            role="button"
            tabindex="-1"
            aria-label="Clear selection"
            (click)="clear($event)"
          >
            <i class="fa-solid fa-xmark"></i>
          </span>
        }
        <i class="fa-solid fa-chevron-down fb-trigger-chevron" aria-hidden="true"></i>
      </button>

      @if (open()) {
        <div class="fb-popover panel" [class.drop-up]="dropUp()">
          @if (searchable()) {
            <div class="search">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input
                #search
                type="text"
                [placeholder]="searchPlaceholder()"
                [value]="query()"
                autocomplete="off"
                [attr.aria-controls]="panelId"
                [attr.aria-activedescendant]="activeOptionId()"
                (input)="onQuery($event)"
                (keydown)="onSearchKeydown($event)"
              />
              @if (query()) {
                <button type="button" class="search-clear" aria-label="Clear search" (click)="resetQuery()">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              }
            </div>
          }

          <ul #list class="list" role="listbox" [id]="panelId" [attr.aria-label]="label() || placeholder()">
            @for (opt of visible(); track opt.value; let i = $index) {
              <li
                class="opt"
                role="option"
                [id]="panelId + '-opt-' + i"
                [class.is-active]="i === activeIndex()"
                [class.is-selected]="opt.value === value()"
                [class.is-disabled]="!!opt.disabled"
                [attr.aria-selected]="opt.value === value()"
                [attr.aria-disabled]="!!opt.disabled"
                (pointerenter)="activeIndex.set(i)"
                (click)="pick(opt)"
              >
                @if (opt.icon) {
                  <i [class]="opt.icon" class="opt-icon" aria-hidden="true"></i>
                }
                <span class="opt-body">
                  <span class="opt-label">{{ opt.label }}</span>
                  @if (opt.description) {
                    <span class="opt-desc">{{ opt.description }}</span>
                  }
                </span>
                @if (opt.value === value()) {
                  <i class="fa-solid fa-check opt-check" aria-hidden="true"></i>
                }
              </li>
            } @empty {
              <li class="empty">
                @if (loading()) {
                  <i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Loading…
                } @else {
                  {{ emptyText() }}
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>

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
    .wrap {
      position: relative;
    }

    /* Trigger chrome and the panel's frame come from .fb-trigger / .fb-popover
       in styles.scss — only the select-specific bits live here. */
    .panel {
      right: 0;
      display: flex;
      flex-direction: column;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--fb-line);
      color: var(--fb-muted);
      font-size: 12px;
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--fb-ink);
      font: inherit;
      font-size: 13.5px;
    }
    .search-clear {
      border: 0;
      background: transparent;
      color: var(--fb-muted);
      cursor: pointer;
      padding: 2px;
      line-height: 1;
    }
    .search-clear:hover {
      color: var(--fb-ink);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 6px;
      max-height: 260px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .opt {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 11px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13.5px;
    }
    /* Hover and keyboard cursor are the SAME state, so pointer and keyboard
       users never see two competing highlights. */
    .opt.is-active {
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .opt.is-selected {
      font-weight: 600;
    }
    .opt.is-disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .opt-icon {
      flex-shrink: 0;
      width: 18px;
      text-align: center;
      color: var(--fb-primary);
    }
    .opt-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .opt-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .opt-desc {
      font-size: 11.5px;
      font-weight: 400;
      color: var(--fb-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .opt-check {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--fb-primary);
    }
    .empty {
      padding: 20px 12px;
      text-align: center;
      font-size: 12.5px;
      color: var(--fb-muted);
    }
  `,
})
export class FbSelect implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly options = input<readonly FbSelectOption[]>([]);
  readonly label = input('');
  readonly placeholder = input('Select…');
  readonly searchPlaceholder = input('Search…');
  readonly emptyText = input('No matches');
  readonly hint = input('');
  readonly error = input('');
  /** Leading icon shown when the selected option doesn't bring its own. */
  readonly icon = input('');
  readonly required = input(false);
  /** Shows an inline ✕ that resets the value to null. */
  readonly clearable = input(false);
  /** Hide the search box for short lists where filtering is just noise. */
  readonly searchable = input(true);
  /** Renders a spinner in place of "no matches" while options are being fetched. */
  readonly loading = input(false);

  readonly opened = output<void>();
  readonly closed = output<void>();

  protected readonly id = `fb-select-${uid++}`;
  protected readonly panelId = `${this.id}-panel`;

  protected readonly value = signal<FbSelectValue>(null);
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly dropUp = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listBox = viewChild<ElementRef<HTMLElement>>('list');
  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly selected = computed(
    () => this.options().find((o) => o.value === this.value()) ?? null,
  );

  /** Options matching the query — label, description and raw value all match. */
  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return this.options();
    }
    return this.options().filter((o) =>
      `${o.label} ${o.description ?? ''} ${o.value}`.toLowerCase().includes(q),
    );
  });

  protected readonly activeOptionId = computed(() =>
    this.open() && this.visible().length ? `${this.panelId}-opt-${this.activeIndex()}` : null,
  );

  private onChange: (value: FbSelectValue) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected toggle(): void {
    this.open() ? this.close() : this.openPanel();
  }

  protected openPanel(): void {
    if (this.disabled() || this.open()) {
      return;
    }

    this.query.set('');
    // Start the cursor on the current selection so Enter is a no-op rather
    // than a surprise change.
    const index = this.visible().findIndex((o) => o.value === this.value());
    this.activeIndex.set(index >= 0 ? index : this.firstEnabledIndex());

    const rect = this.host.nativeElement.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    this.dropUp.set(below < PANEL_MAX_HEIGHT && rect.top > below);

    this.open.set(true);
    this.opened.emit();
    afterNextRender(
      () => {
        this.searchBox()?.nativeElement.focus();
        this.scrollActiveIntoView();
      },
      { injector: this.injector },
    );
  }

  protected close(refocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.query.set('');
    this.onTouched();
    this.closed.emit();
    if (refocus) {
      this.triggerBtn()?.nativeElement.focus();
    }
  }

  protected pick(option: FbSelectOption): void {
    if (option.disabled) {
      return;
    }
    this.commit(option.value);
    this.close(true);
  }

  protected clear(event: Event): void {
    // The ✕ lives inside the trigger button — don't let it reopen the panel.
    event.stopPropagation();
    this.commit(null);
    this.close();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    // The old cursor position means nothing against a new result set.
    this.activeIndex.set(this.firstEnabledIndex());
  }

  protected resetQuery(): void {
    this.query.set('');
    this.activeIndex.set(this.firstEnabledIndex());
    this.searchBox()?.nativeElement.focus();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (this.open()) {
      // With the search box focused the trigger only sees keys when the list
      // isn't searchable; route them through the same handler either way.
      this.onSearchKeydown(event);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openPanel();
    }
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Home':
        event.preventDefault();
        this.activeIndex.set(this.firstEnabledIndex());
        this.scrollActiveIntoView();
        break;
      case 'End':
        event.preventDefault();
        this.activeIndex.set(this.lastEnabledIndex());
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.visible()[this.activeIndex()];
        if (option) {
          this.pick(option);
        }
        break;
      }
      case 'Tab':
        this.close();
        break;
      default:
        break;
    }
  }

  protected onEscape(): void {
    this.close(true);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  /** Step the cursor, skipping disabled options and wrapping at both ends. */
  private move(delta: number): void {
    const options = this.visible();
    if (!options.length) {
      return;
    }

    let next = this.activeIndex();
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) {
        break;
      }
    }
    this.activeIndex.set(next);
    this.scrollActiveIntoView();
  }

  private firstEnabledIndex(): number {
    const index = this.visible().findIndex((o) => !o.disabled);
    return index >= 0 ? index : 0;
  }

  private lastEnabledIndex(): number {
    const options = this.visible();
    for (let i = options.length - 1; i >= 0; i--) {
      if (!options[i]?.disabled) {
        return i;
      }
    }
    return 0;
  }

  private scrollActiveIntoView(): void {
    const item = this.listBox()?.nativeElement.children[this.activeIndex()];
    item?.scrollIntoView({ block: 'nearest' });
  }

  private commit(value: FbSelectValue): void {
    this.value.set(value);
    this.onChange(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: FbSelectValue): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: FbSelectValue) => void): void {
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
