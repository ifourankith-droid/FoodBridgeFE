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
import { FbInput } from '@shared/ui/input/input';
import { ImagePicker } from '@shared/ui/image-picker/image-picker';

export interface DeliveryDialogData {
  /** Where to centre the hotspot search — the listing's pickup point. */
  latitude: number;
  longitude: number;
  /** Pre-select this spot (the one confirm-pickup already suggested), when still available. */
  suggestedLocationId?: string | null;
  /** True when this confirmation completes the donation outright (no recipient waiting). */
  completesDonation: boolean;
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
  imports: [ImagePicker, FbButton, FbInput, ReactiveFormsModule],
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
        <span class="fb-field-label">Where did you drop it off?</span>

        @if (loading()) {
          <p class="fb-help"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Finding nearby spots…</p>
        }

        @for (spot of spots(); track spot.id) {
          <button
            type="button"
            class="spot"
            [class.selected]="selectedId() === spot.id"
            [class.cooling]="spot.isCoolingDown"
            [disabled]="spot.isCoolingDown"
            (click)="pickExisting(spot.id)"
          >
            <i class="fa-solid" [class.fa-circle-check]="selectedId() === spot.id"
               [class.fa-location-dot]="selectedId() !== spot.id"></i>
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate font-bold">{{ spot.name }}</span>
              <span class="block truncate text-xs text-muted">
                {{ spot.distanceKm }} km
                @if (spot.deliveryCount > 0) {
                  · {{ spot.deliveryCount }} past
                  {{ spot.deliveryCount === 1 ? 'delivery' : 'deliveries' }}
                }
                @if (spot.isCoolingDown) {
                  · served recently, try later
                }
              </span>
            </span>
          </button>
        }

        <!-- Always offered: the whole point is that a volunteer on the ground knows
             places the platform doesn't yet. -->
        <button
          type="button"
          class="spot"
          [class.selected]="isNew()"
          (click)="startNew()"
        >
          <i class="fa-solid" [class.fa-circle-check]="isNew()" [class.fa-plus]="!isNew()"></i>
          <span class="text-left font-bold">Somewhere else — add a new spot</span>
        </button>

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
      .spot {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--fb-line);
        border-radius: 12px;
        background: var(--fb-surface);
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .spot:hover:not(:disabled) {
        border-color: var(--fb-primary);
      }
      .spot.selected {
        border-color: var(--fb-primary);
        background: var(--fb-primary-soft);
      }
      .spot.cooling {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .spot > i {
        color: var(--fb-primary);
      }
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
  protected readonly selectedId = signal<string | null>(null);
  protected readonly isNew = signal(false);
  protected readonly newCoords = signal<{ lat: number; lng: number } | null>(null);
  protected readonly locating = signal(false);

  /** Reactive control per project convention; mirrored into a signal for `dropOff`. */
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(200)],
  });
  private readonly newName = signal('');

  /**
   * The choice to submit, or null while it's incomplete — the footer's Confirm reads this,
   * so an unnamed or un-located new spot can't be sent (the backend would 422 it anyway).
   */
  readonly dropOff = computed<DropOffSelection | null>(() => {
    if (this.isNew()) {
      const name = this.newName().trim();
      const coords = this.newCoords();
      return name && coords
        ? { latitude: coords.lat, longitude: coords.lng, name }
        : null;
    }
    const id = this.selectedId();
    return id ? { locationId: id } : null;
  });

  constructor() {
    this.nameControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.newName.set(value));

    this.dropOffs.hotspots(this.data.latitude, this.data.longitude).subscribe({
      next: (spots) => {
        this.spots.set(spots);
        // Prefer the spot confirm-pickup already suggested; otherwise the backend's first
        // row, which is ordered available-first then nearest. Never auto-pick a cooling one.
        const suggested = spots.find(
          (s) => s.id === this.data.suggestedLocationId && !s.isCoolingDown,
        );
        const fallback = spots.find((s) => !s.isCoolingDown);
        this.selectedId.set((suggested ?? fallback)?.id ?? null);
        this.loading.set(false);
      },
      error: () => {
        // A failed lookup must not block the delivery — the volunteer can still add the
        // spot they're standing at by hand.
        this.loading.set(false);
        this.isNew.set(true);
      },
    });
  }

  protected pickExisting(id: string): void {
    this.isNew.set(false);
    this.selectedId.set(id);
  }

  protected startNew(): void {
    this.isNew.set(true);
    this.selectedId.set(null);
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
      title: 'Confirm delivery',
      subtitle: data.completesDonation
        ? 'A photo and drop-off point are required. This completes the donation.'
        : 'A photo and drop-off point are required.',
      icon: 'fa-solid fa-box-open',
    },
    content: DeliveryDialog,
    data,
    size: 'md',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
      {
        id: 'confirm',
        label: 'Confirm delivery',
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
