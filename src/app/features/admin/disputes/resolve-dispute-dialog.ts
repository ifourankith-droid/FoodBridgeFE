import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Dispute } from '@core/models/dispute.model';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbInput } from '@shared/ui/input/input';

/**
 * Body of the "Resolve dispute" dialog: the resolution note, plus the dispute's
 * own detail so the admin can read what was reported without leaving the modal.
 *
 * The header, footer buttons and the PATCH itself belong to the opener — this owns
 * the field and exposes `valid()` / `note()` for it to read off `ref.body()`.
 */
@Component({
  selector: 'app-resolve-dispute-dialog',
  imports: [ReactiveFormsModule, FbInput, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quote">
      <div class="small-label mb-1.5">Reported</div>
      <p class="m-0 text-sm leading-relaxed">“{{ dispute.reason }}”</p>
    </div>

    <dl class="ids">
      <dt>Listing</dt>
      <dd>{{ dispute.listingId }}</dd>
      <dt>Raised by</dt>
      <dd>{{ dispute.raisedByUserId }}</dd>
    </dl>

    <app-input
      fbAutofocus
      type="textarea"
      label="Resolution note"
      placeholder="What was found, and what was done about it."
      [formControl]="noteControl"
      [required]="true"
      [rows]="4"
      [maxlength]="1000"
      hint="Stored on the dispute record — write it for whoever reads this later."
      [error]="error()"
    />
  `,
  styles: `
    .quote {
      padding: 11px 13px;
      border-radius: 10px;
      background: var(--fb-primary-soft);
      border: 1px solid var(--fb-line);
      margin-bottom: 14px;
    }
    .ids {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 3px 12px;
      margin: 0 0 16px;
      font-size: 11.5px;
    }
    .ids dt {
      color: var(--fb-muted);
    }
    .ids dd {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
    }
  `,
})
export class ResolveDisputeDialog {
  protected readonly dispute = inject<Dispute>(DIALOG_DATA);

  protected readonly noteControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });

  /** Mirrors the control so `error()` recomputes as they type. */
  private readonly value = toSignal(
    this.noteControl.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))),
    { initialValue: this.noteControl.value },
  );

  /**
   * Only complains once something has been typed and then cleared — the confirm
   * button is already disabled while empty, so an untouched field needs no error.
   */
  protected readonly error = computed(() => {
    const v = this.value();
    return v.length > 0 && !v.trim() ? 'A resolution note is required' : '';
  });

  /** Read by the opener's `disabled` predicate. */
  valid(): boolean {
    return this.noteControl.value.trim().length > 0;
  }

  /** The note to send, trimmed. */
  note(): string {
    return this.noteControl.value.trim();
  }
}
