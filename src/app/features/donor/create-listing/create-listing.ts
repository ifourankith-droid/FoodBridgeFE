import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES, AppNavState } from '@core/config/app-routes';
import { DietType, FreshnessTag, ListingWriteBody, MealType } from '@core/models/listing-api.model';
import { DonorDashboard } from '@core/models/dashboard.model';
import { DashboardService } from '@core/services/dashboard.service';
import { DialogService } from '@core/services/dialog.service';
import { ListingService } from '@core/services/listing.service';
import { PickupAddress, PickupAddressService } from '@core/services/pickup-address.service';
import { ToastService } from '@core/services/toast.service';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { FbButton } from '@shared/ui/button/button';
import { FbDatePicker } from '@shared/ui/date-picker/date-picker';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { ImagePicker } from '@shared/ui/image-picker/image-picker';
import { FbInput, FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { appZonedInputToOffsetIso, appZonedNowInput, utcIsoToAppZonedInput } from '@shared/util/timezone';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { DonationConsentDialog } from './donation-consent-dialog';

@Component({
  selector: 'app-create-listing',
  imports: [ReactiveFormsModule, FbInput, FbSelect, FbDatePicker, FbButton, ImagePicker, PageWrapper, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="editId() ? 'Edit Donation' : 'New Donation'"
      description="Tell volunteers exactly what's available and when."
      [hasActions]="showBack"
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-arrow-left" (clicked)="back()">
          Back
        </app-button>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <form [formGroup]="form" class="card-fb p-5 xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4" fbAutofocus>
          <!-- Pickup address (chosen from the top bar) -->
          <div class="col-span-2">
            <label class="small-label mb-2 block">Pickup Address <span class="text-red-500">*</span></label>
            @if (editId()) {
              <!-- Editing keeps the listing's own stored pickup address. -->
              <div class="addr-banner">
                <i class="fa-solid fa-location-dot text-primary"></i>
                <span class="flex-1 text-sm font-medium truncate">{{ activeAddress()?.label }}</span>
              </div>
            } @else if (pickup.addresses().length) {
              <div class="flex items-stretch gap-2">
                <app-select
                  class="flex-1 min-w-0"
                  [options]="pickupOptions()"
                  [formControl]="pickupCtrl"
                  icon="fa-solid fa-location-dot"
                  placeholder="Choose a pickup address"
                  [searchable]="pickup.addresses().length > 5"
                />
                <button
                  type="button"
                  class="addr-add"
                  title="Add a new pickup address"
                  aria-label="Add a new pickup address"
                  (click)="addAddress()"
                >
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
            } @else {
              <button type="button" class="addr-banner is-empty w-full text-left" (click)="addAddress()">
                <i class="fa-solid fa-circle-plus text-primary"></i>
                <span class="flex-1 text-sm">Add a pickup address on your Profile page</span>
                <i class="fa-solid fa-arrow-right text-muted text-xs"></i>
              </button>
            }
          </div>

          <div class="col-span-2">
            <app-input label="Title" formControlName="title" placeholder="e.g. Surplus Wedding Catering" [required]="true" hint="A short summary volunteers see first." [error]="err('title')" />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <app-input label="Food Type" formControlName="foodType" placeholder="e.g. Mixed Veg Meals" [required]="true" hint="e.g. mixed veg meals, sandwiches, rice & curry." [error]="err('foodType')" />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="small-label mb-2 block">Diet</label>
            <div class="flex gap-2">
              <button
                type="button"
                class="diet-btn veg"
                [class.selected]="form.controls.dietType.value === 'Veg'"
                (click)="form.controls.dietType.setValue('Veg')"
              >
                <i class="fa-solid fa-leaf"></i>Veg
              </button>
              <button
                type="button"
                class="diet-btn nonveg"
                [class.selected]="form.controls.dietType.value === 'NonVeg'"
                (click)="form.controls.dietType.setValue('NonVeg')"
              >
                <i class="fa-solid fa-drumstick-bite"></i>Non-Veg
              </button>
            </div>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <app-select label="Meal Type" [options]="mealOptions" formControlName="mealType" [searchable]="false" />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <app-input type="number" label="Quantity (meals)" formControlName="quantityMeals" placeholder="e.g. 50" [required]="true" hint="Approximate number of meals available." [error]="err('quantityMeals')" />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <app-select label="Freshness" [options]="freshnessOptions" formControlName="freshnessTag" [required]="true" [searchable]="false" hint="How recently the food was prepared or packed." />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <app-date-picker
              mode="datetime"
              label="Pickup Deadline"
              formControlName="pickupDeadline"
              [required]="true"
              [min]="minDeadline"
              [minuteStep]="15"
              hint="Latest time a volunteer can collect it."
              [error]="err('pickupDeadline')"
            />
          </div>
          <div class="col-span-2">
            <app-image-picker
              label="Photo of the food"
              hint="Optional, but listings with a photo get claimed faster."
              placeholder="Click to upload, or drop a photo here"
              [existingUrl]="editImageUrl()"
              (fileChange)="onPhotoPicked($event)"
            />
          </div>
          <div class="col-span-2">
            <app-button type="button" icon="fa-solid fa-paper-plane" [block]="true" [loading]="submitting()" (clicked)="submit()">
              {{ editId() ? 'Update' : 'Post' }} Donation
            </app-button>
          </div>
        </form>

        <div class="flex flex-col gap-4 self-start xl:sticky xl:top-[84px]">
          <!-- Your impact so far -->
          <div class="card-fb p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="stat-icon !mb-0" style="background:linear-gradient(135deg,var(--fb-success),var(--fb-success-deep))"><i class="fa-solid fa-seedling"></i></div>
              <div>
                <div class="font-bold">Your impact so far</div>
                <div class="text-muted text-xs">Every listing counts</div>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div><div class="impact-num">{{ dashboard()?.totalMealsDonated ?? 0 }}</div><div class="text-muted text-[11px]">Meals saved</div></div>
              <div><div class="impact-num">{{ dashboard()?.totalDonations ?? 0 }}</div><div class="text-muted text-[11px]">Donations</div></div>
              <div><div class="impact-num">{{ co2() }}kg</div><div class="text-muted text-[11px]">CO₂ saved</div></div>
            </div>
          </div>

          <!-- Tips -->
          <div class="card-fb p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="stat-icon !mb-0" style="background:linear-gradient(135deg,var(--fb-accent),var(--fb-accent-deep))"><i class="fa-solid fa-lightbulb"></i></div>
              <div class="font-bold">Tips for a great listing</div>
            </div>
            <ul class="text-sm space-y-2 m-0 p-0 list-none">
              <li class="flex gap-2"><i class="fa-solid fa-circle-check mt-1 text-success"></i><span>Add a clear photo so volunteers know what to expect.</span></li>
              <li class="flex gap-2"><i class="fa-solid fa-circle-check mt-1 text-success"></i><span>Give an accurate meal count and a realistic pickup deadline.</span></li>
              <li class="flex gap-2"><i class="fa-solid fa-circle-check mt-1 text-success"></i><span>List fresh food early for faster pickups.</span></li>
            </ul>
          </div>

          <!-- Waiting nearby -->
          <div class="card-fb p-5">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="stat-icon !mb-0" style="background:var(--fb-primary)"><i class="fa-solid fa-hand-holding-heart"></i></div>
                <div class="font-bold">Waiting nearby</div>
              </div>
              <span class="badge-fb bg-primary-soft text-primary-deep">{{ nearbyRecipients().length }} Active</span>
            </div>
            <div class="space-y-2.5">
              @for (r of nearbyRecipients(); track r.id) {
                <div class="flex items-center gap-3">
                  <div class="avatar-circle !w-8 !h-8 !text-xs">{{ r.name.charAt(0) }}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">{{ r.name }}</div>
                    <div class="text-muted text-xs truncate">
                      {{ r.distanceKm.toFixed(1) }} km away{{ r.city ? ' · ' + r.city : '' }}
                    </div>
                  </div>
                  <i class="fa-solid fa-location-dot text-muted text-xs"></i>
                </div>
              } @empty {
                <div class="text-muted text-xs py-1">
                  No recipients nearby yet — choose a pickup address to see who's close.
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </app-page-wrapper>
  `,
  styles: `
    .addr-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--fb-primary-soft);
      border: 1px solid var(--fb-primary);
    }
    .addr-banner.is-empty {
      background: var(--fb-orange-soft);
      border-color: var(--fb-orange);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .addr-banner.is-empty:hover {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
    /* Square "add address" button sitting beside the pickup dropdown. */
    .addr-add {
      flex: none;
      width: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1.5px solid var(--fb-line);
      background: var(--fb-bg);
      color: var(--fb-primary-deep);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
    }
    .addr-add:hover {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
    }
    .impact-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      line-height: 1.1;
    }
    /* ---- Veg / Non-Veg toggle ---- */
    .diet-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex: 1 1 0;
      min-width: 0;
      padding: 10px 8px;
      border-radius: 12px;
      border: 1.5px solid var(--fb-line);
      background: var(--fb-bg);
      font-size: 13px;
      font-weight: 600;
      color: var(--fb-muted);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
    }
    .diet-btn:hover {
      border-color: var(--fb-muted);
    }
    /* Icon carries the diet colour even while unselected. */
    .diet-btn.veg i {
      color: var(--fb-success);
    }
    .diet-btn.nonveg i {
      color: #e04434;
    }
    /* Selected → filled in the diet's colour. */
    .diet-btn.veg.selected {
      border-color: var(--fb-success);
      background: var(--fb-success);
      color: #fff;
    }
    .diet-btn.nonveg.selected {
      border-color: #e04434;
      background: #e04434;
      color: #fff;
    }
    .diet-btn.selected i {
      color: #fff;
    }
  `,
})
export class CreateListing {
  private readonly listingService = inject(ListingService);
  private readonly dashboardService = inject(DashboardService);
  protected readonly pickup = inject(PickupAddressService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /**
   * Back is shown only when the listings page sent us here, which it signals
   * with `state: { from: 'listings' }`. Opening this form from the sidebar item
   * or a deep link carries no such state, and Back would then navigate to a
   * page the user had never visited.
   *
   * Read from `Location.getState()` rather than `Router.getCurrentNavigation()`
   * so a reload of this URL keeps the button — the router persists the state
   * into `history.state`, which survives refresh.
   */
  protected readonly showBack =
    (this.location.getState() as AppNavState | null)?.from === 'listings';

  /** Bound from the `?edit=<id>` query param (withComponentInputBinding). */
  readonly edit = input<string>();
  protected readonly editId = signal<string | null>(null);
  /** Existing photo of the listing being edited — shown as the picker's preview. */
  protected readonly editImageUrl = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly mealOptions: FbSelectOption[] = [
    { value: 'Breakfast', label: 'Breakfast', icon: 'fa-solid fa-mug-saucer' },
    { value: 'Lunch', label: 'Lunch', icon: 'fa-solid fa-bowl-food' },
    { value: 'Dinner', label: 'Dinner', icon: 'fa-solid fa-utensils' },
    { value: 'Snacks', label: 'Snacks', icon: 'fa-solid fa-cookie-bite' },
  ];

  protected readonly freshnessOptions: FbSelectOption[] = [
    { value: 'JustCooked', label: 'Just Cooked', icon: 'fa-solid fa-fire-burner' },
    { value: 'FewHoursOld', label: 'A Few Hours Old', icon: 'fa-regular fa-clock' },
    { value: 'Packaged', label: 'Packaged', icon: 'fa-solid fa-box' },
  ];

  /**
   * A deadline in the past can never be collected, so the picker won't offer
   * one. Fixed at page load rather than ticking — a form left open for a while
   * being a few minutes permissive is harmless, a `min` that moves under the
   * user's cursor is not.
   */
  protected readonly minDeadline = appZonedNowInput();

  private photoFile: File | null = null;
  /** Consolidated donor dashboard — powers both the impact stats and the nearby recipients. */
  protected readonly dashboard = signal<DonorDashboard | null>(null);
  protected readonly co2 = computed(() => Math.round((this.dashboard()?.totalMealsDonated ?? 0) * 0.45));
  /** Real recipients waiting near the chosen pickup address (from the donor dashboard). */
  protected readonly nearbyRecipients = computed(() => this.dashboard()?.nearbyRecipients ?? []);

  /** Pickup address used for the listing — the edited listing's, else the top-bar selection. */
  private readonly editAddress = signal<{ label: string; latitude: number; longitude: number; } | null>(null);
  protected readonly activeAddress = computed(() => this.editAddress() ?? this.pickup.selected());

  /** Dropdown of the donor's saved pickup addresses (create mode), synced with the shared selection. */
  protected readonly pickupCtrl = new FormControl<string | null>(null);
  protected readonly pickupOptions = computed<FbSelectOption[]>(() =>
    this.pickup.addresses().map((a) => ({
      value: a.id,
      label: a.label,
      description: a.address,
      icon: 'fa-solid fa-location-dot',
    })),
  );

  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected err(field: string): string {
    return this.fieldErrors()[field] ?? '';
  }

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    foodType: new FormControl('', { nonNullable: true }),
    dietType: new FormControl<DietType>('Veg', { nonNullable: true }),
    mealType: new FormControl<MealType>('Lunch', { nonNullable: true }),
    quantityMeals: new FormControl('', { nonNullable: true }),
    freshnessTag: new FormControl<FreshnessTag>('JustCooked', { nonNullable: true }),
    pickupDeadline: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Load the donor dashboard (impact stats + nearby recipients). Re-runs when the
    // active pickup address changes, so "Waiting nearby" reflects that location.
    effect(() => {
      const addr = this.activeAddress();
      this.dashboardService.donor(addr?.latitude, addr?.longitude).subscribe({
        next: (d) => this.dashboard.set(d),
        error: () => undefined,
      });
    });

    // Mirror the shared pickup selection into the dropdown (topbar/profile can change it).
    effect(() => {
      const selectedId = this.pickup.selected()?.id ?? null;
      this.pickupCtrl.setValue(selectedId, { emitEvent: false });
    });
    // Choosing an address in the dropdown makes it the active/default pickup address.
    this.pickupCtrl.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (id && id !== this.pickup.selected()?.id) {
        this.pickup.select(id).subscribe();
      }
    });

    effect(() => {
      const id = this.edit();
      if (!id) {
        return;
      }
      this.editId.set(id);
      this.listingService.getById(id).subscribe({
        next: (l) => {
          this.form.patchValue({
            title: l.title,
            foodType: l.foodType,
            dietType: l.dietType ?? 'Veg',
            mealType: l.mealType ?? 'Lunch',
            quantityMeals: String(l.quantityMeals),
            freshnessTag: l.freshnessTag,
            pickupDeadline: this.toLocalInput(l.pickupDeadlineUtc),
          });
          this.editAddress.set({ label: l.pickupAddress, latitude: l.latitude, longitude: l.longitude });
          // Show the listing's existing photo as the picker's preview.
          this.editImageUrl.set(l.images?.[0]?.imageUrl ?? null);
        },
        error: (err: Error) =>
          this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load listing'),
      });
    });
  }

  /** Leave the form without saving and return to the donations list. */
  protected back(): void {
    this.router.navigate([APP_ROUTES.appView('listings')]);
  }

  /** Jump to the Profile page, where pickup addresses are added and managed. */
  protected addAddress(): void {
    this.router.navigate([APP_ROUTES.appView('profile')]);
  }

  /**
   * Held until submit, then uploaded once the listing has an id — the image
   * endpoint is keyed on the listing, so it cannot be sent with the form.
   */
  protected onPhotoPicked(file: File | null): void {
    this.photoFile = file;
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const quantity = Number.parseInt(v.quantityMeals.trim(), 10);
    const address = this.activeAddress();

    const errors: Record<string, string> = {};
    if (!v.title.trim()) {
      errors['title'] = 'Title is required';
    }
    if (!v.foodType.trim()) {
      errors['foodType'] = 'Food type is required';
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors['quantityMeals'] = 'Enter a valid number of meals';
    }
    if (!v.pickupDeadline) {
      errors['pickupDeadline'] = 'Pickup deadline is required';
    }
    this.fieldErrors.set(errors);

    const firstError = Object.values(errors)[0];
    if (firstError || !address) {
      this.toast.show(
        'fa-solid fa-triangle-exclamation',
        firstError || 'Choose a pickup address from the top-bar selector',
      );
      return;
    }

    const body: ListingWriteBody = {
      title: v.title.trim(),
      foodType: v.foodType.trim(),
      dietType: v.dietType,
      mealType: v.mealType,
      quantityMeals: quantity,
      freshnessTag: v.freshnessTag,
      preparedAtUtc: null,
      // The picker value is a wall-clock time. Send it as an IST-offset ISO
      // (e.g. 2026-08-01T17:30:00+05:30) so the payload carries the exact local
      // time the donor picked, while still naming an unambiguous instant.
      pickupDeadlineUtc: appZonedInputToOffsetIso(v.pickupDeadline),
      ...this.pickupPayload(address),
    };

    const id = this.editId();
    // Editing an existing listing posts straight away; a brand-new donation must
    // pass through the food-safety consent modal first.
    if (id) {
      this.postListing(body, id);
    } else {
      this.confirmThenPost(body);
    }
  }

  /**
   * Gate a new donation behind the consent modal: the request only fires if the
   * donor ticks the confirmation and presses "Confirm & Post". Cancelling (or
   * dismissing) the dialog leaves the form untouched so they can edit and retry.
   */
  private confirmThenPost(body: ListingWriteBody): void {
    const ref: DialogRef<boolean, DonationConsentDialog> = this.dialog.open<
      unknown,
      boolean,
      DonationConsentDialog
    >({
      header: {
        title: 'Confirm your donation',
        subtitle: 'Food safety & accuracy',
        icon: 'fa-solid fa-shield-heart',
      },
      content: DonationConsentDialog,
      size: 'md',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true, result: false },
        {
          id: 'confirm',
          label: 'Confirm & Post',
          icon: 'fa-solid fa-paper-plane',
          variant: 'solid',
          // Stays disabled until the donor ticks the confirmation box.
          disabled: () => !ref.body()?.confirmed(),
          close: true,
          result: true,
        },
      ],
    });

    ref.closed.subscribe((confirmed) => {
      if (confirmed) {
        this.postListing(body, null);
      }
    });
  }

  /** Fire the create/update request, upload any photo, then finish. */
  private postListing(body: ListingWriteBody, id: string | null): void {
    this.submitting.set(true);
    const request$ = id ? this.listingService.update(id, body) : this.listingService.create(body);

    request$.subscribe({
      next: (listing) => {
        if (this.photoFile) {
          this.listingService.uploadImage(listing.id, this.photoFile).subscribe({
            next: () => this.done(!!id),
            error: () => this.done(!!id, 'Listing saved, but the photo upload failed'),
          });
        } else {
          this.done(!!id);
        }
      },
      error: (err: Error) => {
        this.submitting.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not save the listing');
      },
    });
  }

  /**
   * Builds the listing's pickup fields per the backend's either/or contract: a saved
   * address from the caller's own book is sent as `donorAddressId`; anything else
   * (the edited listing's own stored address, or a local-fallback entry) is sent as the
   * freeform `pickupAddress`/`latitude`/`longitude` trio.
   */
  private pickupPayload(
    active: PickupAddress | { label: string; latitude: number; longitude: number; },
  ): Pick<ListingWriteBody, 'donorAddressId' | 'pickupAddress' | 'latitude' | 'longitude'> {
    const saved = this.pickup.selected();
    if (!this.editAddress() && this.pickup.serverBacked() && saved) {
      return { donorAddressId: saved.id };
    }
    // Saved addresses carry the full text in `address`; the edited listing's own in `label`.
    const text = 'address' in active ? active.address : active.label;
    return { pickupAddress: text, latitude: active.latitude, longitude: active.longitude };
  }

  private done(wasEdit: boolean, warning?: string): void {
    this.submitting.set(false);
    if (warning) {
      this.toast.show('fa-solid fa-triangle-exclamation', warning);
    } else {
      this.toast.show('fa-solid fa-circle-check', wasEdit ? 'Donation updated' : 'Donation posted — nearby volunteers notified!');
    }
    this.router.navigate([APP_ROUTES.appView('listings')]);
  }

  /** ISO UTC → the picker's IST `YYYY-MM-DDTHH:mm` control value. */
  private toLocalInput(iso: string): string {
    return utcIsoToAppZonedInput(iso);
  }
}
