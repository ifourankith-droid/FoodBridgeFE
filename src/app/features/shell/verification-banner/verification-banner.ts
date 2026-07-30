import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import { UserService } from '@core/services/user.service';
import { UserVerification } from '@core/models/verification.model';

/**
 * Shell-wide notice for a volunteer who isn't verified yet.
 *
 * Without it the failure is silent and confusing: a Pending volunteer can browse listings
 * perfectly well, then gets a 422 the moment they press Claim. This states the situation up front,
 * on every page, and links to the one action that resolves it.
 *
 * Renders nothing at all for verified users, other roles, or while loading — so it costs a single
 * request per session and never occupies space it hasn't earned.
 */
@Component({
  selector: 'app-verification-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="vb" [class.is-suspended]="isSuspended()">
        <i class="fa-solid" [class]="isSuspended() ? 'fa-circle-exclamation' : 'fa-hourglass-half'"></i>
        <span class="min-w-0 flex-1">{{ message() }}</span>
        @if (!isSuspended()) {
          <button type="button" class="vb-action" (click)="openVerification()">
            {{ state()?.isReadyForReview ? 'View status' : 'Upload documents' }}
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      .vb {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: var(--fb-orange-soft);
        border-bottom: 1px solid var(--fb-orange);
        color: var(--fb-ink);
        font-size: 0.86rem;
        font-weight: 600;
      }
      .vb > i {
        color: var(--fb-orange);
      }
      .vb.is-suspended {
        background: var(--fb-primary-soft);
        border-bottom-color: var(--fb-primary);
      }
      .vb.is-suspended > i {
        color: var(--fb-primary-deep);
      }
      .vb-action {
        flex: none;
        padding: 4px 12px;
        border-radius: 999px;
        background: var(--fb-surface);
        border: 1px solid var(--fb-line);
        font-size: 0.8rem;
        font-weight: 700;
      }
      .vb-action:hover {
        border-color: var(--fb-primary);
        color: var(--fb-primary-deep);
      }
    `,
  ],
})
export class VerificationBanner {
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly state = signal<UserVerification | null>(null);

  protected readonly isSuspended = computed(() => this.state()?.accountStatus === 'Suspended');

  protected readonly show = computed(() => {
    const v = this.state();
    return !!v && v.accountStatus !== 'Verified';
  });

  protected readonly message = computed(() => {
    const v = this.state();
    if (!v) {
      return '';
    }
    if (v.accountStatus === 'Suspended') {
      return 'Your account is suspended — you cannot take on new deliveries. Please contact support.';
    }
    return v.isReadyForReview
      ? 'Your documents are with an admin for review. You can browse listings, but not claim them yet.'
      : 'Verify your account to start claiming listings — we need your ID and a selfie.';
  });

  constructor() {
    const user = this.auth.currentUser();
    // Only roles that actually require documents can be un-verified in a way the user can act on,
    // so nobody else pays for the request.
    if (user?.id && user.role === 'volunteer') {
      this.users.getVerification(user.id).subscribe({
        next: (v) => this.state.set(v),
        // Silent: a banner that can't load its own state must not become an error the user sees.
        error: () => undefined,
      });
    }
  }

  protected openVerification(): void {
    this.router.navigate([APP_ROUTES.appView('verification')]);
  }
}
