import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly icon: string;
  readonly title: string;
  readonly message: string;
  readonly duration: number;
}

const DEFAULT_DURATION = 3200;
const MAX_VISIBLE = 4;

const DEFAULT_ICON: Record<ToastType, string> = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
};

const DEFAULT_TITLE: Record<ToastType, string> = {
  success: 'Success',
  error: 'Something went wrong',
  warning: 'Heads up',
  info: 'Notice',
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Stack of active toasts, newest last. */
  readonly toasts = signal<readonly Toast[]>([]);

  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(message: string, title?: string): number {
    return this.push('success', message, title);
  }

  error(message: string, title?: string): number {
    return this.push('error', message, title);
  }

  warning(message: string, title?: string): number {
    return this.push('warning', message, title);
  }

  info(message: string, title?: string): number {
    return this.push('info', message, title);
  }

  /**
   * Backwards-compatible entry point. Existing callers pass a Font Awesome
   * icon class and a message; the toast type (and its accent colour) is
   * inferred from the icon so those calls light up correctly without changes.
   *
   * Pass `type` whenever the icon describes the *subject* rather than the
   * outcome — a successful cancellation carries `fa-ban` but is not a failure,
   * and inference has no way to know that. The guess is a convenience, not a
   * contract: an explicit type always wins.
   */
  show(icon: string, message: string, type?: ToastType): number {
    return this.enqueue({
      type: type ?? this.inferType(icon),
      icon,
      message,
    });
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.toasts.set([]);
  }

  private push(type: ToastType, message: string, title?: string): number {
    return this.enqueue({ type, icon: DEFAULT_ICON[type], message, title });
  }

  private enqueue(opts: {
    type: ToastType;
    icon: string;
    message: string;
    title?: string;
    duration?: number;
  }): number {
    const duration = opts.duration ?? DEFAULT_DURATION;

    // Collapse duplicates: if the same message is already showing, just
    // refresh its timer instead of stacking another identical toast.
    const existing = this.toasts().find(
      (t) => t.type === opts.type && t.message === opts.message,
    );
    if (existing) {
      this.clearTimer(existing.id);
      this.timers.set(
        existing.id,
        setTimeout(() => this.dismiss(existing.id), duration),
      );
      return existing.id;
    }

    const id = this.nextId++;
    const toast: Toast = {
      id,
      type: opts.type,
      icon: opts.icon,
      title: opts.title ?? DEFAULT_TITLE[opts.type],
      message: opts.message,
      duration: opts.duration ?? DEFAULT_DURATION,
    };

    this.toasts.update((list) => {
      const next = [...list, toast];
      // Drop the oldest toasts once we exceed the visible cap.
      while (next.length > MAX_VISIBLE) {
        const removed = next.shift();
        if (removed) {
          this.clearTimer(removed.id);
        }
      }
      return next;
    });

    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), toast.duration),
    );
    return id;
  }

  private inferType(icon: string): ToastType {
    if (icon.includes('triangle-exclamation') || icon.includes('circle-exclamation')) {
      // Legacy code uses the triangle icon for both validation warnings and
      // hard failures; treat it as a warning so it reads as recoverable.
      return 'warning';
    }
    // Deliberately not 'ban': `fa-ban` is this app's *cancelled status* icon
    // (see STATUS_ICONS in listing.model), so it turns up on confirmations of a
    // cancellation that worked. Reading it as a failure is what made "Listing
    // cancelled" render under the error type's default title, "Something went
    // wrong", after a perfectly successful request.
    if (icon.includes('xmark')) {
      return 'error';
    }
    if (icon.includes('circle-check') || icon.includes('user-check') || icon.includes('check')) {
      return 'success';
    }
    return 'info';
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
