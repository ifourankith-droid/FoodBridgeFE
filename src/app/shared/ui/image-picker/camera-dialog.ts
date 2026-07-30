import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DialogRef } from '@shared/ui/dialog/dialog-ref';

/**
 * What the camera dialog resolves with: the captured photo, or `'browse'` when the
 * camera failed and the user asked for the file picker instead.
 */
export type CameraResult = File | 'browse';

/**
 * Body of the "Take a photo" dialog. Owns the media stream for its whole lifetime —
 * acquires it on mount, releases it on destroy — so the device's recording indicator
 * can never outlive the dialog. Capture is driven from the dialog's footer via
 * {@link capture}, which closes the dialog with the resulting File.
 */
@Component({
  selector: 'app-camera-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cam-stage">
      <!-- muted + playsinline are required for autoplay on iOS Safari. -->
      <video #video autoplay muted playsinline></video>
      @if (error(); as message) {
        <div class="cam-error">
          <i class="fa-solid fa-video-slash text-xl mb-2" aria-hidden="true"></i>
          <div class="text-sm font-semibold">{{ message }}</div>
          <button type="button" class="cam-fallback" (click)="chooseFileInstead()">
            Choose a file instead
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .cam-stage {
      position: relative;
      background: #0b0b0d;
      aspect-ratio: 4 / 3;
      display: grid;
      place-items: center;
      border-radius: 14px;
      overflow: hidden;
    }
    .cam-stage video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .cam-error {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
      color: #fff;
    }
    .cam-fallback {
      margin-top: 12px;
      padding: 8px 16px;
      border-radius: 12px;
      border: 1px solid rgb(255 255 255 / 0.35);
      background: transparent;
      color: #fff;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .cam-fallback:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
  `,
})
export class CameraDialog {
  private readonly ref = inject(DialogRef) as DialogRef<CameraResult>;

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  private readonly stream = signal<MediaStream | null>(null);
  readonly error = signal('');

  /** True once a live stream exists — the footer's Capture button reads this. */
  readonly canCapture = computed(() => !!this.stream() && !this.error());

  constructor() {
    // Attach the live stream once the <video> is in the DOM. Both operands are
    // signals, so this re-runs when the element appears — getUserMedia always
    // resolves before Angular has rendered the dialog body.
    effect(() => {
      const el = this.video()?.nativeElement;
      const stream = this.stream();
      if (el && stream && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    });

    // Releasing the camera is not optional: an un-stopped track leaves the
    // device's recording indicator on after the dialog is gone.
    inject(DestroyRef).onDestroy(() => this.stopStream());

    void this.start();
  }

  private async start(): Promise<void> {
    try {
      // `environment` asks for the rear camera on phones and is ignored on
      // desktops, which only have one.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      // The permission prompt can outlive the dialog: if it was dismissed while
      // we waited, release the device instead of holding it open.
      if (this.ref.isClosed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream.set(stream);
    } catch {
      this.error.set('Camera unavailable — permission denied or no device found.');
    }
  }

  /** Grab the current frame and close with it. Called by the dialog's Capture action. */
  capture(): void {
    const el = this.video()?.nativeElement;
    if (!el?.videoWidth) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);

    // The backend accepts JPEG/PNG; JPEG at 0.9 keeps captures well under the
    // size cap without visible loss.
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('Could not capture the frame — try again.');
          return;
        }
        this.ref.close(new File([blob], `capture-${stamp()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  protected chooseFileInstead(): void {
    this.ref.close('browse');
  }

  private stopStream(): void {
    this.stream()?.getTracks().forEach((track) => track.stop());
    this.stream.set(null);
    const el = this.video()?.nativeElement;
    if (el) {
      el.srcObject = null;
    }
  }
}

/** Filename-safe timestamp, so captures don't all collide on one name. */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
