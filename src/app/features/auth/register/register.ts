import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/config/app-routes';
import { AuthService } from '@core/services/auth.service';
import { GeocodingService } from '@core/services/geocoding.service';
import { GeolocationError, GeolocationService } from '@core/services/geolocation.service';
import { LocationPermissionService } from '@core/services/location-permission.service';
import { ToastService } from '@core/services/toast.service';
import { RecipientType, RegistrationDraft } from '@core/models/registration.model';
import { Role } from '@core/models/user.model';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbButton } from '@shared/ui/button/button';
import { FbInput } from '@shared/ui/input/input';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig } from '@shared/ui/map/fb-map.model';
import { SuccessAnim } from '@shared/ui/success-anim/success-anim';
import { environment } from '@env/environment';

interface RoleOption {
  value: Role;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, DecimalPipe, FbMap, FbInput, FbButton, SuccessAnim, FbAutofocus],
  templateUrl: './register.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly geocoding = inject(GeocodingService);
  private readonly geolocation = inject(GeolocationService);
  private readonly locationPermission = inject(LocationPermissionService);
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

  protected readonly locationConfig = computed<FbMapConfig>(() => ({
    mode: 'picker',
    height: 240,
    zoom: 15,
    initialLocation: this.location() ?? environment.mapDefaultCenter,
    clickToPlace: true,
    placeholderText: 'Confirm your location',
  }));

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
      // Verified, or reached the mobile step (location set) → resume at step 4; else step 2.
      const reachedMobileStep =
        this.auth.mobileVerified() || (draft.latitude !== null && draft.longitude !== null);
      this.step.set(reachedMobileStep ? 4 : 2);
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

    // Entering the page → ask for location permission and pre-fill the address (silent on failure).
    if (!this.location()) {
      this.captureGps(true);
    }
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
    // Leaving step 2 → validate the personal details.
    if (step === 3 && !this.validateStep2()) {
      return;
    }
    this.step.set(step);
  }

  /** Step 3 → 4: needs a pinned location (backend requires lat/lng). */
  protected proceedToMobile(): void {
    if (!this.location()) {
      this.locationError.set('Drop a pin on the map to set your location');
      this.toast.show('fa-solid fa-triangle-exclamation', 'Drop a pin on the map to set your location');
      // return;
    }
    this.locationError.set('');
    this.persistDraft();
    this.step.set(4);
  }

  /** Step 4 → OTP: validate the mobile, then send the code and go to the verify screen. */
  protected sendCode(): void {
    this.validating.set(['mobile']);
    this.form.controls.mobile.markAsTouched();
    this.refreshErrors(['mobile']);
    if (this.form.controls.mobile.invalid) {
      this.toast.show('fa-solid fa-triangle-exclamation', this.controlError('mobile'));
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

  protected onLocationPicked(pos: FbLatLng): void {
    this.location.set(pos);
    this.locationError.set('');
  }

  /**
   * Capture the device location. `auto` (page-load attempt) stays silent on
   * failure; the explicit button press surfaces success/failure toasts.
   */
  protected captureGps(auto = false): void {
    if (!this.geolocation.supported) {
      if (!auto) {
        this.toast.warning('Geolocation is not supported on this device.');
      }
      return;
    }
    // Route through GeolocationService — its desktop-friendly options (no
    // high-accuracy GPS wait, cached fix allowed, generous timeout) resolve
    // reliably where a raw high-accuracy getCurrentPosition would time out.
    this.geolocation.current().subscribe({
      next: (loc) => {
        // Feed the fix to the map so the picker pin recentres on it, then
        // reverse-geocode to fill the address fields.
        this.location.set(loc);
        this.locationError.set('');
        this.fillAddressFromCoords(loc, auto);
      },
      error: (err: GeolocationError) => {
        // The page-load attempt stays silent; only the explicit button surfaces UI.
        if (auto) {
          return;
        }
        if (err.denied) {
          // Blocked → same "Turn on location" modal the go-active flow uses, and
          // re-capture if the user enables it and hits "Try again".
          this.locationPermission.prompt('Turn on location to autofill your address').then((retry) => {
            if (retry) {
              this.captureGps();
            }
          });
        } else {
          this.toast.warning('Could not read your location — drop a pin on the map instead.');
        }
      },
    });
  }

  /** Reverse-geocode the coordinates and pre-fill the address fields (sent to the backend on register). */
  private fillAddressFromCoords(loc: FbLatLng, auto: boolean): void {
    this.geocoding.reverseGeocode(loc.lat, loc.lng).subscribe({
      next: (a) => {
        this.form.patchValue({
          address: a.address || this.form.controls.address.value,
          city: a.city || this.form.controls.city.value,
          state: a.state || this.form.controls.state.value,
          pincode: a.pincode || this.form.controls.pincode.value,
        });
        this.persistDraft();
        this.toast.success('Location captured — address details filled in.');
      },
      error: () => {
        if (!auto) {
          this.toast.success('Location captured from your device.');
        }
      },
    });
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

  /** Validate step 2 controls, surface inline errors + a toast, and report validity. */
  private validateStep2(): boolean {
    const names = this.isRecipient() ? ['name', 'capacity'] : ['name'];
    this.validating.set(names);
    names.forEach((n) => this.form.get(n)?.markAsTouched());
    this.refreshErrors(names);
    const first = this.firstError(names);
    if (first) {
      this.toast.show('fa-solid fa-triangle-exclamation', first);
      return false;
    }
    return true;
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
