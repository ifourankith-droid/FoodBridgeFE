import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { formatDisplay } from '@shared/util/date-value';

/** What the claim dialog needs to know about the listing being claimed. */
export interface ClaimDialogData {
  pickupDeadlineUtc: string;
}

/** Later-pickup slots offered, as minutes from now. */
const SLOT_MINUTES = [30, 60, 90, 120, 150, 180];

/**
 * How much runway a listing needs before later slots are worth offering. Under
 * three hours the whole set would be crowded against the deadline, so the field
 * collapses to immediate pickup only rather than tempting a commitment the
 * volunteer can't keep (and the backend would 422 anyway).
 */
const MIN_WINDOW_MINUTES = 180;

/** "In 30 minutes" / "In 1 hour" / "In 1.5 hours". */
function slotLabel(minutes: number): string {
  if (minutes < 60) {
    return `In ${minutes} minutes`;
  }
  const hours = minutes / 60;
  return `In ${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Body of the "Claim this pickup" dialog: when the volunteer expects to collect,
 * chosen from a fixed set of slots rather than typed on a calendar. Every option
 * is one the listing can actually accommodate — no earlier than now, no later
 * than its own deadline.
 *
 * The header, footer buttons and close behaviour come from `DialogService`; this
 * only owns the field and the ISO value the opener reads back off `ref.body()`.
 */
@Component({
  selector: 'app-claim-dialog',
  imports: [ReactiveFormsModule, FbSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-select
      label="When will you pick it up?"
      icon="fa-regular fa-clock"
      [options]="options"
      [formControl]="eta"
      [searchable]="false"
      [hint]="hint"
    />
  `,
})
export class ClaimDialog {
  private readonly data = inject<ClaimDialogData>(DIALOG_DATA);

  private readonly deadline = new Date(this.data.pickupDeadlineUtc);
  /** Frozen at open, so the slot labels and the clock times they name agree. */
  private readonly openedAt = Date.now();
  private readonly minutesLeft = (this.deadline.getTime() - this.openedAt) / 60_000;

  /** Minutes from now; 0 is "right away", which is also the default. */
  protected readonly eta = new FormControl<number>(0, { nonNullable: true });

  protected readonly options: FbSelectOption[] = [
    {
      value: 0,
      label: 'Right away',
      icon: 'fa-solid fa-bolt',
      description: 'Heading there now',
    },
    // The filter is belt-and-braces against the window check above: it keeps any
    // slot that lands on or past the deadline out, whatever the two constants say.
    ...(this.minutesLeft >= MIN_WINDOW_MINUTES
      ? SLOT_MINUTES.filter((m) => m < this.minutesLeft).map((m) => ({
          value: m,
          label: slotLabel(m),
          description: `around ${formatDisplay(new Date(this.openedAt + m * 60_000), 'time', true)}`,
        }))
      : []),
  ];

  protected readonly hint = this.buildHint();

  private buildHint(): string {
    const by = formatDisplay(this.deadline, 'datetime', true);
    return this.options.length > 1
      ? `Pick a slot, or leave it on "Right away". Must be collected before ${by}.`
      : `This listing expires soon, so it can only be claimed for immediate pickup — before ${by}.`;
  }

  /** The chosen ETA as ISO UTC, or undefined for "pick up right away". */
  etaIso(): string | undefined {
    const minutes = this.eta.value;
    // Measured from now rather than from `openedAt`: a dialog left sitting open
    // would otherwise resolve to a time that has already passed.
    return minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : undefined;
  }
}
