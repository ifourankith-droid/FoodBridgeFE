import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FbInputFilter } from '@shared/directives/input-filter.directive';

export type FbInputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'password'
  | 'search'
  | 'url'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'textarea'
  | 'select';

/**
 * One choice in a select. Shared by the native `<select>` rendered here and by
 * the searchable `<app-select>`, so a list of options can move between the two
 * without being rewritten — the extras are simply ignored by the native one.
 */
export interface FbSelectOption {
  value: string | number;
  label: string;
  /** Leading icon (Font Awesome class). `<app-select>` only. */
  icon?: string;
  /** Secondary line under the label, also matched when searching. `<app-select>` only. */
  description?: string;
  disabled?: boolean;
}

let uid = 0;

/**
 * App-wide form field. A single config-driven control that renders the right
 * element for its `type` (input / textarea / select), with label, hint, error,
 * optional leading icon and prefix. Implements ControlValueAccessor so it drops
 * straight into reactive forms via `formControlName`.
 *
 * @example
 * <app-input label="Quantity" formControlName="quantity" placeholder="50 servings" />
 * <app-input type="select" label="Meal Type" [options]="meals" formControlName="mealType" />
 * <app-input type="textarea" label="Notes" [rows]="3" formControlName="notes" />
 * <app-input type="tel" label="Mobile" prefix="+91" icon="fa-solid fa-phone" [maxlength]="10" />
 */
@Component({
  selector: 'app-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FbInputFilter],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FbInput), multi: true },
  ],
  template: `
    @if (label()) {
      <label class="small-label mb-2 block" [attr.for]="id">
        {{ label() }}@if (required()) {<span class="text-red-500"> *</span>}
      </label>
    }

    <div
      class="fb-control"
      [class.has-icon]="icon()"
      [class.has-prefix]="prefix() || prefixIcon()"
      [class.has-prefix-lg]="prefix() && prefixIcon()"
    >
      @if (icon()) {
        <i [class]="icon()" class="fb-control-icon"></i>
      }
      @if (prefix() || prefixIcon()) {
        <span class="fb-control-prefix">
          @if (prefixIcon()) {
            <i [class]="prefixIcon()"></i>
          }
          @if (prefix()) {
            <span>{{ prefix() }}</span>
          }
        </span>
      }

      @switch (type()) {
        @case ('textarea') {
          <textarea
            [id]="id"
            class="fb-field"
            [class.invalid]="!!error()"
            [rows]="rows()"
            [placeholder]="placeholder()"
            [disabled]="disabled()"
            [value]="value()"
            (input)="onInput($event)"
            (blur)="onTouched()"
          ></textarea>
        }
        @case ('select') {
          <select
            [id]="id"
            class="fb-field"
            [class.invalid]="!!error()"
            [disabled]="disabled()"
            [value]="value()"
            (change)="onInput($event)"
            (blur)="onTouched()"
          >
            @if (placeholder()) {
              <option value="" disabled>{{ placeholder() }}</option>
            }
            @for (opt of options(); track opt.value) {
              <option [value]="opt.value" [disabled]="!!opt.disabled">{{ opt.label }}</option>
            }
          </select>
        }
        @default {
          <input
            fbInputFilter
            [id]="id"
            class="fb-field"
            [class.invalid]="!!error()"
            [type]="type()"
            [placeholder]="placeholder()"
            [disabled]="disabled()"
            [attr.maxlength]="maxlength()"
            [attr.inputmode]="inputmode()"
            [attr.autocomplete]="autocomplete()"
            [value]="value()"
            (input)="onInput($event)"
            (blur)="onTouched()"
          />
        }
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
    .fb-control {
      position: relative;
    }
    .fb-field {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--fb-line);
      padding: 12px 14px;
      outline: none;
      background: var(--fb-bg);
      color: var(--fb-ink);
      font: inherit;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }
    .fb-field:focus {
      border-color: var(--fb-primary);
      box-shadow: var(--fb-ring);
    }
    .fb-field:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .fb-field.invalid {
      border-color: #ef4444;
    }
    .fb-field.invalid:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
    }
    textarea.fb-field {
      resize: vertical;
      min-height: 84px;
    }
    .has-icon .fb-field {
      padding-left: 40px;
    }
    .fb-control-icon {
      position: absolute;
      left: 14px;
      top: 15px;
      color: var(--fb-muted);
      pointer-events: none;
    }
    .has-prefix .fb-field {
      padding-left: 58px;
    }
    .has-prefix-lg .fb-field {
      padding-left: 74px;
    }
    .fb-control-prefix {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      color: var(--fb-muted);
      font-size: 13px;
      font-weight: 600;
      border-right: 1px solid var(--fb-line);
    }
    .fb-control-prefix i {
      color: var(--fb-primary);
    }
    /* .fb-msg (hint / error line) is global — shared with <app-select> and
       <app-date-picker>. See styles.scss. */
  `,
})
export class FbInput implements ControlValueAccessor {
  readonly type = input<FbInputType>('text');
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly hint = input<string>('');
  readonly prefixIcon = input<string>('');
  readonly error = input<string>('');
  readonly icon = input<string>('');
  readonly prefix = input<string>('');
  readonly required = input(false);
  readonly rows = input(3);
  readonly maxlength = input<number | null>(null);
  readonly inputmode = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);
  readonly options = input<FbSelectOption[]>([]);

  protected readonly id = `fb-input-${uid++}`;
  protected readonly value = signal<string | number>('');
  protected readonly disabled = signal(false);

  private onChange: (value: string | number) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const next = target.value;
    this.value.set(next);
    this.onChange(next);
  }

  // --- ControlValueAccessor ---
  writeValue(value: string | number | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string | number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
