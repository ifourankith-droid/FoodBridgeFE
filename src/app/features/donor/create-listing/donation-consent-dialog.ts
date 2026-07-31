import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/**
 * Body of the consent dialog a donor sees after pressing "Post Donation". It
 * restates FoodBridge's food-safety expectations and gates posting behind an
 * explicit tick, so a listing only goes live once the donor has vouched for the
 * quality and accuracy of what they're offering.
 *
 * Opened via {@link DialogService.open}; the footer's "Confirm & Post" action
 * reads {@link confirmed} to stay disabled until the box is checked.
 */
@Component({
  selector: 'app-donation-consent-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="dc-lede">
      Before your donation goes live, confirm it meets these basic standards.
      Volunteers and recipients rely on this — you're responsible for the food you list.
    </p>

    <ul class="dc-list">
      <li>
        <i class="fa-solid fa-circle-check"></i>
        <span>Prepared and stored hygienically, and safe to eat.</span>
      </li>
      <li>
        <i class="fa-solid fa-circle-check"></i>
        <span>Fresh — not spoiled, expired, or already served.</span>
      </li>
      <li>
        <i class="fa-solid fa-circle-check"></i>
        <span>Packaged well enough to be carried safely.</span>
      </li>
      <li>
        <i class="fa-solid fa-circle-check"></i>
        <span>Food type, quantity and pickup deadline are accurate.</span>
      </li>
      <li>
        <i class="fa-solid fa-circle-check"></i>
        <span>Collectable before the pickup deadline you set.</span>
      </li>
    </ul>

    <label class="dc-agree" [class.checked]="confirmed()">
      <input
        type="checkbox"
        [checked]="confirmed()"
        (change)="toggle($event)"
      />
      <span>I confirm this food is safe, fresh, and accurately described.</span>
    </label>
  `,
  styles: `
    .dc-lede {
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.65;
      color: var(--fb-muted);
    }
    .dc-list {
      margin: 0 0 16px;
      padding: 14px 16px;
      list-style: none;
      display: grid;
      gap: 10px;
      background: var(--fb-bg);
      border: 1px solid var(--fb-line);
      border-radius: 12px;
    }
    .dc-list li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--fb-text);
    }
    .dc-list i {
      margin-top: 2px;
      color: var(--fb-success);
      flex-shrink: 0;
    }
    .dc-agree {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border: 1.5px solid var(--fb-line);
      border-radius: 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-text);
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .dc-agree.checked {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .dc-agree input {
      margin-top: 1px;
      width: 17px;
      height: 17px;
      accent-color: var(--fb-primary);
      cursor: pointer;
      flex-shrink: 0;
    }
  `,
})
export class DonationConsentDialog {
  /** Whether the donor has ticked the confirmation box — gates the footer action. */
  readonly confirmed = signal(false);

  protected toggle(event: Event): void {
    this.confirmed.set((event.target as HTMLInputElement).checked);
  }
}
