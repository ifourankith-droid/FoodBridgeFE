import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DialogService } from '@core/services/dialog.service';
import type { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { CameraDialog, CameraResult } from './camera-dialog';

/**
 * Which ways of supplying an image this instance offers.
 *
 * `camera` degrades to `upload` where getUserMedia isn't available (insecure
 * origins, some in-app browsers) — a field that offered no working path at all
 * would simply be a dead end.
 */
export type ImageSource = 'both' | 'upload' | 'camera';

/**
 * Every image format a browser can both pick and render, listed by MIME type
 * **and** by extension — the default for every image field in the app, and the
 * mirror of `ImageFileTypes` on the backend.
 *
 * The extensions are not redundant. Windows reports `.jfif` (what Chrome's "Save
 * image as" writes) as `image/pjpeg`, and sometimes as nothing at all, so a
 * MIME-only list hides those files in the picker and then rejects them on drop —
 * which is exactly the bug this replaced. `accept` takes either form, and
 * {@link ImagePicker} validates against both.
 *
 * SVG is left out on purpose: it's a scriptable document, not a picture, so
 * serving user-supplied ones back is stored XSS. HEIC/TIFF are left out because
 * they upload fine and then show as a broken image in most desktop browsers.
 */
export const IMAGE_ACCEPT =
  'image/jpeg,image/pjpeg,image/png,image/apng,image/webp,image/avif,image/gif,image/bmp,' +
  '.jpg,.jpeg,.jfif,.jif,.jpe,.pjpeg,.pjp,.png,.apng,.webp,.avif,.gif,.bmp,.dib';

/** {@link IMAGE_ACCEPT} plus PDF, for fields where a scan is as good as a photo. */
export const IMAGE_OR_PDF_ACCEPT = `${IMAGE_ACCEPT},application/pdf,.pdf`;

/** Every spelling of JPEG collapses to one label, so the hint reads "JPG", once. */
const JPEG_ALIASES = new Set(['jpg', 'jpeg', 'jfif', 'jif', 'jpe', 'pjpeg', 'pjp']);

/**
 * Pick an image by file, drag-and-drop, or the device camera, then preview and
 * remove it. One component for every image field in the app.
 *
 * The parent gets the raw `File` and owns the upload — this component never
 * touches the network, so it works the same for upload-on-pick (avatar) and
 * hold-until-submit (a new listing) flows. To collect a photo in a modal
 * instead of inline, use `openPhotoDialog()`, which wraps this.
 *
 * @example
 * <app-image-picker
 *   label="Food photo"
 *   hint="Helps volunteers recognise the food."
 *   [existingUrl]="listing.imageUrl"
 *   (fileChange)="photoFile = $event" />
 * <app-image-picker sources="camera" label="Proof of delivery" />
 */
@Component({
  selector: 'app-image-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (label()) {
      <label class="small-label mb-2 block" [attr.for]="inputId">
        {{ label() }}
        @if (required()) {
          <span class="req" aria-hidden="true">*</span>
        }
      </label>
    }

    <!-- ---------- Preview ---------- -->
    @if (previewSrc(); as src) {
      <figure class="preview" [class.is-avatar]="shape() === 'avatar'">
        @if (isDocument()) {
          <!-- A PDF in an <img> is just a broken image, so documents get a tile
               with their icon and file name, linked so it can still be checked. -->
          <a
            class="doc"
            [href]="src"
            target="_blank"
            rel="noopener"
            title="Open in a new tab"
          >
            <span class="zone-icon doc-icon">
              <i class="fa-regular fa-file-pdf" aria-hidden="true"></i>
            </span>
            <span class="doc-name">{{ documentName() }}</span>
          </a>
        } @else {
          <img [src]="src" [alt]="previewAlt()" />
        }

        <figcaption class="bar">
          <span class="meta">
            <i
              [class]="isDocument() ? 'fa-regular fa-file-pdf' : 'fa-regular fa-image'"
              aria-hidden="true"
            ></i>
            <span class="meta-text">{{ metaLabel() }}</span>
          </span>
          <span class="bar-actions">
            @if (uploadAllowed()) {
              <button
                type="button"
                class="icon-btn"
                title="Replace image"
                aria-label="Replace image"
                [disabled]="disabled()"
                (click)="browse()"
              >
                <i class="fa-solid fa-rotate" aria-hidden="true"></i>
              </button>
            }
            @if (cameraSupported()) {
              <button
                type="button"
                class="icon-btn"
                title="Retake with camera"
                aria-label="Retake with camera"
                [disabled]="disabled()"
                (click)="openCamera()"
              >
                <i class="fa-solid fa-camera" aria-hidden="true"></i>
              </button>
            }
            <button
              type="button"
              class="icon-btn is-danger"
              title="Remove image"
              aria-label="Remove image"
              [disabled]="disabled()"
              (click)="remove()"
            >
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          </span>
        </figcaption>
      </figure>
    } @else {
      <!-- ---------- Empty: drop zone ---------- -->
      <div
        class="zone-wrap"
        [class.is-drag]="dragging()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <button
          type="button"
          class="zone"
          [class.is-avatar]="shape() === 'avatar'"
          [class.has-error]="!!message()"
          [disabled]="disabled()"
          (click)="cameraOnly() ? openCamera() : browse()"
        >
          <span class="zone-icon">
            <i
              [class]="cameraOnly() ? 'fa-solid fa-camera' : 'fa-solid fa-cloud-arrow-up'"
              aria-hidden="true"
            ></i>
          </span>
          <span class="zone-title">{{ resolvedPlaceholder() }}</span>
          <span class="zone-sub">{{ zoneSub() }}</span>
        </button>

        <!-- Only a secondary route to the camera — when the zone itself is the
             camera there is nothing left for it to offer. -->
        @if (cameraSupported() && !cameraOnly()) {
          <!-- Outside the zone button: nesting interactive elements would break
               keyboard and screen-reader semantics. -->
          <button
            type="button"
            class="cam-btn"
            [disabled]="disabled()"
            (click)="openCamera()"
          >
            <i class="fa-solid fa-camera" aria-hidden="true"></i>Take photo
          </button>
        }
      </div>
    }

    @if (message(); as m) {
      <p class="msg is-error" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>{{ m }}
      </p>
    } @else if (hint()) {
      <p class="msg">{{ hint() }}</p>
    }

    <input
      #fileInput
      [id]="inputId"
      type="file"
      class="sr-file"
      [accept]="accept()"
      [disabled]="disabled()"
      (change)="onFileInput($event)"
    />

  `,
  styles: `
    .req {
      color: #ef4444;
      margin-left: 2px;
    }
    /* Kept in the layout (not [hidden]) so the label's "for" association stays
       valid, but visually removed — clicks are proxied from the zone button. */
    .sr-file {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    /* ---------- Drop zone ---------- */
    .zone-wrap {
      position: relative;
      border-radius: var(--fb-radius);
    }
    .zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      width: 100%;
      padding: 26px 18px;
      border: 1.5px dashed var(--fb-line);
      border-radius: var(--fb-radius);
      background: var(--fb-bg);
      color: var(--fb-ink);
      cursor: pointer;
      text-align: center;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .zone:hover:not(:disabled) {
      border-color: var(--fb-primary);
      background: rgb(var(--fb-primary-rgb) / 0.05);
    }
    .zone:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
      border-color: var(--fb-primary);
    }
    .zone:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .zone.has-error {
      border-color: #ef4444;
    }
    .is-drag .zone {
      border-color: var(--fb-primary);
      background: rgb(var(--fb-primary-rgb) / 0.1);
    }
    .zone.is-avatar {
      width: 132px;
      height: 132px;
      border-radius: 50%;
      padding: 12px;
      margin-inline: auto;
    }
    .zone-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      margin-bottom: 5px;
      border-radius: 13px;
      font-size: 17px;
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
      box-shadow: inset 0 0 0 1px rgb(var(--fb-primary-rgb) / 0.2);
    }
    .zone-title {
      font-size: 13.5px;
      font-weight: 600;
    }
    .zone-sub {
      font-size: 11.5px;
      color: var(--fb-muted);
    }
    .zone.is-avatar .zone-sub {
      display: none;
    }

    .cam-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin: 9px auto 0;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid var(--fb-line);
      background: var(--fb-surface);
      color: var(--fb-ink);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .zone-wrap {
      display: flex;
      flex-direction: column;
    }
    .cam-btn:hover:not(:disabled) {
      border-color: var(--fb-primary);
      background: rgb(var(--fb-primary-rgb) / 0.07);
    }
    .cam-btn:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }

    /* ---------- Preview ---------- */
    .preview {
      position: relative;
      margin: 0;
      border-radius: var(--fb-radius);
      overflow: hidden;
      border: 1px solid var(--fb-line);
      background: var(--fb-bg);
    }
    .preview img {
      display: block;
      width: 100%;
      max-height: 260px;
      object-fit: cover;
    }
    /* ---------- Document (non-image) preview ----------
       The tile borrows .zone-icon for the square and only re-tints it, so this
       stays within the component's style budget. */
    .doc {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      /* Colour and underline: preflight already makes anchors inherit both. */
      background: var(--fb-bg);
    }
    .doc-icon {
      margin: 0;
      background: rgb(239 68 68 / 0.12);
      color: #dc2626;
      box-shadow: none;
    }
    .doc-name {
      min-width: 0;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview.is-avatar {
      width: 132px;
      height: 132px;
      border-radius: 50%;
      margin-inline: auto;
    }
    .preview.is-avatar img {
      height: 100%;
      max-height: none;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      background: var(--fb-surface);
      border-top: 1px solid var(--fb-line);
    }
    /* On the circular variant the caption floats over the bottom of the image
       instead of adding a strip below it. */
    .preview.is-avatar .bar {
      position: absolute;
      inset: auto 0 0 0;
      justify-content: center;
      padding: 5px;
      border-top: 0;
      background: rgb(0 0 0 / 0.55);
      backdrop-filter: blur(3px);
    }
    .preview.is-avatar .meta {
      display: none;
    }
    .meta {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-size: 12px;
      color: var(--fb-muted);
    }
    .meta-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar-actions {
      display: inline-flex;
      gap: 4px;
      flex: none;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--fb-muted);
      font-size: 12.5px;
      cursor: pointer;
      transition:
        background 0.15s ease,
        color 0.15s ease;
    }
    .icon-btn:hover:not(:disabled) {
      background: rgb(var(--fb-primary-rgb) / 0.1);
      color: var(--fb-primary-deep);
    }
    .icon-btn.is-danger:hover:not(:disabled) {
      background: rgb(239 68 68 / 0.12);
      color: #ef4444;
    }
    .icon-btn:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .preview.is-avatar .icon-btn {
      color: #fff;
    }
    .preview.is-avatar .icon-btn:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.22);
      color: #fff;
    }

    /* ---------- Messages ---------- */
    .msg {
      margin: 7px 0 0;
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--fb-muted);
    }
    .msg.is-error {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ef4444;
      font-weight: 600;
    }

    /* ---------- Camera sheet ---------- */
    @media (prefers-reduced-motion: reduce) {
      .zone,
      .cam-btn,
      .icon-btn {
        transition: none;
      }
    }
  `,
})
export class ImagePicker {
  private readonly dialog = inject(DialogService);

  readonly label = input('');
  readonly hint = input('');
  readonly accept = input(IMAGE_ACCEPT);
  readonly maxSizeMb = input(5);
  readonly disabled = input(false);
  readonly required = input(false);
  /** Overrides the wording in the empty zone; defaults per {@link sources}. */
  readonly placeholder = input('');
  /** Parent-supplied error (e.g. "photo required" from form validation). */
  readonly error = input('');
  /** Already-stored image to show until the user picks a new one. */
  readonly existingUrl = input<string | null>(null);
  /** `avatar` renders a circular 132px well; `wide` a full-width drop zone. */
  readonly shape = input<'wide' | 'avatar'>('wide');
  /** Which input routes to offer: file, camera, or both (the default). */
  readonly sources = input<ImageSource>('both');

  /** Emits the chosen file, or null when cleared. */
  readonly fileChange = output<File | null>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly inputId = `fb-image-${nextId++}`;

  private readonly selected = signal<File | null>(null);
  /** Blob URL for `selected`; owned here so it can be revoked. */
  private readonly objectUrl = signal<string | null>(null);
  private readonly validationError = signal('');

  protected readonly dragging = signal(false);

  /**
   * getUserMedia is undefined on insecure origins and in some in-app browsers,
   * so the camera path is offered only where it can actually work.
   */
  protected readonly cameraSupported = computed(
    () =>
      this.sources() !== 'upload' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia,
  );

  /** The camera is the only route — so the empty zone opens it directly. */
  protected readonly cameraOnly = computed(
    () => this.sources() === 'camera' && this.cameraSupported(),
  );

  /**
   * File picking stays available whenever it was asked for, and also when
   * `camera` was asked for but this browser can't deliver one — better a
   * fallback than a field nothing can fill.
   */
  protected readonly uploadAllowed = computed(() => !this.cameraOnly());

  protected readonly resolvedPlaceholder = computed(() => {
    const supplied = this.placeholder();
    if (supplied) {
      return supplied;
    }
    if (this.cameraOnly()) {
      return 'Take a photo';
    }
    // "image" would be wrong where a PDF is allowed too (e.g. an ID proof).
    return this.accept().toLowerCase().includes('application/')
      ? 'Click to upload, or drop a file here'
      : 'Click to upload, or drop an image here';
  });

  protected readonly zoneSub = computed(() =>
    this.cameraOnly()
      ? 'Uses your device camera'
      : `${this.acceptLabel()} · up to ${this.maxSizeMb()} MB`,
  );

  protected readonly previewSrc = computed(() => this.objectUrl() ?? this.existingUrl());

  protected readonly previewAlt = computed(() =>
    this.selected() ? `Selected image: ${this.selected()!.name}` : 'Current image',
  );

  /**
   * True when what we're previewing isn't an image — an ID proof may be a PDF.
   * Those can't be shown in an `<img>`, so the template renders a file tile
   * instead of a broken image.
   */
  protected readonly isDocument = computed(() => {
    const file = this.selected();
    if (file) {
      // Asks "is it a PDF?", not "is it missing an image/ type?" — the OS leaves
      // that type blank for formats it doesn't recognise (.jfif, .avif on older
      // Windows), and those are pictures an <img> renders perfectly well.
      return file.type.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
    }
    const url = this.existingUrl();
    return !!url && /\.pdf(?:[?#]|$)/i.test(url);
  });

  /** File name for the document tile; a stored file has only its URL to go on. */
  protected readonly documentName = computed(() => {
    const file = this.selected();
    if (file) {
      return file.name;
    }
    const url = this.existingUrl() ?? '';
    return decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '') || 'Document';
  });

  protected readonly message = computed(() => this.validationError() || this.error());

  protected readonly metaLabel = computed(() => {
    const file = this.selected();
    if (file) {
      return `${file.name} · ${formatBytes(file.size)}`;
    }
    return this.isDocument() ? 'Current document' : 'Current image';
  });

  /**
   * "JPG, PNG, WEBP and more" from the accept list, for the hint line and the
   * rejection message. Entries may be MIME types or extensions and the same
   * format appears as both, so it dedupes; and the full image list is a dozen
   * entries, which would swamp an 11px hint — hence the cut-off.
   */
  protected readonly acceptLabel = computed(() => {
    const names = new Set<string>();
    for (const entry of this.accept().split(',')) {
      const token = entry.trim().toLowerCase();
      const name = token.startsWith('.') ? token.slice(1) : token.split('/')[1];
      if (!name || name === '*') {
        continue;
      }
      names.add(JPEG_ALIASES.has(name) ? 'JPG' : name.toUpperCase());
    }
    const all = [...names];
    if (!all.length) {
      return 'Image';
    }
    const shown = all.slice(0, 3);
    return all.length > shown.length ? `${shown.join(', ')} and more` : shown.join(' or ');
  });

  constructor() {
    // A blob URL survives until revoked; without this every replace leaks one
    // for the lifetime of the page.
    effect((onCleanup) => {
      const url = this.objectUrl();
      onCleanup(() => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    });

  }

  /**
   * Not gated on {@link uploadAllowed}: the template hides every entry point in
   * camera-only mode, but the camera dialog's own "choose a file instead"
   * fallback still needs a way through when the device refuses the camera.
   */
  protected browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Reset so re-picking the same file still fires `change`.
    input.value = '';
    if (file) {
      this.accept_(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled() || !this.uploadAllowed()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled() || !this.uploadAllowed()) {
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.accept_(file);
    }
  }

  protected remove(): void {
    this.setFile(null);
    this.validationError.set('');
  }

  // ---- Camera ----

  /**
   * Open the camera as a real modal dialog. `CameraDialog` owns the media stream and
   * resolves with the captured photo — or with `'browse'` when the camera failed and
   * the user asked for the file picker instead.
   */
  protected openCamera(): void {
    if (this.disabled() || !this.cameraSupported()) {
      return;
    }
    // Annotated because `disabled` below reads `ref`, which would otherwise make
    // the initializer self-referential and infer `any`.
    const ref: DialogRef<CameraResult, CameraDialog> = this.dialog.open<
      unknown,
      CameraResult,
      CameraDialog
    >({
      header: { title: 'Take a photo', icon: 'fa-solid fa-camera' },
      content: CameraDialog,
      size: 'md',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
        {
          id: 'capture',
          label: 'Capture',
          icon: 'fa-solid fa-camera',
          disabled: () => !ref.body()?.canCapture(),
          handler: (r) => r.body()?.capture(),
        },
      ],
    });

    ref.closed.subscribe((result) => {
      if (result === 'browse') {
        this.browse();
      } else if (result) {
        this.accept_(result);
      }
    });
  }

  // ---- Validation + state ----

  /** Validate then store. Named with a trailing _ to avoid clashing with `accept`. */
  private accept_(file: File): void {
    const error = this.validate(file);
    if (error) {
      this.validationError.set(error);
      // Leave any previous image in place — a rejected pick shouldn't destroy
      // a good one the user already had.
      return;
    }
    this.validationError.set('');
    this.setFile(file);
  }

  private validate(file: File): string {
    const allowed = this.accept()
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '';
    // Either axis is enough. The OS decides what MIME type a file gets, and it
    // gets it wrong often — a .jfif arrives as image/pjpeg on Windows and with
    // an empty type on some others — so a type-only check rejects real photos
    // that the picker itself was happy to offer.
    const typeOk =
      !allowed.length ||
      allowed.some((a) => {
        if (a.startsWith('.')) {
          return a === extension;
        }
        if (a.endsWith('/*')) {
          return !!type && type.startsWith(a.slice(0, -1));
        }
        return a === type;
      });
    if (!typeOk) {
      return `That file is not supported. Use ${this.acceptLabel()}.`;
    }
    const max = this.maxSizeMb() * 1024 * 1024;
    if (file.size > max) {
      return `That file is ${formatBytes(file.size)} — the limit is ${this.maxSizeMb()} MB.`;
    }
    return '';
  }

  private setFile(file: File | null): void {
    this.selected.set(file);
    this.objectUrl.set(file ? URL.createObjectURL(file) : null);
    this.fileChange.emit(file);
  }
}

let nextId = 0;

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
