import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import type { DialogService } from '@core/services/dialog.service';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { ImagePicker, ImageSource } from './image-picker';

/** Everything the photo dialog's body renders. Passed as the dialog's `data`. */
export interface PhotoDialogData {
  hint?: string;
  placeholder?: string;
  /** Offer the file picker, the camera, or both (the default). */
  sources?: ImageSource;
  accept?: string;
  maxSizeMb?: number;
}

/**
 * Body of the "add a photo" dialog — nothing but an {@link ImagePicker}, so the
 * zone, the camera route, the preview and its replace/retake/remove actions are
 * character-for-character what the new-listing form shows.
 *
 * Opened through {@link openPhotoDialog}; the footer reads {@link file} to decide
 * whether Confirm is live.
 */
@Component({
  selector: 'app-photo-dialog',
  imports: [ImagePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-image-picker
      [sources]="data.sources ?? 'both'"
      [hint]="data.hint ?? ''"
      [placeholder]="data.placeholder ?? ''"
      [accept]="data.accept ?? 'image/jpeg,image/png'"
      [maxSizeMb]="data.maxSizeMb ?? 5"
      (fileChange)="file.set($event)"
    />
  `,
})
export class PhotoDialog {
  protected readonly data = inject<PhotoDialogData>(DIALOG_DATA);

  /** The photo currently held by the picker, or null while it is still empty. */
  readonly file = signal<File | null>(null);
}

export interface PhotoDialogOptions extends PhotoDialogData {
  title?: string;
  subtitle?: string;
  icon?: string;
  confirmLabel?: string;
  /**
   * Where the photo goes. Return the upload here rather than uploading after
   * the dialog closes: the dialog stays open until it emits, so a failed
   * request can be retried against the photo already taken instead of making
   * the user shoot it again. Omit to have the dialog simply close with the file.
   */
  submit?: (file: File) => Observable<unknown>;
}

/**
 * Collect one photo in a modal. The single way to ask for an image outside a
 * form — pickup and delivery confirmations and the profile avatar all go
 * through it, so "upload or take a photo" behaves identically everywhere.
 *
 * @example
 * openPhotoDialog(this.dialog, {
 *   title: 'Confirm pickup',
 *   confirmLabel: 'Confirm pickup',
 *   submit: (photo) => this.store.confirmPickup(id, photo),
 * });
 */
export function openPhotoDialog(
  dialog: DialogService,
  options: PhotoDialogOptions = {},
): DialogRef<File | undefined, PhotoDialog> {
  const { title, subtitle, icon, confirmLabel, submit, ...data } = options;

  // Annotated because `disabled` below reads `ref`, which would otherwise make
  // the initializer self-referential and infer `any`.
  const ref: DialogRef<File | undefined, PhotoDialog> = dialog.open<
    PhotoDialogData,
    File | undefined,
    PhotoDialog
  >({
    header: {
      title: title ?? 'Add a photo',
      subtitle,
      icon: icon ?? 'fa-solid fa-camera',
    },
    content: PhotoDialog,
    data,
    size: 'md',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
      {
        id: 'confirm',
        label: confirmLabel ?? 'Use this photo',
        icon: 'fa-solid fa-check',
        disabled: () => !ref.body()?.file(),
        handler: (r) => {
          const file = r.body()?.file();
          if (!file) {
            return;
          }
          if (!submit) {
            r.close(file);
            return;
          }
          return submit(file).pipe(tap(() => r.close(file)));
        },
      },
    ],
  });

  return ref;
}
