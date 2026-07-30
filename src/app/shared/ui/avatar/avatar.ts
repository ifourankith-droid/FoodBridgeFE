import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { initials as toInitials } from '@shared/util/initials';

/**
 * Circular avatar. Shows the user's photo when `imageUrl` is provided, otherwise
 * falls back to two-letter initials on a brand gradient.
 *
 * @example
 * <app-avatar [name]="user.name" [imageUrl]="user.avatarUrl" [size]="40" />
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.fontSize.px]="size() * 0.36"
    >
      @if (showImage()) {
        <img [src]="imageUrl()" [alt]="name() || 'Avatar'" (error)="onImageError()" />
      } @else {
        {{ initials() }}
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 50%;
      color: #fff;
      font-weight: 700;
      line-height: 1;
      overflow: hidden;
      background: linear-gradient(135deg, var(--fb-primary), var(--fb-primary-deep));
      user-select: none;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class Avatar {
  readonly name = input<string | null | undefined>('');
  readonly imageUrl = input<string | null | undefined>(null);

  /** Diameter in pixels. */
  readonly size = input(40);

  protected readonly initials = computed(() => toInitials(this.name()));

  /** URL that failed to load — kept so a new/changed URL retries automatically. */
  private readonly failedUrl = signal<string | null>(null);

  protected readonly showImage = computed(() => {
    const url = this.imageUrl();
    return !!url && url !== this.failedUrl();
  });

  protected onImageError(): void {
    this.failedUrl.set(this.imageUrl() ?? null);
    console.log('Avatar name:', this.name());
  }
}
