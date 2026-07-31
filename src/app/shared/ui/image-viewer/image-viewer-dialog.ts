import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { DialogService } from '@core/services/dialog.service';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';

/** Data for {@link openImageDialog}: the picture and the item name shown as the heading. */
export interface ImageViewerData {
  title: string;
  imageUrl: string;
}

/**
 * Body of the shared image viewer. Just the picture, sized to the dialog; the item
 * name rides in the dialog header (set by {@link openImageDialog}).
 */
@Component({
  selector: 'app-image-viewer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="iv-wrap">
      <img class="iv-img" [src]="data.imageUrl" [alt]="data.title" />
    </div>
  `,
  styles: `
    /* Fixed viewing area so the dialog body never scrolls — the image is scaled
       to fit inside it whatever its aspect ratio. */
    .iv-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 55vh;
      max-height: 460px;
      background: var(--fb-bg);
      border-radius: 12px;
      overflow: hidden;
    }
    .iv-img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }
  `,
})
export class ImageViewerDialog {
  protected readonly data = inject<ImageViewerData>(DIALOG_DATA);
}

/**
 * Open the shared image viewer through the common {@link DialogService}. The item's
 * name is the dialog heading; a single "Close" action dismisses it.
 */
export function openImageDialog(
  dialog: DialogService,
  data: ImageViewerData,
): DialogRef<void, ImageViewerDialog> {
  return dialog.open<ImageViewerData, void, ImageViewerDialog>({
    header: { title: data.title, icon: 'fa-solid fa-image' },
    content: ImageViewerDialog,
    data,
    size: 'lg',
    actions: [{ id: 'close', label: 'Close', variant: 'ghost', close: true }],
  });
}
