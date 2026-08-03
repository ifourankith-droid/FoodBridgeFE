import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbButton } from '@shared/ui/button/button';
import { FbInput } from '@shared/ui/input/input';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, FbInput, FbButton, FbAutofocus],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly mobileError = signal('');

  /** An OTP request is in flight — drives the button spinner and locks the form. */
  protected readonly sending = signal(false);

  protected readonly form = new FormGroup({
    mobile: new FormControl('', { nonNullable: true }),
  });

  protected get mobile(): FormControl<string> {
    return this.form.controls.mobile;
  }

  constructor() {
    // Keep only digits, capped at 10 characters.
    this.mobile.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const cleaned = value.replace(/\D/g, '').slice(0, 10);
      if (cleaned !== value) {
        this.mobile.setValue(cleaned, { emitEvent: false });
      }
      this.mobileError.set('');
    });
  }

  protected sendOtp(): void {
    // Enter submits the form, so a second press before the response lands would
    // send a second OTP — and the send is rate-limited per number, so the retry
    // is what would fail, on a screen that looked idle.
    if (this.sending()) {
      return;
    }
    if (!/^\d{10}$/.test(this.mobile.value)) {
      this.mobileError.set('Enter a valid 10-digit mobile number');
      this.toast.show('fa-solid fa-triangle-exclamation', 'Enter a valid 10-digit mobile number');
      return;
    }
    this.mobileError.set('');
    this.setSending(true);
    this.auth.sendOtp(this.mobile.value, 'login').subscribe({
      next: () => {
        this.toast.show('fa-solid fa-paper-plane', 'OTP sent to your mobile number');
        this.router.navigate([APP_ROUTES.otp]).finally(() => this.setSending(false));
      },
      error: (err: Error) => {
        this.setSending(false);
        this.mobileError.set(err.message || 'Could not send the OTP');
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not send the OTP');
      },
    });
  }

  protected goToRegister(): void {
    if (this.sending()) {
      return;
    }
    this.auth.startRegistration(this.mobile.value);
    this.router.navigate([APP_ROUTES.register]);
  }

  /**
   * Flip the in-flight flag and the field together. Disabling through the control
   * (rather than an input on the field) is what reaches `FbInput`'s
   * `setDisabledState`, so the field greys out and stops accepting keystrokes —
   * editing the number mid-request would leave the screen disagreeing with the
   * number the OTP actually went to.
   */
  private setSending(sending: boolean): void {
    this.sending.set(sending);
    if (sending) {
      this.mobile.disable({ emitEvent: false });
    } else {
      this.mobile.enable({ emitEvent: false });
    }
  }
}
