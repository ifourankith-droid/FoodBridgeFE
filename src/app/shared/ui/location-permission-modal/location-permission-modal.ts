import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Body of the dialog {@link AvailabilityService} raises when a user tries to go active
 * but the browser has blocked location access. Explains why location is needed and how
 * to re-enable it; the "Not now" / "Try again" buttons are dialog actions owned by the
 * service, which also auto-retries the moment permission is granted.
 *
 * Opened through `DialogService`, so it is not placed in any template.
 */
@Component({
  selector: 'app-location-permission-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lpm-text">
      We use your current location to match you with the closest donations. Your browser has
      location access blocked — enable it, then try again.
    </p>
    <ol class="lpm-steps">
      <li>
        Open the site permissions from the <i class="fa-solid fa-lock"></i> icon in your browser's
        address bar.
      </li>
      <li>Set <strong>Location</strong> to <strong>Allow</strong>.</li>
      <li>Come back and press <strong>Try again</strong>.</li>
    </ol>
  `,
  styles: `
    .lpm-text {
      font-size: 14px;
      line-height: 1.6;
      color: var(--fb-muted);
      margin-bottom: 14px;
    }
    .lpm-steps {
      font-size: 13px;
      color: var(--fb-text);
      background: var(--fb-bg);
      border: 1px solid var(--fb-line);
      border-radius: 12px;
      padding: 12px 14px 12px 30px;
      margin: 0;
      list-style: decimal;
      display: grid;
      gap: 6px;
    }
    .lpm-steps i {
      color: var(--fb-muted);
    }
  `,
})
export class LocationPermissionModal {}
