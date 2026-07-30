import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_ROUTES, AppNavState } from '@core/config/app-routes';
import { DietType, FreshnessTag, ListingWriteBody, MealType } from '@core/models/listing-api.model';
import { DonorReport } from '@core/models/report.model';
import { ListingService } from '@core/services/listing.service';
import { PickupAddress, PickupAddressService } from '@core/services/pickup-address.service';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { FbDatePicker } from '@shared/ui/date-picker/date-picker';
import { ImagePicker } from '@shared/ui/image-picker/image-picker';
import { FbInput, FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { formatLocal } from '@shared/util/date-value';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

interface NearbyReceiver {
  name: string;
  dist: number;
}

@Component({
  selector: 'app-create-listing',
  imports: [ReactiveFormsModule, FbInput, FbSelect, FbDatePicker, FbButton, ImagePicker, PageWrapper],
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
        <form [formGroup]="form" class="card-fb p-5 xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Pickup address (chosen from the top bar) -->
          <div class="col-span-2">
            <label class="small-label mb-2 block">Pickup Address <span class="text-red-500">*</span></label>
            @if (activeAddress(); as a) {
              <div class="addr-banner">
                <i class="fa-solid fa-location-dot text-primary"></i>
                <span class="flex-1 text-sm font-medium truncate">{{ a.label }}</span>
                <span class="text-muted text-xs hidden sm:inline">Change in the top bar ↑</span>
              </div>
            } @else {
              <div class="addr-banner is-empty">
                <i class="fa-solid fa-triangle-exclamation text-orange"></i>
                <span class="flex-1 text-sm">Choose a pickup address from the top-bar selector ↑</span>
              </div>
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
              <button type="button" class="btn-fb-outline flex-1 !px-2" [class.selected]="form.controls.dietType.value === 'Veg'" (click)="form.controls.dietType.setValue('Veg')">🥦 Veg</button>
              <button type="button" class="btn-fb-outline flex-1 !px-2" [class.selected]="form.controls.dietType.value === 'NonVeg'" (click)="form.controls.dietType.setValue('NonVeg')">🍗 Non-Veg</button>
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
              (fileChange)="onPhotoPicked($event)"
            />
          </div>
          <div class="col-span-2">
            <app-button type="button" icon="fa-solid fa-paper-plane" [block]="true" [loading]="submitting()" (clicked)="submit()">
              {{ editId() ? 'Update' : 'Post' }} Donation
            </app-button>
          </div>
        </form>

        <div class="flex flex-col gap-4">
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
              <div><div class="impact-num">{{ impact()?.totalMealsDonated ?? 0 }}</div><div class="text-muted text-[11px]">Meals saved</div></div>
              <div><div class="impact-num">{{ impact()?.totalCertificates ?? 0 }}</div><div class="text-muted text-[11px]">Donations</div></div>
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
              <span class="badge-fb bg-primary-soft text-primary-deep">{{ nearby.length }} Active</span>
            </div>
            <div class="space-y-2.5">
              @for (r of nearby; track r.name) {
                <div class="flex items-center gap-3">
                  <div class="avatar-circle !w-8 !h-8 !text-xs">{{ r.name.charAt(0) }}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">{{ r.name }}</div>
                    <div class="text-muted text-xs">{{ r.dist }} km away</div>
                  </div>
                  <i class="fa-solid fa-location-dot text-muted text-xs"></i>
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
    }
    .impact-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      line-height: 1.1;
    }
  `,
})
export class CreateListing {
  private readonly listingService = inject(ListingService);
  private readonly reportService = inject(ReportService);
  protected readonly pickup = inject(PickupAddressService);
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
  protected readonly minDeadline = formatLocal(new Date(), 'datetime');

  protected readonly nearby: NearbyReceiver[] = [
    { name: 'Hope Community Kitchen', dist: 1.2 },
    { name: 'Sunrise Shelter', dist: 2.6 },
    { name: 'Asha Foundation', dist: 3.4 },
  ];

  private photoFile: File | null = null;
  protected readonly impact = signal<DonorReport | null>(null);
  protected readonly co2 = computed(() => Math.round((this.impact()?.totalMealsDonated ?? 0) * 0.45));

  /** Pickup address used for the listing — the edited listing's, else the top-bar selection. */
  private readonly editAddress = signal<{ label: string; latitude: number; longitude: number; } | null>(null);
  protected readonly activeAddress = computed(() => this.editAddress() ?? this.pickup.selected());

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
    this.reportService.donor().subscribe({
      next: (r) => this.impact.set(r),
      error: () => undefined,
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
      pickupDeadlineUtc: new Date(v.pickupDeadline).toISOString(),
      ...this.pickupPayload(address),
    };

    const id = this.editId();
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

  /** ISO UTC → the picker's local `YYYY-MM-DDTHH:mm` control value. */
  private toLocalInput(iso: string): string {
    return formatLocal(new Date(iso), 'datetime');
  }
}
