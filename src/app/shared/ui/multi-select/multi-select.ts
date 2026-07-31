import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/** One option in a {@link FbMultiSelect}. */
export interface FbMultiSelectOption {
  value: string;
  label: string;
  /** Font Awesome class shown before the label (in the trigger and the panel). */
  icon?: string;
}

/**
 * Custom multi-select dropdown with per-option icons and checkboxes.
 *
 * An empty selection means "all" — the trigger reads the `allLabel`, and callers
 * treat "no selection" as "no filter". Controlled via `[selected]` / `(selectionChange)`
 * so the parent owns the state (e.g. a signal it also filters a list with).
 *
 * @example
 * <app-multi-select label="Status" icon="fa-solid fa-layer-group" allLabel="All statuses"
 *   [options]="statusOptions" [selected]="statusSel()" (selectionChange)="statusSel.set($event)" />
 */
@Component({
  selector: 'app-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (label()) {
      <label class="small-label mb-2 block">{{ label() }}</label>
    }

    <div class="ms-wrap">
      <button
        type="button"
        class="ms-trigger"
        [class.is-open]="open()"
        [class.is-active]="selected().length"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
      >
        @if (icon()) {
          <i [class]="icon()" class="ms-lead"></i>
        }
        <span class="ms-text">{{ summary() }}</span>
        @if (selected().length) {
          <span class="ms-badge">{{ selected().length }}</span>
        }
        <i class="fa-solid fa-chevron-down ms-caret" [class.rot]="open()"></i>
      </button>

      @if (open()) {
        <div class="ms-panel" role="listbox" aria-multiselectable="true">
          <!-- Pinned "all/clear" row — stays put while the options below scroll. -->
          <button type="button" class="ms-opt ms-all" (click)="clear()">
            <span class="ms-check" [class.on]="!selected().length">
              <i class="fa-solid fa-check"></i>
            </span>
            <span class="ms-opt-label">{{ allLabel() }}</span>
          </button>
          <div class="ms-sep"></div>
          <div class="ms-options">
            @for (o of options(); track o.value) {
              <button
                type="button"
                class="ms-opt"
                role="option"
                [attr.aria-selected]="isSelected(o.value)"
                (click)="toggleValue(o.value)"
              >
                <span class="ms-check" [class.on]="isSelected(o.value)">
                  <i class="fa-solid fa-check"></i>
                </span>
                @if (o.icon) {
                  <i [class]="o.icon" class="ms-opt-icon"></i>
                }
                <span class="ms-opt-label">{{ o.label }}</span>
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .ms-wrap {
      position: relative;
    }
    .ms-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 42px;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1.5px solid var(--fb-line);
      background: var(--fb-bg);
      color: var(--fb-ink);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease,
        box-shadow 0.15s ease;
    }
    .ms-trigger:hover {
      border-color: var(--fb-muted);
    }
    .ms-trigger.is-open {
      border-color: var(--fb-primary);
      box-shadow: var(--fb-ring);
    }
    .ms-trigger.is-active {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .ms-lead {
      color: var(--fb-muted);
      font-size: 13px;
      flex: none;
    }
    .ms-trigger.is-active .ms-lead {
      color: var(--fb-primary-deep);
    }
    .ms-text {
      flex: 1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ms-badge {
      flex: none;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--fb-primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .ms-caret {
      flex: none;
      font-size: 11px;
      color: var(--fb-muted);
      transition: transform 0.15s ease;
    }
    .ms-caret.rot {
      transform: rotate(180deg);
    }

    .ms-panel {
      position: absolute;
      z-index: 40;
      top: calc(100% + 6px);
      left: 0;
      min-width: 100%;
      width: max-content;
      max-width: 260px;
      overflow: hidden;
      padding: 6px;
      border-radius: 12px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      box-shadow: var(--fb-shadow);
    }
    /* Only the options scroll — the pinned "all" row stays visible. */
    .ms-options {
      max-height: 168px;
      overflow-y: auto;
    }
    .ms-sep {
      height: 1px;
      margin: 4px 2px;
      background: var(--fb-line);
    }
    .ms-opt {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 8px 9px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--fb-ink);
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .ms-opt:hover {
      background: var(--fb-bg);
    }
    .ms-check {
      flex: none;
      width: 18px;
      height: 18px;
      border-radius: 6px;
      border: 1.5px solid var(--fb-line);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      font-size: 10px;
      transition:
        background 0.12s ease,
        border-color 0.12s ease,
        color 0.12s ease;
    }
    .ms-check.on {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
    }
    .ms-opt-icon {
      flex: none;
      width: 16px;
      text-align: center;
      color: var(--fb-muted);
      font-size: 13px;
    }
    .ms-opt-label {
      flex: 1;
      white-space: nowrap;
    }
  `,
})
export class FbMultiSelect {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input<readonly FbMultiSelectOption[]>([]);
  /** Currently selected values (controlled). Empty = "all". */
  readonly selected = input<readonly string[]>([]);
  readonly label = input('');
  /** Leading icon on the trigger. */
  readonly icon = input('');
  /** Trigger text + first panel row when nothing is selected. */
  readonly allLabel = input('All');

  readonly selectionChange = output<string[]>();

  protected readonly open = signal(false);

  protected readonly summary = computed(() => {
    const sel = this.selected();
    if (!sel.length) {
      return this.allLabel();
    }
    if (sel.length === 1) {
      return this.options().find((o) => o.value === sel[0])?.label ?? '1 selected';
    }
    return `${sel.length} selected`;
  });

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected clear(): void {
    this.selectionChange.emit([]);
  }

  protected toggleValue(value: string): void {
    const set = new Set(this.selected());
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    this.selectionChange.emit([...set]);
  }

  protected onDocumentPointerDown(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
