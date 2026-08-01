import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import type { GeoAddress } from '@core/services/geocoding.service';
import { ToastService } from '@core/services/toast.service';
import { RecipientType, RegistrationDraft } from '@core/models/registration.model';
import { Role } from '@core/models/user.model';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbButton } from '@shared/ui/button/button';
import { FbInput } from '@shared/ui/input/input';
import { LocationPicker } from '@shared/ui/location-picker/location-picker';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { SuccessAnim } from '@shared/ui/success-anim/success-anim';
import { environment } from '@env/environment';

interface RoleOption {
  value: Role;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, FbInput, FbButton, SuccessAnim, FbAutofocus, LocationPicker],
  templateUrl: './register.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * Selectable roles. Recipient is filtered out while the role is disabled — the
   * backend refuses a Recipient registration too, so offering the card would only
   * lead the user through four wizard steps to a 422 at the end.
   */
  protected readonly roleOptions: readonly RoleOption[] = (
    [
      { value: 'donor', icon: 'fa-solid fa-utensils', label: 'Donor' },
      { value: 'volunteer', icon: 'fa-solid fa-truck-fast', label: 'Volunteer' },
      { value: 'recipient', icon: 'fa-solid fa-hand-holding-heart', label: 'Recipient' },
    ] as const satisfies readonly RoleOption[]
  ).filter((option) => option.value !== 'recipient' || environment.recipientRoleEnabled);

  protected readonly step = signal(1);
  protected readonly submitting = signal(false);
  protected readonly sendingOtp = signal(false);
  protected readonly role = signal<Role | null>(null);
  protected readonly recipientType = signal<RecipientType>('Individual');
  protected readonly mobileVerified = this.auth.mobileVerified;

  /**
   * True when the mobile was already verified before the wizard started (the user
   * verified via the login flow, then chose to register). In that case step 3 shows
   * the details form with the phone locked — the user only fills in their name —
   * rather than the post-OTP "Mobile verified" success screen.
   */
  protected readonly preVerified = signal(false);

  /** Show the "Mobile verified → Create account" screen only after an in-wizard OTP round-trip. */
  protected readonly showVerifiedScreen = computed(() => this.mobileVerified() && !this.preVerified());

  /** Per-field validation messages shown beneath each input (Angular control state → view). */
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly locationError = signal('');
  /** Fields currently under validation (populated after a submit attempt). */
  private readonly validating = signal<string[]>([]);

  protected err(field: string): string {
    return this.fieldErrors()[field] ?? '';
  }

  /** Location chosen on the map (null until the user picks / uses GPS). */
  protected readonly location = signal<FbLatLng | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    mobile: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{10}$/)],
    }),
    address: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    state: new FormControl('', { nonNullable: true }),
    pincode: new FormControl('', { nonNullable: true }),
    capacity: new FormControl('', { nonNullable: true }),
  });

  protected readonly isRecipient = computed(() => this.role() === 'recipient');

  protected readonly capacityPlaceholder = computed(() =>
    this.recipientType() === 'Organization'
      ? 'Daily serving capacity (meals/day)'
      : 'Household size (number of people)',
  );

  protected readonly finishRoleLabel = computed(() => {
    const role = this.role();
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : '';
  });

  constructor() {
    // Prefill the mobile carried over from login / OTP.
    const pending = this.auth.pendingMobile();
    if (pending) {
      this.form.controls.mobile.setValue(pending);
    }

    // Returning from the OTP round-trip → restore draft and resume.
    const draft = this.auth.registrationDraft();
    if (draft) {
      this.restore(draft);
      // Verified, or reached the details step (address done) → resume at step 3; else step 2.
      const reachedDetailsStep =
        this.auth.mobileVerified() || (draft.latitude !== null && draft.longitude !== null);
      this.step.set(reachedDetailsStep ? 3 : 2);
    }

    // Verified via the login flow (new number) before any details were entered →
    // lock the phone and let the user complete the wizard, filling in just their name.
    if (this.auth.mobileVerified() && !draft?.name?.trim()) {
      this.preVerified.set(true);
      this.form.controls.mobile.disable();
    }

    // Capacity is required only for recipients — toggle its validators with the role.
    effect(() => {
      const capacity = this.form.controls.capacity;
      if (this.isRecipient()) {
        capacity.setValidators([Validators.required, Validators.pattern(/^[1-9]\d*$/)]);
      } else {
        capacity.clearValidators();
      }
      capacity.updateValueAndValidity({ emitEvent: false });
    });

    // Keep the mobile field to digits only, capped at 10.
    this.form.controls.mobile.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      const cleaned = value.replace(/\D/g, '').slice(0, 10);
      if (cleaned !== value) {
        this.form.controls.mobile.setValue(cleaned, { emitEvent: false });
      }
    });

    // Live revalidation: once a step has been submitted, refresh its inline errors as the user edits.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.validating().length) {
        this.refreshErrors(this.validating());
      }
    });
  }

  protected goToLogin(): void {
    this.router.navigate([APP_ROUTES.login]);
  }

  /** Step dots: allow jumping back to any earlier step (not forward). */
  protected stepBack(target: number): void {
    if (target < this.step()) {
      this.step.set(target);
    }
  }

  protected selectRole(role: Role): void {
    this.role.set(role);
  }

  protected setRecipientType(type: RecipientType): void {
    this.recipientType.set(type);
  }

  protected goToStep(step: number): void {
    if (step === 2 && !this.role()) {
      this.toast.show('fa-solid fa-triangle-exclamation', 'Please choose a role first');
      return;
    }
    this.step.set(step);
  }

  /** Step 2 → 3: needs a pinned location (backend requires lat/lng). */
  protected proceedToDetails(): void {
    if (!this.location()) {
      this.locationError.set('Drop a pin on the map to set your location');
      this.toast.show('fa-solid fa-triangle-exclamation', 'Drop a pin on the map to set your location');
      // return;
    }
    this.locationError.set('');
    this.persistDraft();
    this.step.set(3);
  }

  /** Step 3 → OTP: validate name (+ capacity) and mobile, then send the code and verify. */
  protected sendCode(): void {
    const fields = this.isRecipient() ? ['name', 'capacity', 'mobile'] : ['name', 'mobile'];
    this.validating.set(fields);
    fields.forEach((f) => this.form.get(f)?.markAsTouched());
    this.refreshErrors(fields);
    const firstError = this.firstError(fields);
    if (firstError) {
      this.toast.show('fa-solid fa-triangle-exclamation', firstError);
      return;
    }

    const mobile = this.form.controls.mobile.value.trim();
    this.persistDraft();

    // Already verified this exact number → stay on step 4 (create-account state).
    if (this.auth.mobileVerified() && mobile === this.auth.pendingMobile()) {
      return;
    }

    this.sendingOtp.set(true);
    this.auth.sendOtp(mobile, 'register').subscribe({
      next: () => {
        this.sendingOtp.set(false);
        this.toast.show('fa-solid fa-paper-plane', 'Verify your mobile — enter the OTP we just sent');
        this.router.navigate([APP_ROUTES.otp]);
      },
      error: (err: Error) => {
        this.sendingOtp.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not send the OTP');
      },
    });
  }

  /**
   * Pre-verified flow (step 3): mobile is already verified, so validate the
   * details (name + capacity for recipients) and create the account directly —
   * no OTP round-trip needed.
   */
  protected submitDetails(): void {
    const fields = this.isRecipient() ? ['name', 'capacity'] : ['name'];
    this.validating.set(fields);
    fields.forEach((f) => this.form.get(f)?.markAsTouched());
    this.refreshErrors(fields);
    const firstError = this.firstError(fields);
    if (firstError) {
      this.toast.show('fa-solid fa-triangle-exclamation', firstError);
      return;
    }
    this.finish();
  }

  protected onLocationPicked(pos: FbLatLng): void {
    this.location.set(pos);
    this.locationError.set('');
    this.persistDraft();
  }

  /** Address fields filled from the picker's reverse-geocode of the chosen point. */
  protected onAddressResolved(a: GeoAddress): void {
    this.form.patchValue({
      address: a.address || this.form.controls.address.value,
      city: a.city || this.form.controls.city.value,
      state: a.state || this.form.controls.state.value,
      pincode: a.pincode || this.form.controls.pincode.value,
    });
    this.persistDraft();
  }

  protected finish(): void {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.auth.register(this.buildDraft()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.auth.clearRegistrationDraft();
        this.toast.show('fa-solid fa-circle-check', 'Account created — welcome to FoodBridge!');
        this.router.navigate([APP_ROUTES.app]);
      },
      error: (err: Error) => {
        this.submitting.set(false);
        if (this.auth.isSessionExpiredError(err)) {
          this.restartVerification();
          return;
        }
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not create your account');
      },
    });
  }

  /** Recover from an expired registration session: keep the draft, resend OTP, go verify. */
  private restartVerification(): void {
    const mobile = this.form.controls.mobile.value.trim() || this.auth.pendingMobile();
    this.persistDraft();
    this.toast.show('fa-solid fa-clock-rotate-left', 'Your verification expired — please verify your mobile again.');
    this.auth.sendOtp(mobile, 'register').subscribe({
      next: () => this.router.navigate([APP_ROUTES.otp]),
      error: (err: Error) =>
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not resend the code'),
    });
  }

  /** Message for an invalid control, derived from its Angular error state. */
  private controlError(name: string): string {
    const control = this.form.get(name);
    if (!control || control.valid) {
      return '';
    }
    switch (name) {
      case 'name':
        return 'Please enter your name';
      case 'mobile':
        return control.hasError('required')
          ? 'Mobile number is required'
          : 'Enter a valid 10-digit mobile number';
      case 'capacity':
        return this.recipientType() === 'Organization'
          ? 'Enter your daily serving capacity (meals/day)'
          : 'Enter your household size';
      default:
        return 'This field is required';
    }
  }

  private refreshErrors(names: string[]): void {
    const next: Record<string, string> = {};
    for (const name of names) {
      const message = this.controlError(name);
      if (message) {
        next[name] = message;
      }
    }
    this.fieldErrors.set(next);
  }

  private firstError(names: string[]): string {
    for (const name of names) {
      const message = this.controlError(name);
      if (message) {
        return message;
      }
    }
    return '';
  }

  private buildDraft(): RegistrationDraft {
    const { name, mobile, address, city, state, pincode, capacity } = this.form.getRawValue();
    const location = this.location();
    return {
      role: this.role(),
      name,
      mobile,
      address,
      city,
      state,
      pincode,
      recipientType: this.recipientType(),
      capacity,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
    };
  }

  private persistDraft(): void {
    this.auth.saveRegistrationDraft(this.buildDraft());
  }

  private restore(draft: RegistrationDraft): void {
    this.role.set(draft.role);
    this.recipientType.set(draft.recipientType);
    if (draft.latitude !== null && draft.longitude !== null) {
      this.location.set({ lat: draft.latitude, lng: draft.longitude });
    }
    this.form.patchValue({
      name: draft.name,
      mobile: draft.mobile,
      address: draft.address,
      city: draft.city,
      state: draft.state,
      pincode: draft.pincode,
      capacity: draft.capacity,
    });
  }
}
