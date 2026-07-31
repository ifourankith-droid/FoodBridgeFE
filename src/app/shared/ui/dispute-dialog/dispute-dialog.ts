import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, EMPTY, tap } from 'rxjs';
import { Dispute } from '@core/models/dispute.model';
import { DialogService } from '@core/services/dialog.service';
import { DisputeService } from '@core/services/dispute.service';
import { ToastService } from '@core/services/toast.service';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { FbInput } from '@shared/ui/input/input';

/** What the dialog needs to know about the listing being disputed. */
export interface RaiseDisputeData {
  listingId: string;
  /** Shown in the header so the reporter can see what they're reporting on. */
  listingTitle: string;
}

const MIN_REASON = 10;
const MAX_REASON = 1000;

/** Starting points, so a reporter isn't staring at an empty box. */
const PRESETS: readonly string[] = [
  'Food was not collected before the pickup deadline.',
  'The food quantity did not match the listing.',
  'The food was not in an acceptable condition on arrival.',
  'Nobody was reachable at the pickup or drop-off location.',
];

/**
 * Body of the "Report an issue" dialog — the reason text for `POST /disputes`.
 *
 * Any party on a listing may raise a dispute (the endpoint is `[Authorize]`, not
 * admin-only), so this lives in `shared/ui` and is opened from the donor,
 * volunteer and recipient pages alike via {@link openRaiseDisputeDialog}.
 */
@Component({
  selector: 'app-raise-dispute-dialog',
  imports: [ReactiveFormsModule, FbInput, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">
      Tell us what went wrong. An admin reviews every report and follows up with the
      people involved.
    </p>

    <div class="presets">
      <span class="small-label !mb-0">Common issues</span>
      <div class="preset-row">
        @for (p of PRESETS; track p) {
          <button type="button" class="preset" (click)="use(p)">{{ p }}</button>
        }
      </div>
    </div>

    <app-input
      fbAutofocus
      type="textarea"
      label="What happened?"
      placeholder="Describe the issue in a sentence or two."
      [formControl]="reason"
      [required]="true"
      [rows]="4"
      [maxlength]="MAX_REASON"
      [hint]="hint()"
      [error]="error()"
    />
  `,
  styles: `
    .lede {
      margin: 0 0 14px;
      font-size: 12.5px;
      line-height: 1.65;
      color: var(--fb-muted);
    }
    .presets {
      margin-bottom: 14px;
    }
    .preset-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }
    .preset {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: transparent;
      color: var(--fb-muted);
      font-size: 11.5px;
      line-height: 1.35;
      text-align: left;
      cursor: pointer;
      transition:
        color 0.15s ease,
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .preset:hover {
      color: var(--fb-primary-deep);
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
  `,
})
export class RaiseDisputeDialog {
  protected readonly PRESETS = PRESETS;
  protected readonly MAX_REASON = MAX_REASON;

  private readonly data = inject<RaiseDisputeData>(DIALOG_DATA);

  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.minLength(MIN_REASON),
      Validators.maxLength(MAX_REASON),
    ],
  });

  private readonly value = toSignal(
    this.reason.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))),
    { initialValue: this.reason.value },
  );

  protected readonly hint = computed(() => {
    const left = MAX_REASON - this.value().length;
    return `About ${this.data.listingTitle}. ${left} characters left.`;
  });

  /** Silent until they've typed something too short to be useful. */
  protected readonly error = computed(() => {
    const v = this.value().trim();
    return v.length > 0 && v.length < MIN_REASON
      ? `Please add a little more detail (at least ${MIN_REASON} characters).`
      : '';
  });

  protected use(preset: string): void {
    this.reason.setValue(preset);
  }

  /** Read by the opener's `disabled` predicate. */
  valid(): boolean {
    return this.reason.value.trim().length >= MIN_REASON;
  }

  reasonText(): string {
    return this.reason.value.trim();
  }
}

/**
 * Open "Report an issue" for a listing and POST the dispute.
 *
 * Self-contained on purpose: it resolves `DisputeService` / `ToastService` from the
 * caller's injector, so a page only needs its `DialogService` and the listing —
 * the donor, volunteer and recipient pages all call this the same way.
 *
 * Resolves via `ref.closed` with the created `Dispute`, or `undefined` if dismissed.
 *
 * @example
 * openRaiseDisputeDialog(this.dialog, this.injector, {
 *   listingId: l.id,
 *   listingTitle: l.title,
 * });
 */
export function openRaiseDisputeDialog(
  dialog: DialogService,
  injector: Injector,
  data: RaiseDisputeData,
): DialogRef<Dispute | undefined, RaiseDisputeDialog> {
  const disputes = injector.get(DisputeService);
  const toast = injector.get(ToastService);

  const ref: DialogRef<Dispute | undefined, RaiseDisputeDialog> = dialog.open<
    RaiseDisputeData,
    Dispute | undefined,
    RaiseDisputeDialog
  >({
    header: {
      title: 'Report an issue',
      subtitle: data.listingTitle,
      icon: 'fa-solid fa-triangle-exclamation',
      iconBg: 'rgba(220, 38, 38, 0.12)',
    },
    content: RaiseDisputeDialog,
    data,
    size: 'md',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
      {
        id: 'raise',
        label: 'Submit report',
        icon: 'fa-solid fa-paper-plane',
        variant: 'danger',
        disabled: () => !ref.body()?.valid(),
        handler: (r) =>
          disputes
            .raise({ listingId: data.listingId, reason: r.body()!.reasonText() })
            .pipe(
              tap((created) => r.close(created)),
              // Expected 4xx (not a party on this listing, already disputed) stays
              // in the dialog with the text intact rather than hitting the global
              // error handler.
              catchError((err: Error) => {
                toast.error(err.message || 'Could not submit the report');
                return EMPTY;
              }),
            ),
      },
    ],
  });

  ref.closed.subscribe((created) => {
    if (created) {
      toast.success('Report submitted — an admin will review it');
    }
  });

  return ref;
}
