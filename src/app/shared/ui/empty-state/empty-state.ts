import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FbButton } from "../button/button";

/**
 * The app's single "no data" surface. Every list, table, grid and dashboard
 * panel routes its empty case through here so they all read the same way.
 *
 * **House style: always pass `icon` + `title` + `text`.** The title is a short
 * statement of what is missing; the text says what will put something there.
 * Every empty in the app is written that way, so they all read alike:
 *
 *   <app-empty-state
 *     icon="fa-solid fa-award"
 *     [title]="'No certificates yet'"
 *     text="Complete a donation and your CSR-ready certificate lands here."
 *     actionLabel="Browse listings"
 *     (action)="goToListings()" />
 *
 * `text` alone still works — it is promoted to the headline so a one-line caller
 * gets a legible message rather than small grey print — but it produces a
 * visibly different, headline-only block, which is why no caller does it:
 *
 *   <app-empty-state text="No listings match this filter" />   <!-- avoid -->
 *
 * Variants:
 *   size="sm"          compact, for table cells and tight panels
 *   tone="positive"    for empties that are GOOD news ("no open disputes")
 *   [bordered]="true"  dashed container, for a standalone empty region
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    class: 'block',
  },
  template: `
    <div class="empty" [class.is-sm]="size() === 'sm'" [class.is-bordered]="bordered()">
      <div class="medallion" [class.positive]="tone() === 'positive'">
        <i [class]="icon()" aria-hidden="true"></i>
      </div>

      <p class="headline">{{ headline() }}</p>

      @if (supporting()) {
        <p class="supporting">{{ supporting() }}</p>
      }

      @if (actionLabel()) {
        <!-- (clicked), not (click): the latter catches the native event bubbling
             out of FbButton's inner button, which works by accident and skips the
             guard in its own onClick. clicked is the declared output. -->
        <app-button
          class="mt-5"
          type="button"
          size="sm"
          [variant]="actionVariant()"
          [icon]="actionIcon()"
          (clicked)="action.emit()"
        >
          {{ actionLabel() }}
        </app-button>
      }
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 44px 20px;
      /* A whisper of brand colour behind the medallion, so the region reads as
         "intentionally empty" rather than "failed to load". */
      background: radial-gradient(
        ellipse 70% 60% at 50% 22%,
        var(--fb-primary-soft),
        transparent 70%
      );
    }
    .empty.is-sm {
      padding: 24px 16px;
      background: none;
    }
    .empty.is-bordered {
      border: 1.5px dashed var(--fb-line);
      border-radius: var(--fb-radius);
    }

    /* ---- Icon medallion ---- */
    .medallion {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      font-size: 23px;
      /* An alpha wash rather than --fb-primary-soft, which is nearly white in
         light mode: on a white card the tile vanished and only the hairline
         ring showed. Alpha composites against whatever surface it lands on —
         card, page or table cell — and stays visible in dark mode too. The
         icon uses --fb-primary-deep, which flips to the bright variant in dark
         mode, so it reads against the wash either way. */
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
      box-shadow: inset 0 0 0 1px rgb(var(--fb-primary-rgb) / 0.2);
    }
    .medallion.positive {
      background: rgb(var(--fb-success-rgb) / 0.13);
      color: var(--fb-success-deep);
      box-shadow: inset 0 0 0 1px rgb(var(--fb-success-rgb) / 0.22);
    }
    .is-sm .medallion {
      width: 42px;
      height: 42px;
      border-radius: 13px;
      font-size: 17px;
      margin-bottom: 11px;
    }

    /* ---- Copy ---- */
    .headline {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      line-height: 1.45;
      color: var(--fb-ink);
      max-width: 42ch;
      text-wrap: balance;
    }
    .is-sm .headline {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--fb-muted);
    }
    .supporting {
      margin: 7px 0 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--fb-muted);
      max-width: 46ch;
      text-wrap: pretty;
    }
    .is-sm .supporting {
      font-size: 12px;
      margin-top: 4px;
    }

    /* ---- Optional call to action ----
       The button itself is <app-button>, so its styling (both variants, the
       hover/focus treatment and the reduced-motion handling) lives there. Only
       the spacing around it belongs to this component. */
    .is-sm app-button {
      margin-top: 0.5rem;
    }
  `,
  imports: [FbButton],
})
export class EmptyState {
  readonly icon = input('fa-solid fa-inbox');

  /** The generic message. Becomes the headline unless `title` is also given. */
  readonly text = input('Nothing here yet');

  /** Optional short headline; when set, `text` drops to the supporting line. */
  readonly title = input('');

  readonly size = input<'sm' | 'md'>('md');

  /** `positive` for empties that are good news (no disputes, nothing overdue). */
  readonly tone = input<'neutral' | 'positive'>('neutral');

  /** Draws a dashed container — for a standalone empty region, not a panel. */
  readonly bordered = input(false);

  readonly actionLabel = input('');
  readonly actionIcon = input('');
  /** `outline` for an undo-style escape hatch (clear filters, show everything). */
  readonly actionVariant = input<'solid' | 'outline'>('solid');
  readonly action = output<void>();

  protected readonly headline = computed(() => this.title() || this.text());

  /** Only shown when `title` is present — otherwise `text` is the headline. */
  protected readonly supporting = computed(() => (this.title() ? this.text() : ''));
}
