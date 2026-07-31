import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService, OtpResult } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbButton } from "@shared/ui/button/button";

@Component({
  selector: 'app-otp',
  imports: [ReactiveFormsModule, FbButton, FbAutofocus],
  templateUrl: './otp.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Otp {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly pendingMobile = this.auth.pendingMobile;
  protected readonly verifying = signal(false);
  protected readonly resending = signal(false);
  protected readonly otp = new FormArray(
    Array.from({ length: 6 }, () => new FormControl('', { nonNullable: true })),
  );

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  constructor() {
    // Guard: reaching OTP without a staged number sends the user back to login.
    if (!this.auth.pendingMobile()) {
      this.router.navigate([APP_ROUTES.login]);
    }
  }

  protected onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');

    if (digits.length > 1) {
      // Pasted / multi-char: spread the digits across the boxes from here.
      this.fillFrom(index, digits);
    } else {
      this.otp.at(index).setValue(digits);
      input.value = digits;
      if (digits && index < 5) {
        this.boxes()[index + 1]?.nativeElement.focus();
      }
    }

    // All six entered → submit automatically.
    if (this.isComplete()) {
      this.verify();
    }
  }

  protected resendOtp(): void {
    if (this.resending()) {
      return;
    }
    this.resending.set(true);
    this.auth.sendOtp(this.auth.pendingMobile(), this.auth.otpContext()).subscribe({
      next: () => {
        this.resending.set(false);
        this.resetBoxes();
        this.toast.show('fa-solid fa-paper-plane', 'A new code has been sent');
      },
      error: (err: Error) => {
        this.resending.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not resend the code');
      },
    });
  }

  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (!digits) {
      return;
    }
    event.preventDefault();
    this.fillFrom(0, digits);
    if (this.isComplete()) {
      this.verify();
    }
  }

  protected onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.otp.at(index).value && index > 0) {
      this.boxes()[index - 1]?.nativeElement.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.isComplete()) {
        this.verify();
      } else {
        this.toast.show('fa-solid fa-triangle-exclamation', 'Please enter all 6 digits');
      }
    }
  }

  protected verify(): void {
    if (this.verifying() || !this.isComplete()) {
      return;
    }
    this.verifying.set(true);
    const code = this.otp.value.join('');
    this.auth.verifyOtp(code).subscribe({
      next: (result) => {
        this.verifying.set(false);
        this.handleResult(result);
      },
      error: (err: Error) => {
        this.verifying.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not verify the OTP');
        this.resetBoxes();
      },
    });
  }

  /** True when all six boxes hold a digit. */
  private isComplete(): boolean {
    return this.otp.value.every((v) => !!v) && this.otp.value.join('').length === 6;
  }

  private fillFrom(start: number, digits: string): void {
    const boxes = this.boxes();
    let i = start;
    for (const ch of digits) {
      if (i > 5) {
        break;
      }
      this.otp.at(i).setValue(ch);
      const box = boxes[i]?.nativeElement;
      if (box) {
        box.value = ch;
      }
      i++;
    }
    boxes[Math.min(i, 5)]?.nativeElement.focus();
  }

  private resetBoxes(): void {
    this.otp.controls.forEach((c) => c.setValue(''));
    this.boxes().forEach((b) => (b.nativeElement.value = ''));
    this.boxes()[0]?.nativeElement.focus();
  }

  private handleResult(result: OtpResult): void {
    if (result === 'invalid') {
      this.toast.show('fa-solid fa-triangle-exclamation', 'Incorrect OTP. Please try again.');
      this.resetBoxes();
      return;
    }

    if (result === 'register-verified') {
      this.toast.show('fa-solid fa-mobile-screen-button', 'Mobile verified successfully');
      this.router.navigate([APP_ROUTES.register]);
      return;
    }

    if (result === 'existing') {
      const name = this.auth.currentUser()?.name ?? 'back';
      this.toast.show('fa-solid fa-circle-check', `Welcome back, ${name}!`);
      this.router.navigate([APP_ROUTES.app]);
      return;
    }

    // New number — continue to registration.
    this.toast.show('fa-solid fa-circle-info', "New number — let's set up your account");
    this.router.navigate([APP_ROUTES.register]);
  }

  protected back(): void {
    // Verifying mid-registration → return to the wizard rather than login.
    const target = this.auth.otpContext() === 'register' ? APP_ROUTES.register : APP_ROUTES.login;
    this.router.navigate([target]);
  }
}
