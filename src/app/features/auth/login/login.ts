import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { FbInput } from '@shared/ui/input/input';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, FbInput, FbButton],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly mobileError = signal('');

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
    if (!/^\d{10}$/.test(this.mobile.value)) {
      this.mobileError.set('Enter a valid 10-digit mobile number');
      this.toast.show('fa-solid fa-triangle-exclamation', 'Enter a valid 10-digit mobile number');
      return;
    }
    this.mobileError.set('');
    this.auth.sendOtp(this.mobile.value, 'login').subscribe({
      next: () => {
        this.toast.show('fa-solid fa-paper-plane', 'OTP sent to your mobile number');
        this.router.navigate([APP_ROUTES.otp]);
      },
      error: (err: Error) => {
        this.mobileError.set(err.message || 'Could not send the OTP');
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not send the OTP');
      },
    });
  }

  protected goToRegister(): void {
    this.auth.startRegistration(this.mobile.value);
    this.router.navigate([APP_ROUTES.register]);
  }
}
