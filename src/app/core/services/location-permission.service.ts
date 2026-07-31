import { inject, Injectable } from '@angular/core';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { LocationPermissionModal } from '@shared/ui/location-permission-modal/location-permission-modal';
import { DialogService } from './dialog.service';
import { GeolocationService } from './geolocation.service';

/**
 * Raises the shared "Turn on location" guidance modal when the browser has
 * blocked location access, and resolves once the user acts on it.
 *
 * Extracted from {@link AvailabilityService} so the same dialog (and its
 * grant-and-auto-retry behaviour) backs both "go active" and every "Use current
 * location" button — a consistent recovery path whenever a location action is
 * blocked, instead of a dead-end toast.
 */
@Injectable({ providedIn: 'root' })
export class LocationPermissionService {
  private readonly dialog = inject(DialogService);
  private readonly geo = inject(GeolocationService);

  /** The open dialog + its in-flight promise, so concurrent callers share one modal. */
  private ref: DialogRef<boolean, LocationPermissionModal> | null = null;
  private pending: Promise<boolean> | null = null;

  /** True while the "turn on location" dialog is open. */
  get isOpen(): boolean {
    return this.ref !== null;
  }

  /**
   * Show the guidance modal and resolve when it closes: `true` if the user pressed
   * "Try again" (or granted permission from the browser UI, which auto-retries),
   * `false` if they dismissed it. Callers use the result to re-attempt the action.
   *
   * Opening while already open returns the existing dialog's promise — never a
   * second stacked modal.
   *
   * @param title Dialog heading; defaults to the go-active wording.
   */
  prompt(title = 'Turn on location to go active'): Promise<boolean> {
    if (this.pending) {
      return this.pending;
    }
    this.pending = new Promise<boolean>((resolve) => {
      const ref = this.dialog.open<unknown, boolean, LocationPermissionModal>({
        header: { title, icon: 'fa-solid fa-location-crosshairs' },
        content: LocationPermissionModal,
        size: 'sm',
        actions: [
          { id: 'later', label: 'Not now', variant: 'ghost', close: true, result: false },
          {
            id: 'retry',
            label: 'Try again',
            icon: 'fa-solid fa-rotate-right',
            close: true,
            result: true,
          },
        ],
      });
      this.ref = ref;
      ref.closed.subscribe((retry) => {
        this.ref = null;
        this.pending = null;
        resolve(!!retry);
      });

      // Auto-retry the moment the user grants permission from the browser UI.
      this.geo.permissionStatus().then((status) => {
        if (!status) {
          return;
        }
        const onChange = () => {
          if (status.state === 'granted' && this.ref === ref) {
            status.removeEventListener('change', onChange);
            // Close with `true` so it runs the caller's retry path.
            ref.close(true);
          } else if (status.state !== 'prompt') {
            status.removeEventListener('change', onChange);
          }
        };
        status.addEventListener('change', onChange);
      });
    });
    return this.pending;
  }
}
