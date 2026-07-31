import { afterNextRender, booleanAttribute, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Focusable form controls, excluding ones the user can't type into (hidden,
 * disabled, readonly). Kept deliberately narrow to "editable fields" so a form
 * lands the caret on its first real input rather than an adjacent button.
 */
const FOCUSABLE_SELECTOR =
  'input:not([type=hidden]):not([disabled]):not([readonly]),' +
  'textarea:not([disabled]):not([readonly]),' +
  'select:not([disabled])';

/**
 * Moves keyboard focus to the first editable field on render, so a page/dialog
 * opens ready to type. Place it on a wrapper (`<form>`, a step container, or an
 * `<app-input>`): if the host is itself focusable it takes focus, otherwise the
 * first focusable descendant does.
 *
 * Runs once, after the view paints (`afterNextRender`, browser-only). Because
 * the instance is created when its element enters the DOM, it also works for
 * lazily-shown content — a stepped form's next step, or a toggled add-form —
 * focusing that section as soon as it appears. It never steals focus the user
 * has already placed inside the host.
 *
 * @example
 * <form [formGroup]="form" fbAutofocus> … </form>
 * <app-input fbAutofocus formControlName="reason" />       // dialogs with no <form>
 * <form fbAutofocus [fbAutofocusDisabled]="readonly()"> …  // opt out conditionally
 */
@Directive({
  selector: '[fbAutofocus]',
})
export class FbAutofocus {
  /** When true, skip focusing (e.g. a read-only view of the same form). */
  readonly fbAutofocusDisabled = input(false, { transform: booleanAttribute });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.focusFirst());
  }

  private focusFirst(): void {
    if (this.fbAutofocusDisabled()) {
      return;
    }
    const el = this.host.nativeElement;
    // Respect focus the user (or another autofocus) has already placed inside.
    const active = document.activeElement;
    if (active && active !== el && el.contains(active)) {
      return;
    }
    const target = el.matches?.(FOCUSABLE_SELECTOR)
      ? el
      : el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();
  }
}
