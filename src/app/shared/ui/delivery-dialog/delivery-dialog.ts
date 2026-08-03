import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, tap } from 'rxjs';
import { DropOffHotspot } from '@core/models/dropoff-location.model';
import type { DropOffSelection } from '@core/services/listing.service';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import { GeolocationService } from '@core/services/geolocation.service';
import type { DialogService } from '@core/services/dialog.service';
import { ToastService } from '@core/services/toast.service';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { FbButton } from '@shared/ui/button/button';
import { FbInput, FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { ImagePicker } from '@shared/ui/image-picker/image-picker';

/** Sentinel option value for the "add a new spot" branch. */
const NEW_SPOT = '__new__';
/** Sentinel option value for "delivered to the matched recipient". */
const RECIPIENT = '__recipient__';

export interface DeliveryDialogData {
  /** Where to centre the hotspot search — the listing's pickup point. Also used as the
      drop-off coordinates when delivering to a matched recipient (who has no coordinates). */
  latitude: number;
  longitude: number;
  /** Pre-select this spot (the one confirm-pickup already suggested), when still available. */
  suggestedLocationId?: string | null;
  /** True when this confirmation completes the donation outright (no recipient waiting). */
  completesDonation: boolean;
  /** The matched recipient's name, when one exists — offered as the pre-selected drop-off. */
  recipientName?: string | null;
  /**
   * The donor is delivering their own unclaimed listing rather than a volunteer confirming one.
   * Wording only — the photo and drop-off collected are identical, which is the point: the same
   * delivery record is produced either way.
   */
  selfDelivery?: boolean;
}

/**
 * Body of the confirm-delivery dialog: the delivery photo plus **where** the food was
 * dropped, which the backend now requires.
 *
 * Its own component rather than an extension of the shared {@link ImagePicker}-only photo
 * dialog, because this is the one confirmation that collects a second, quite different piece
 * of information — and the drop-off list needs to load asynchronously and offer a
 * "somewhere new" branch with GPS capture.
 */
@Component({
  selector: 'app-delivery-dialog',
  imports: [ImagePicker, FbButton, FbInput, FbSelect, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <app-image-picker
        [hint]="
          data.completesDonation
            ? 'Photograph the drop-off — this is the delivery record.'
            : 'Photograph the handover, so the recipient can confirm it.'
        "
        accept="image/jpeg,image/png"
        [maxSizeMb]="5"
        (fileChange)="file.set($event)"
      />

      <div class="flex flex-col gap-2">
        <!-- Custom single-select: each nearby spot shows its distance + past deliveries,
             cooling spots are disabled, and the last option opens the "add new" branch. -->
        <app-select
          label="Where did you drop it off?"
          icon="fa-solid fa-location-dot"
          placeholder="Select a drop-off spot"
          emptyText="No spots found — add one below"
          [searchable]="false"
          [loading]="loading()"
          [options]="options()"
          [formControl]="spotControl"
        />

        @if (isNew()) {
          <div class="new-spot">
            <app-input
              label="Name this place"
              placeholder="e.g. Paldi underbridge camp"
              hint="Other volunteers will see this name."
              [required]="true"
              [formControl]="nameControl"
            />
            <div class="flex items-center gap-2">
              <app-button
                variant="outline"
                size="sm"
                icon="fa-solid fa-location-crosshairs"
                [loading]="locating()"
                (clicked)="useMyLocation()"
              >
                Use my location
              </app-button>
              @if (newCoords(); as c) {
                <span class="fb-help">
                  <i class="fa-solid fa-check mr-1 text-success"></i>
                  {{ c.lat.toFixed(5) }}, {{ c.lng.toFixed(5) }}
                </span>
              } @else {
                <span class="fb-help">Needed so others can find it</span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .new-spot {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px dashed var(--fb-line);
        border-radius: 12px;
      }
    `,
  ],
})
export class DeliveryDialog {
  protected readonly data = inject<DeliveryDialogData>(DIALOG_DATA);
  private readonly dropOffs = inject(DropOffLocationService);
  private readonly geo = inject(GeolocationService);
  private readonly toast = inject(ToastService);

  readonly file = signal<File | null>(null);

  protected readonly spots = signal<DropOffHotspot[]>([]);
  protected readonly loading = signal(true);
  protected readonly newCoords = signal<{ lat: number; lng: number } | null>(null);
  protected readonly locating = signal(false);

  /** The custom single-select's value: a spot id, the {@link NEW_SPOT} sentinel, or null. */
  protected readonly spotControl = new FormControl<string | null>(null);
  private readonly selectedValue = signal<string | null>(null);

  /** "Add a new spot" branch is active — reveals the name + location form below. */
  protected readonly isNew = computed(() => this.selectedValue() === NEW_SPOT);

  /** Reactive control per project convention; mirrored into a signal for `dropOff`. */
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(200)],
  });
  private readonly newName = signal('');

  /**
   * Dropdown options: the matched recipient first (when there is one), then each nearby
   * spot (distance + past deliveries), then "add a new spot".
   */
  protected readonly options = computed<FbSelectOption[]>(() => {
    const opts: FbSelectOption[] = [];

    // A matched recipient has no coordinates of its own, so it's offered as a drop-off
    // pointed at the pickup location — this is where the volunteer hands the food over.
    if (this.data.recipientName) {
      opts.push({
        value: RECIPIENT,
        label: this.data.recipientName,
        icon: 'fa-solid fa-hand-holding-heart',
        description: 'Recipient — deliver here',
      });
    }

    opts.push(
      ...this.spots().map((s) => ({
        value: s.id,
        label: s.name,
        icon: 'fa-solid fa-location-dot',
        description: this.spotDescription(s),
        disabled: s.isCoolingDown,
      })),
    );

    opts.push({
      value: NEW_SPOT,
      label: 'Somewhere else — add a new spot',
      icon: 'fa-solid fa-plus',
    });
    return opts;
  });

  /**
   * The choice to submit, or null while it's incomplete — the footer's Confirm reads this,
   * so an unnamed or un-located new spot can't be sent (the backend would 422 it anyway).
   */
  readonly dropOff = computed<DropOffSelection | null>(() => {
    const value = this.selectedValue();
    if (value === RECIPIENT) {
      // No recipient coordinates exist, so the hand-over is recorded at the pickup point.
      const name = this.data.recipientName?.trim();
      return name
        ? { latitude: this.data.latitude, longitude: this.data.longitude, name }
        : null;
    }
    if (value === NEW_SPOT) {
      const name = this.newName().trim();
      const coords = this.newCoords();
      return name && coords
        ? { latitude: coords.lat, longitude: coords.lng, name }
        : null;
    }
    return value ? { locationId: value } : null;
  });

  constructor() {
    this.nameControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.newName.set(value));

    this.spotControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.selectedValue.set(value));

    // With a matched recipient, delivering to them is the default — pre-select it now
    // (it doesn't depend on the hotspot list, which loads asynchronously below).
    if (this.data.recipientName) {
      this.spotControl.setValue(RECIPIENT);
    }

    this.dropOffs.hotspots(this.data.latitude, this.data.longitude).subscribe({
      next: (spots) => {
        this.spots.set(spots);
        // Only auto-pick a hotspot when there's no recipient already selected. Prefer the
        // spot confirm-pickup suggested; otherwise the first available (nearest), never a
        // cooling one.
        if (!this.data.recipientName) {
          const suggested = spots.find(
            (s) => s.id === this.data.suggestedLocationId && !s.isCoolingDown,
          );
          const fallback = spots.find((s) => !s.isCoolingDown);
          this.spotControl.setValue((suggested ?? fallback)?.id ?? null);
        }
        this.loading.set(false);
      },
      error: () => {
        // A failed lookup must not block the delivery — the volunteer can still add the
        // spot they're standing at by hand (unless a recipient is already selected).
        this.loading.set(false);
        if (!this.data.recipientName) {
          this.spotControl.setValue(NEW_SPOT);
        }
      },
    });
  }

  /** "3.2 km · 4 past deliveries" (+ cooling note) — the option's second line. */
  private spotDescription(s: DropOffHotspot): string {
    const parts = [`${s.distanceKm} km`];
    if (s.deliveryCount > 0) {
      parts.push(`${s.deliveryCount} past ${s.deliveryCount === 1 ? 'delivery' : 'deliveries'}`);
    }
    if (s.isCoolingDown) {
      parts.push('served recently, try later');
    }
    return parts.join(' · ');
  }

  protected useMyLocation(): void {
    this.locating.set(true);
    this.geo.current().subscribe({
      next: (loc) => {
        this.newCoords.set(loc);
        this.locating.set(false);
      },
      error: (err: Error) => {
        this.locating.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not get your location');
      },
    });
  }
}

/**
 * Collect the delivery photo and drop-off spot, then submit. Mirrors
 * `openPhotoDialog`'s contract — `submit` runs while the dialog is still open so a failed
 * request keeps the photo and the chosen spot for a retry.
 */
export function openDeliveryDialog(
  dialog: DialogService,
  data: DeliveryDialogData,
  submit: (photo: File, dropOff: DropOffSelection) => Observable<unknown>,
): DialogRef<void, DeliveryDialog> {
  const ref: DialogRef<void, DeliveryDialog> = dialog.open<
    DeliveryDialogData,
    void,
    DeliveryDialog
  >({
    header: {
      title: data.selfDelivery ? 'Deliver it yourself' : 'Confirm delivery',
      subtitle: data.selfDelivery
        ? 'Choose where you dropped it off and add a photo. This completes the donation.'
        : data.completesDonation
          ? 'A photo and drop-off point are required. This completes the donation.'
          : 'A photo and drop-off point are required.',
      icon: data.selfDelivery ? 'fa-solid fa-person-walking' : 'fa-solid fa-box-open',
    },
    content: DeliveryDialog,
    data,
    size: 'md',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
      {
        id: 'confirm',
        label: data.selfDelivery ? 'Mark as delivered' : 'Confirm delivery',
        icon: 'fa-solid fa-check',
        disabled: () => {
          const body = ref.body();
          return !body?.file() || !body?.dropOff();
        },
        handler: (r) => {
          const body = r.body();
          const photo = body?.file();
          const dropOff = body?.dropOff();
          if (!photo || !dropOff) {
            return;
          }
          return submit(photo, dropOff).pipe(tap(() => r.close()));
        },
      },
    ],
  });

  return ref;
}
