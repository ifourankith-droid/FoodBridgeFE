import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, tap } from 'rxjs';
import { DropOffHotspot } from '@core/models/dropoff-location.model';
import type { DropOffSelection } from '@core/services/listing.service';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import type { DialogService } from '@core/services/dialog.service';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { FbInput, FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';
import { IMAGE_ACCEPT, ImagePicker } from '@shared/ui/image-picker/image-picker';
import { LocationPicker } from '@shared/ui/location-picker/location-picker';
import type { FbLatLng } from '@shared/ui/map/fb-map.model';

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
 * "somewhere new" branch carrying its own {@link LocationPicker} map.
 */
@Component({
  selector: 'app-delivery-dialog',
  imports: [ImagePicker, FbInput, FbSelect, LocationPicker, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <app-image-picker
        [hint]="
          data.completesDonation
            ? 'Photograph the drop-off — this is the delivery record.'
            : 'Photograph the handover, so the recipient can confirm it.'
        "
        [accept]="imageAccept"
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

            <!-- The map, not just the GPS button: this spot is saved and then
                 suggested to every volunteer who delivers nearby, so a
                 coordinate nobody can check is the wrong thing to store. The pin
                 starts over the listing's pickup area and a silent GPS fix moves
                 it to where the volunteer actually is, making the common case
                 "confirm the pin" rather than "find yourself on a map". -->
            <app-location-picker
              [center]="pickupPoint"
              [location]="newCoords()"
              [height]="220"
              [zoom]="16"
              [autoLocate]="true"
              buttonLabel="Use my location"
              placeholderText="Mark the drop-off point"
              permissionPrompt="Turn on location to mark the drop-off point"
              coordsLabel="Dropped at"
              emptyHint="Drag the pin — or tap the map — to mark where you left the food."
              (locationChange)="onPin($event)"
              (addressResolved)="newAddress.set($event.address)"
            />

            <!-- Additive, not a second copy of the coordinates: the picker prints
                 the numbers, this names the place they landed on. -->
            @if (newAddress(); as a) {
              <span class="fb-help !mt-0">
                <i class="fa-solid fa-check mr-1 text-success"></i>{{ a }}
              </span>
            }
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
  protected readonly imageAccept = IMAGE_ACCEPT;
  private readonly dropOffs = inject(DropOffLocationService);

  readonly file = signal<File | null>(null);

  protected readonly spots = signal<DropOffHotspot[]>([]);
  protected readonly loading = signal(true);
  /** Stays null until the volunteer actually places the pin — see {@link pinLocation}. */
  protected readonly newCoords = signal<FbLatLng | null>(null);
  /** Reverse-geocoded street address for {@link newCoords}, when one resolved. */
  protected readonly newAddress = signal('');

  /**
   * Where the map looks before anything is picked — the listing's pickup area,
   * which any real drop-off is near. Passed as the picker's `center`, never as
   * its `location`: treating it as a picked point would count the *pickup* spot
   * as the drop-off and let Confirm through with a location nobody looked at.
   */
  protected readonly pickupPoint: FbLatLng = {
    lat: this.data.latitude,
    lng: this.data.longitude,
  };

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
      if (!name || !coords) {
        return null;
      }
      // `address` was always on the wire contract and never populated; the map's
      // reverse geocode fills it, so a saved spot carries something a human can
      // read rather than a bare coordinate pair.
      const address = this.newAddress().trim();
      return {
        latitude: coords.lat,
        longitude: coords.lng,
        name,
        ...(address ? { address } : {}),
      };
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

  /**
   * A point the volunteer placed — by dragging, tapping the map, or the GPS
   * button. Clears the previous address so a stale one can't be attached to a
   * pin that has since moved; the picker re-geocodes and refills it.
   */
  protected onPin(pos: FbLatLng): void {
    this.newCoords.set(pos);
    this.newAddress.set('');
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
