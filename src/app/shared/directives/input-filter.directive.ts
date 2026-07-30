import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Character kinds the directive can enforce. `''` (default) means "derive from
 * the input's `type` / `inputmode`".
 */
export type FbInputFilterKind = 'numeric' | 'decimal' | 'alpha' | 'alphanumeric' | 'email' | '';

/**
 * Restricts what can be typed/pasted into a text input based on its `type`
 * (or an explicit kind). e.g. `type="tel"`/`type="number"` → digits only.
 *
 * It sanitises on every `input` event (covering typing, paste, drag-drop and
 * mobile IME), preserves the caret, and re-emits `input` so reactive-form /
 * ngModel bindings receive the cleaned value.
 *
 * @example
 * <input type="tel" fbInputFilter />           <!-- digits only (derived)   -->
 * <input fbInputFilter="decimal" />            <!-- digits + one dot         -->
 * <input fbInputFilter="alpha" />              <!-- letters + spaces         -->
 */
@Directive({
  selector: '[fbInputFilter]',
  host: {
    '(input)': 'onInput()',
  },
})
export class FbInputFilter {
  /** Force a specific kind; when empty it is derived from the element's type/inputmode. */
  readonly fbInputFilter = input<FbInputFilterKind>('');

  private readonly host = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private reentrant = false;

  protected onInput(): void {
    if (this.reentrant) {
      return;
    }
    const el = this.host.nativeElement;
    const kind = this.resolveKind(el);
    if (!kind) {
      return;
    }

    const clean = this.sanitize(el.value, kind);
    if (clean === el.value) {
      return;
    }

    const caret = el.selectionStart;
    const removed = el.value.length - clean.length;
    el.value = clean;
    if (caret !== null) {
      const pos = Math.max(0, caret - removed);
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* number inputs don't support setSelectionRange — ignore */
      }
    }

    // Re-emit so the CVA / ngModel picks up the sanitised value (guarded against recursion).
    this.reentrant = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.reentrant = false;
  }

  private resolveKind(el: HTMLInputElement): FbInputFilterKind | null {
    const forced = this.fbInputFilter();
    if (forced) {
      return forced;
    }
    const type = (el.type || 'text').toLowerCase();
    const mode = (el.getAttribute('inputmode') || '').toLowerCase();
    if (type === 'tel' || type === 'number' || mode === 'numeric') {
      return 'numeric';
    }
    if (mode === 'decimal') {
      return 'decimal';
    }
    if (type === 'email') {
      return 'email';
    }
    return null;
  }

  private sanitize(value: string, kind: FbInputFilterKind): string {
    switch (kind) {
      case 'numeric':
        return value.replace(/[^0-9]/g, '');
      case 'decimal': {
        let v = value.replace(/[^0-9.]/g, '');
        const dot = v.indexOf('.');
        if (dot !== -1) {
          // keep only the first dot
          v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
        }
        return v;
      }
      case 'alpha':
        return value.replace(/[^\p{L}\s]/gu, '');
      case 'alphanumeric':
        return value.replace(/[^\p{L}\p{N}\s]/gu, '');
      case 'email':
        return value.replace(/\s/g, '');
      default:
        return value;
    }
  }
}
