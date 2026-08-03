import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, EMPTY, tap } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { AvailabilityService } from '@core/services/availability.service';
import { DialogService } from '@core/services/dialog.service';
import type { GeoAddress } from '@core/services/geocoding.service';
import {
  PickupAddress,
  PickupAddressDraft,
  PickupAddressService,
} from '@core/services/pickup-address.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { UpdateProfileBody, UserProfile } from '@core/models/user.model';
import { formatAddress } from '@shared/util/address';
import { FbAutofocus } from '@shared/directives/autofocus.directive';
import { AvailabilityToggle } from '@shared/ui/availability-toggle/availability-toggle';
import { FbButton } from '@shared/ui/button/button';
import { FbInput } from '@shared/ui/input/input';
import { openPhotoDialog } from '@shared/ui/image-picker/photo-dialog';
import { LocationPicker } from '@shared/ui/location-picker/location-picker';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { RoleBadge } from '@shared/ui/role-badge/role-badge';
import { Avatar } from '@shared/ui/avatar/avatar';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

/** Address-form controls that carry validation, in display order. `city` has none. */
const ADDR_FIELDS = ['label', 'address', 'state', 'pincode'] as const;

@Component({
  selector: 'app-profile',
  imports: [NgClass, ReactiveFormsModule, FbInput, FbButton, RoleBadge, Avatar, LocationPicker, AvailabilityToggle, PageWrapper, FbAutofocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="'Profile'"
      description="Your details, contact number and the location we match you from."
    >
      @if (loading()) {
        <!-- Mirrors the loaded layout: same grid, same card widths, avatar circle
             and field stack in the same places — so the page doesn't jump when the
             profile arrives. Donor-ness comes from the session (see
             skeletonIsDonor), which is known before the fetch returns. -->
        <div
          class="grid gap-4 items-start"
          [ngClass]="skeletonIsDonor() ? 'lg:grid-cols-2 max-w-5xl' : 'max-w-xl'"
          aria-hidden="true"
        >
          <div class="sk-card min-w-0 !p-5">
            <div class="flex items-center gap-3 mb-5">
              <div class="sk h-16 w-16 !rounded-full shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="sk h-5 w-2/3 mb-2"></div>
                <div class="sk h-4 w-1/2"></div>
              </div>
            </div>
            @for (s of formSkeletons; track $index) {
              <div class="mb-4">
                <div class="sk h-3 w-24 mb-2"></div>
                <div class="sk h-11 w-full"></div>
              </div>
            }
            <div class="sk h-10 w-40 mt-5"></div>
          </div>

          @if (skeletonIsDonor()) {
            <div class="sk-card min-w-0 !p-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="sk h-9 w-9 shrink-0"></div>
                <div class="min-w-0 flex-1">
                  <div class="sk h-4 w-40 mb-2"></div>
                  <div class="sk h-3 w-28"></div>
                </div>
                <div class="sk h-8 w-28 shrink-0"></div>
              </div>
              @for (s of addressSkeletons; track $index) {
                <div class="sk h-14 w-full mb-2"></div>
              }
            </div>
          }
        </div>
        <p class="sr-only" role="status">Loading your profile…</p>
      } @else if (profile(); as u) {
        <div
          class="grid gap-4 items-start"
          [ngClass]="isDonor() ? 'lg:grid-cols-2 max-w-5xl' : 'max-w-xl'"
        >
          <!-- min-w-0: a grid item defaults to min-width:auto, so this card could
               not shrink below its widest unbreakable child and dragged the single
               column to 468px inside a 328px container — 124px of horizontal scroll
               on a 360px phone, on every card in the grid, not just this one. -->
          <form [formGroup]="form" class="card-fb p-5 min-w-0">
          <!-- Identity block. The name gets its own line so a long org name can
               never collide with the status badge, and the meta row below keeps
               role / city / status on one baseline. -->
          <div class="id-head">
            <div class="relative shrink-0">
              <app-avatar [name]="u.name" [imageUrl]="u.avatarUrl" [size]="64" />
              <button type="button" class="photo-btn" title="Change photo" (click)="changePhoto()">
                <i class="fa-solid fa-camera"></i>
              </button>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="id-name">{{ u.name }}</h4>
              <div class="id-meta">
                <app-role-badge [role]="u.role" size="sm" />
                @if (isDonor()) {
                  <!-- Donors: certification status rather than the generic account status. -->
                  @if (u.accountStatus === 'Verified') {
                    <span class="acc-badge verified">
                      <i class="fa-solid fa-certificate" aria-hidden="true"></i>Certified Donor
                    </span>
                  } @else {
                    <span class="acc-badge muted">
                      <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>Not certified
                    </span>
                  }
                } @else if (statusMeta(u.accountStatus); as s) {
                  <span class="acc-badge" [class]="s.cls">
                    <i [class]="s.icon" aria-hidden="true"></i>{{ u.accountStatus }}
                  </span>
                }
              </div>
              @if (fullAddress(); as addr) {
                <p class="id-address">
                  <i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ addr }}
                </p>
              }
            </div>
          </div>

          @if (canToggleAvailability()) {
            <app-availability-toggle class="mb-4" variant="row" />
          }

          <div class="grid sm:grid-cols-2 gap-3">
            <app-input class="sm:col-span-2" label="Mobile" prefix="+91" prefixIcon="fa-solid fa-phone" formControlName="mobile" />
            <app-input class="sm:col-span-2" label="Full Name" formControlName="name" />
            <app-input class="sm:col-span-2" label="Address" formControlName="address" />
            <app-input label="City" formControlName="city" />
            <app-input label="State" formControlName="state" [maxlength]="100" />
            <app-input
              class="sm:col-span-2"
              label="Pincode"
              type="tel"
              inputmode="numeric"
              [maxlength]="6"
              formControlName="pincode"
              [error]="pincodeError()"
            />
            @if (isRecipient()) {
              <app-input label="Recipient Type" formControlName="recipientType" />
              <app-input
                type="number"
                [label]="u.recipientType === 'Organization' ? 'Serving Capacity (meals/day)' : 'Household Size'"
                formControlName="capacity"
              />
            }
          </div>
          <div class="mt-5">
            <app-button icon="fa-solid fa-floppy-disk" [disabled]="saving()" (clicked)="save()">
              {{ saving() ? 'Saving…' : 'Save Changes' }}
            </app-button>
          </div>
        </form>

        @if (isDonor()) {
          <!-- min-w-0 for the same reason as the form above. -->
          <div class="card-fb p-5 min-w-0">
            <div class="card-head">
              <div class="card-head-title">
                <span class="card-head-icon">
                  <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                </span>
                <div class="min-w-0">
                  <div class="font-bold text-sm">Pickup Addresses</div>
                  <div class="text-muted text-xs mt-0.5">
                    {{ addressCountLabel() }}
                  </div>
                </div>
              </div>
              <app-button
                variant="outline"
                size="sm"
                [icon]="addOpen() ? 'fa-solid fa-xmark' : 'fa-solid fa-plus'"
                (clicked)="toggleAddForm()"
              >
                {{ addOpen() ? 'Close' : 'Add address' }}
              </app-button>
            </div>

            @if (pickup.loading()) {
              <div class="text-muted text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading addresses…</div>
            }
            <div class="space-y-2">
              @for (a of pickup.addresses(); track a.id) {
                <!-- Two groups, not one flat row: the controls have to wrap below the
                     address as a block. Flat, they wrapped one button at a time and
                     squeezed the address down to a useless truncated stub. -->
                <div class="addr-row" [class.sel]="isDefault(a)">
                  <div class="addr-main">
                    <i class="fa-solid shrink-0" [class]="isDefault(a) ? 'fa-circle-check text-primary' : 'fa-location-dot text-muted'"></i>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold truncate">{{ a.label }}</div>
                      <div class="text-xs text-muted truncate">{{ oneLine(a) }}</div>
                    </div>
                  </div>

                  <div class="addr-actions">
                    <button
                      type="button"
                      role="switch"
                      class="addr-switch shrink-0"
                      [class.on]="isDefault(a)"
                      [attr.aria-checked]="isDefault(a)"
                      [disabled]="isDefault(a) || settingDefaultId() === a.id"
                      [title]="isDefault(a) ? 'Default pickup address' : 'Set as default'"
                      (click)="setDefault(a, $event)"
                    >
                      <span class="knob"></span>
                      <span class="addr-switch-text">
                        @if (settingDefaultId() === a.id) {
                          <i class="fa-solid fa-spinner fa-spin"></i>&nbsp;Saving…
                        } @else {
                          {{ isDefault(a) ? 'Default' : 'Set default' }}
                        }
                      </span>
                    </button>
                    @if (confirmRemoveId() === a.id) {
                      <span class="addr-confirm-text">Remove?</span>
                      <button type="button" class="addr-x addr-x-danger" title="Confirm remove" [disabled]="removingId() === a.id" (click)="removeAddr(a.id, $event)">
                        @if (removingId() === a.id) {
                          <i class="fa-solid fa-spinner fa-spin"></i>
                        } @else {
                          <i class="fa-solid fa-check"></i>
                        }
                      </button>
                      <button type="button" class="addr-x" title="Keep address" (click)="cancelRemove($event)"><i class="fa-solid fa-xmark"></i></button>
                    } @else {
                      <button type="button" class="addr-x" title="Edit" (click)="startEdit(a, $event)"><i class="fa-solid fa-pen"></i></button>
                      <button type="button" class="addr-x" title="Remove" (click)="askRemove(a.id, $event)"><i class="fa-solid fa-trash-can"></i></button>
                    }
                  </div>
                </div>
              } @empty {
                @if (!pickup.loading()) {
                  <div class="text-muted text-sm">No pickup addresses yet — add one below.</div>
                }
              }
            </div>

            @if (addOpen()) {
              <div class="mt-4 pt-4 border-t border-line">
                <div class="small-label mb-2">{{ editingId() ? 'Edit address' : 'New address' }} — pin the pickup location</div>
                <app-location-picker
                  [location]="addLocation()"
                  [height]="200"
                  placeholderText="Pin the pickup location"
                  emptyHint="Drop a pin or use your current location."
                  (locationChange)="onAddLocation($event)"
                  (addressResolved)="onAddressResolved($event)"
                />
                <form [formGroup]="addrForm" class="grid sm:grid-cols-2 gap-3" fbAutofocus>
                  <app-input class="sm:col-span-2" label="Label" formControlName="label" placeholder="e.g. Home, Main Branch" [required]="true" [maxlength]="100" hint="A short name to recognise this location." [error]="addrErr('label')" />
                  <app-input class="sm:col-span-2" label="Address" formControlName="address" placeholder="e.g. C.G. Road, Navrangpura" [required]="true" [maxlength]="500" hint="Drop a pin or use GPS to auto-fill." [error]="addrErr('address')" />
                  <app-input label="City" formControlName="city" placeholder="City" />
                  <app-input label="State" formControlName="state" placeholder="State" [maxlength]="100" />
                  <app-input class="sm:col-span-2" label="Pincode" type="tel" [maxlength]="6" inputmode="numeric" formControlName="pincode" placeholder="Pincode" [error]="addrErr('pincode')" />
                </form>
                <div class="mt-4 flex gap-2">
                  <app-button icon="fa-solid fa-check" [disabled]="savingAddr()" (clicked)="saveAddress()">
                    {{ savingAddr() ? 'Saving…' : editingId() ? 'Update Address' : 'Save Address' }}
                  </app-button>
                  <app-button variant="ghost" (clicked)="toggleAddForm()">Cancel</app-button>
                </div>
              </div>
            }
          </div>
        }
        </div>
      } @else {
        <div class="card-fb p-5 max-w-xl text-muted">Could not load your profile.</div>
      }
    </app-page-wrapper>
  `,
  styles: `
    .photo-btn {
      position: absolute;
      right: -2px;
      bottom: -5px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--fb-surface);
      border: 1px solid var(--fb-line);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.14);
      color: var(--fb-muted);
      font-size: 10px;
      cursor: pointer;
      transition:
        color 0.15s ease,
        border-color 0.15s ease;
    }
    .photo-btn:hover {
      color: var(--fb-primary-deep);
      border-color: var(--fb-primary);
    }
    /* ---- Card header with icon + subtitle ---- */
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .card-head-title {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }
    .card-head-icon {
      width: 36px;
      height: 36px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 11px;
      font-size: 14px;
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
      box-shadow: inset 0 0 0 1px rgb(var(--fb-primary-rgb) / 0.2);
    }

    /* ---- Identity header ---- */
    .id-head {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }
    .id-name {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: -0.01em;
      color: var(--fb-ink);
      /* Long organisation names wrap instead of shoving the badges around. */
      overflow-wrap: anywhere;
    }
    .id-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 7px;
    }
    .id-city {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12.5px;
      color: var(--fb-muted);
    }
    /* Complete address (street + city) shown under the identity meta row. */
    .id-address {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 7px;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--fb-muted);
    }
    .id-address i {
      margin-top: 3px;
      flex-shrink: 0;
    }

    /* ---- Account status badge ----
       Self-tinting: the fill is an alpha wash of the badge's own accent so it
       composites over whatever surface it sits on, and the label is pushed away
       from that accent (darker in light mode, lighter in dark). The previous
       version paired a fixed light fill with a fixed dark label, which inverted
       into bright-on-near-white once dark mode flipped --fb-success-deep. */
    .acc-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      padding: 5px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--acc) 15%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acc) 26%, transparent);
      /* Label needs 4.5:1 against its own wash, so it is pushed away from the
         accent rather than left at full saturation. --acc drives the fill, so
         changing the text colour cannot weaken the tile. */
      color: color-mix(in srgb, var(--acc) 74%, #000);
    }
    :host-context(.dark) .acc-badge {
      color: color-mix(in srgb, var(--acc) 62%, #fff);
    }
    .acc-badge.verified {
      --acc: #1e9e5c;
    }
    .acc-badge.pending {
      --acc: #d97706;
    }
    .acc-badge.suspended {
      --acc: #e04434;
    }
    .acc-badge.muted {
      --acc: #64748b;
    }
    .addr-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--fb-line);
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    /* The label + address. Takes the leftover space and truncates rather than
       carrying a wrap-triggering basis: a basis wide enough to force the wrap on a
       phone also tripped it on desktop for whichever rows happened to say "Set
       default" (wider than "Default"), leaving one row stacked and its neighbour
       not. The breakpoint below decides the wrap instead, so it is the same for
       every row. */
    .addr-main {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1 1 auto;
      min-width: 0;
    }
    /* margin-left:auto pins the controls right while they still share the line. */
    .addr-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      margin-left: auto;
    }
    @media (max-width: 640px) {
      /* Full width forces the wrap outright rather than leaving it to the basis,
         so the controls sit on their own line on every phone regardless of how
         long the address happens to be. */
      .addr-main {
        flex-basis: 100%;
      }
      .addr-actions {
        width: 100%;
        margin-left: 0;
        justify-content: flex-end;
      }
    }
    .addr-row.sel {
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
    }
    /* Default toggle switch */
    .addr-switch {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--fb-line);
      background: var(--fb-bg);
      border-radius: 999px;
      padding: 3px 12px 3px 3px;
      cursor: pointer;
      color: var(--fb-muted);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background 0.15s ease;
    }
    .addr-switch:hover:not(:disabled) {
      border-color: var(--fb-primary);
      color: var(--fb-primary-deep);
    }
    .addr-switch .knob {
      position: relative;
      display: inline-block;
      width: 34px;
      height: 18px;
      border-radius: 999px;
      background: var(--fb-line);
      transition: background 0.15s ease;
    }
    .addr-switch .knob::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      transition: transform 0.15s ease;
    }
    .addr-switch.on {
      color: var(--fb-primary-deep);
      border-color: var(--fb-primary);
      background: var(--fb-primary-soft);
      cursor: default;
    }
    .addr-switch.on .knob {
      background: var(--fb-primary);
    }
    .addr-switch.on .knob::after {
      transform: translateX(16px);
    }
    .addr-switch:disabled:not(.on) {
      cursor: default;
      opacity: 0.7;
    }
    .addr-x {
      border: 0;
      background: transparent;
      color: var(--fb-muted);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .addr-x:hover {
      color: #e04434;
      background: var(--fb-bg);
    }
    .addr-x-danger {
      color: #e04434;
    }
    .addr-confirm-text {
      font-size: 12px;
      font-weight: 600;
      color: #e04434;
      white-space: nowrap;
    }
  `,
})
export class Profile {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  protected readonly pickup = inject(PickupAddressService);
  protected readonly availability = inject(AvailabilityService);

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  /** Placeholder rows for the loading skeleton — one per field the form renders. */
  protected readonly formSkeletons = Array.from({ length: 5 });
  protected readonly addressSkeletons = Array.from({ length: 2 });

  /**
   * Donor-ness for the **skeleton**, taken from the session rather than
   * {@link isDonor}, which reads the fetched profile and is therefore always false
   * while loading. Using it there drew one card and then two once the data landed —
   * precisely the layout jump the skeleton is meant to absorb.
   */
  protected readonly skeletonIsDonor = computed(
    () => this.auth.currentUser()?.role?.toLowerCase() === 'donor',
  );

  /** The complete address on one line for the identity header. */
  protected readonly fullAddress = computed(() => formatAddress(this.profile()));

  /** Same one-line form for a saved pickup address row. */
  protected oneLine(a: PickupAddress): string {
    return formatAddress(a);
  }

  // ---- Pickup address management (donors) ----
  protected readonly isDonor = computed(() => this.profile()?.role?.toLowerCase() === 'donor');
  protected readonly addOpen = signal(false);
  protected readonly savingAddr = signal(false);
  protected readonly addLocation = signal<FbLatLng | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly removingId = signal<string | null>(null);
  protected readonly settingDefaultId = signal<string | null>(null);
  /** Address awaiting delete confirmation (inline two-step confirm). */
  protected readonly confirmRemoveId = signal<string | null>(null);

  protected isDefault(a: PickupAddress): boolean {
    return a.id === this.pickup.selected()?.id;
  }

  /** Header subtitle — gives the card a purpose line instead of a bare title. */
  protected readonly addressCountLabel = computed(() => {
    const n = this.pickup.addresses().length;
    if (!n) {
      return 'None saved yet';
    }
    return `${n} saved · used when posting a donation`;
  });

  protected readonly addrForm = new FormGroup({
    label: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
    city: new FormControl('', { nonNullable: true }),
    state: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    // `\d{0,6}` not `\d{6}`: an empty pincode is valid (the field is optional), a partial one isn't.
    pincode: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{0,6}$/)] }),
  });

  /** Per-field validation messages shown beneath each input (mirrors the register form). */
  protected readonly addrErrors = signal<Record<string, string>>({});
  /** True once a save has been attempted — enables live re-validation on change. */
  private addrValidated = false;

  protected addrErr(field: string): string {
    return this.addrErrors()[field] ?? '';
  }

  /** Icon + colour class for an account status pill. */
  protected statusMeta(status: string): { icon: string; cls: string; } {
    switch (status) {
      case 'Verified':
        return { icon: 'fa-solid fa-circle-check', cls: 'verified' };
      case 'Pending':
        return { icon: 'fa-solid fa-clock', cls: 'pending' };
      case 'Suspended':
        return { icon: 'fa-solid fa-ban', cls: 'suspended' };
      default:
        return { icon: 'fa-solid fa-circle-info', cls: '' };
    }
  }

  protected readonly isRecipient = computed(() => this.profile()?.role?.toLowerCase() === 'recipient');
  protected readonly canToggleAvailability = computed(() => {
    const role = this.profile()?.role?.toLowerCase();
    return role === 'volunteer' || role === 'recipient';
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    state: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    // Optional, so blank is valid — `\d{0,6}` rejects a partial entry without demanding one.
    pincode: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{0,6}$/)] }),
    address: new FormControl('', { nonNullable: true }),
    capacity: new FormControl('', { nonNullable: true }),
    mobile: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    recipientType: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
  });

  /**
   * The one profile field that can be malformed rather than merely empty. A signal rather than a
   * `computed`, because reactive-form validity isn't a signal — a computed over it would evaluate
   * once and never update.
   */
  protected readonly pincodeError = signal('');

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Re-validate the address fields on every change, once a save has been attempted.
    this.addrForm.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (this.addrValidated) {
        this.refreshAddrErrors();
      }
    });

    this.form.controls.pincode.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      this.pincodeError.set(
        this.form.controls.pincode.invalid ? 'Pincode must be 6 digits.' : '',
      );
    });

    const id = this.auth.currentUser()?.id;
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.users.getProfile(id).subscribe({
      next: (p) => this.applyProfile(p),
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load profile');
      },
    });
  }

  /** Same upload-or-capture modal the pickup and delivery confirmations use. */
  protected changePhoto(): void {
    const id = this.profile()?.id;
    if (!id) {
      return;
    }
    openPhotoDialog(this.dialog, {
      title: 'Change your photo',
      icon: 'fa-solid fa-user',
      confirmLabel: 'Save photo',
      hint: 'Shown to donors, volunteers and NGOs you work with.',
      submit: (photo) =>
        this.users.uploadAvatar(id, photo).pipe(
          tap((res) => {
            this.profile.update((p) => (p ? { ...p, avatarUrl: res.avatarUrl } : p));
            this.auth.patchCurrentUser({ avatarUrl: res.avatarUrl });
            this.toast.show('fa-solid fa-circle-check', 'Photo updated');
          }),
          catchError((err: Error) => {
            this.toast.show(
              'fa-solid fa-triangle-exclamation',
              err.message || 'Could not upload photo',
            );
            // Keeps the dialog open so the same photo can be retried.
            return EMPTY;
          }),
        ),
    });
  }

  protected save(): void {
    const id = this.profile()?.id;
    if (!id) {
      return;
    }
    this.form.controls.pincode.markAsTouched();
    if (this.form.controls.pincode.invalid) {
      this.pincodeError.set('Pincode must be 6 digits.');
      this.toast.show('fa-solid fa-triangle-exclamation', 'Pincode must be 6 digits.');
      return;
    }

    const v = this.form.getRawValue();
    const body: UpdateProfileBody = {
      name: v.name.trim(),
      city: v.city.trim() || null,
      state: v.state.trim() || null,
      pincode: v.pincode.trim() || null,
      address: v.address.trim() || null,
      latitude: this.profile()?.latitude ?? null,
      longitude: this.profile()?.longitude ?? null,
      capacityMeals: this.isRecipient() ? this.parseCapacity(v.capacity) : null,
    };
    this.saving.set(true);
    this.users.updateProfile(id, body).subscribe({
      next: (p) => {
        this.applyProfile(p);
        this.saving.set(false);
        this.auth.patchCurrentUser({ name: p.name, city: p.city ?? undefined });
        this.toast.show('fa-solid fa-circle-check', 'Profile updated');
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not save profile');
      },
    });
  }

  protected toggleAddForm(): void {
    const open = !this.addOpen();
    this.addOpen.set(open);
    if (!open) {
      this.resetAddForm();
    }
  }

  protected onAddLocation(pos: FbLatLng): void {
    this.addLocation.set(pos);
  }

  /** Address fields filled from the picker's reverse-geocode of the chosen point. */
  protected onAddressResolved(a: GeoAddress): void {
    this.addrForm.patchValue({
      address: a.address || this.addrForm.controls.address.value,
      city: a.city || this.addrForm.controls.city.value,
      state: a.state || this.addrForm.controls.state.value,
      pincode: a.pincode || this.addrForm.controls.pincode.value,
    });
  }

  /** Make this address the default (selected) pickup address. */
  protected setDefault(a: PickupAddress, event: Event): void {
    event.stopPropagation();
    if (this.isDefault(a) || this.settingDefaultId()) {
      return;
    }
    this.settingDefaultId.set(a.id);
    this.pickup.select(a.id).subscribe({
      next: () => {
        this.settingDefaultId.set(null);
        this.toast.show('fa-solid fa-circle-check', `“${a.label}” is now your default pickup address`);
      },
      error: (err: Error) => {
        this.settingDefaultId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not set the default address');
      },
    });
  }

  /** Load an existing address into the form for editing. */
  protected startEdit(a: PickupAddress, event: Event): void {
    event.stopPropagation();
    this.editingId.set(a.id);
    this.addLocation.set({ lat: a.latitude, lng: a.longitude });
    this.addrForm.reset({
      label: a.label,
      address: a.address,
      city: a.city ?? '',
      state: a.state ?? '',
      pincode: a.pincode ?? '',
    });
    this.addrValidated = false;
    this.addrErrors.set({});
    this.addOpen.set(true);
  }

  protected saveAddress(): void {
    this.addrValidated = true;
    this.addrForm.markAllAsTouched();
    this.refreshAddrErrors();
    const firstError = this.firstAddrError();
    if (firstError) {
      this.toast.show('fa-solid fa-triangle-exclamation', firstError);
      return;
    }

    const loc = this.addLocation();
    if (!loc) {
      this.toast.show('fa-solid fa-triangle-exclamation', 'Drop a pin or use your current location');
      return;
    }

    // City/state/pincode go as their own fields. They used to be concatenated into `address`,
    // which is why editing an address couldn't put them back in their own inputs.
    const v = this.addrForm.getRawValue();
    const draft: PickupAddressDraft = {
      label: v.label,
      address: v.address,
      city: v.city,
      state: v.state,
      pincode: v.pincode,
      latitude: loc.lat,
      longitude: loc.lng,
    };

    const editId = this.editingId();
    this.savingAddr.set(true);
    const request$ = editId
      ? this.pickup.update(editId, draft, this.isDefaultOf(editId))
      : this.pickup.create(draft);

    request$.subscribe({
      next: () => {
        this.savingAddr.set(false);
        this.addOpen.set(false);
        this.resetAddForm();
        this.toast.show('fa-solid fa-circle-check', editId ? 'Address updated' : 'Pickup address added');
      },
      error: (err: Error) => {
        this.savingAddr.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not save the address');
      },
    });
  }

  /** Ask for confirmation before deleting (arms the inline confirm on this row). */
  protected askRemove(id: string, event: Event): void {
    event.stopPropagation();
    this.confirmRemoveId.set(id);
  }

  /** Dismiss the delete confirmation, keeping the address. */
  protected cancelRemove(event: Event): void {
    event.stopPropagation();
    this.confirmRemoveId.set(null);
  }

  protected removeAddr(id: string, event: Event): void {
    event.stopPropagation();
    this.removingId.set(id);
    this.pickup.remove(id).subscribe({
      next: () => {
        this.removingId.set(null);
        this.confirmRemoveId.set(null);
        this.toast.show('fa-solid fa-circle-check', 'Address removed');
      },
      error: (err: Error) => {
        this.removingId.set(null);
        this.confirmRemoveId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not remove the address');
      },
    });
  }

  private isDefaultOf(id: string): boolean {
    return this.pickup.addresses().find((a) => a.id === id)?.isDefault ?? false;
  }

  /** Message for an invalid address-form control, derived from its Angular error state. */
  private addrControlError(name: string): string {
    const control = this.addrForm.get(name);
    if (!control || control.valid) {
      return '';
    }
    switch (name) {
      case 'label':
        return control.hasError('required') ? 'A label is required' : 'Label must be 100 characters or fewer';
      case 'address':
        return control.hasError('required') ? 'The address is required' : 'Address must be 500 characters or fewer';
      case 'state':
        return 'State must be 100 characters or fewer';
      case 'pincode':
        return 'Pincode must be up to 6 digits';
      default:
        return 'This field is required';
    }
  }

  private refreshAddrErrors(): void {
    const next: Record<string, string> = {};
    for (const name of ADDR_FIELDS) {
      const message = this.addrControlError(name);
      if (message) {
        next[name] = message;
      }
    }
    this.addrErrors.set(next);
  }

  private firstAddrError(): string {
    for (const name of ADDR_FIELDS) {
      const message = this.addrControlError(name);
      if (message) {
        return message;
      }
    }
    return '';
  }

  private resetAddForm(): void {
    this.editingId.set(null);
    this.addLocation.set(null);
    this.addrValidated = false;
    this.addrErrors.set({});
    this.addrForm.reset({ label: '', address: '', city: '', state: '', pincode: '' });
  }

  private applyProfile(p: UserProfile): void {
    this.profile.set(p);
    this.availability.hydrate(p.isAvailable, p.accountStatus);
    this.loading.set(false);
    this.auth.patchCurrentUser({ avatarUrl: p.avatarUrl ?? undefined });
    this.form.patchValue(
      {
        name: p.name,
        city: p.city ?? '',
        state: p.state ?? '',
        pincode: p.pincode ?? '',
        address: p.address ?? '',
        capacity: p.capacityMeals != null ? String(p.capacityMeals) : '',
        mobile: p.mobile,
        recipientType: p.recipientType ?? '',
      },
      { emitEvent: false },
    );
  }

  private parseCapacity(value: string): number | null {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
}
