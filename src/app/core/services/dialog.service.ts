import { effect, Injectable, signal } from '@angular/core';
import { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogConfig, DialogSize } from '@shared/ui/dialog/dialog.model';

/** Options for the {@link DialogService.confirm} shorthand. */
export interface ConfirmOptions {
  title: string;
  message: string;
  /** Defaults to 'Confirm'. */
  confirmLabel?: string;
  /** Defaults to 'Cancel'. */
  cancelLabel?: string;
  /** Use 'danger' for destructive confirmations. Defaults to 'solid'. */
  confirmVariant?: 'solid' | 'danger' | 'success';
  icon?: string;
  size?: DialogSize;
}

const BODY_LOCK_CLASS = 'fb-dialog-open';

/**
 * Opens app-wide modal dialogs. Mirrors {@link ToastService}: a root singleton
 * holding a signal stack, rendered by a single host (`<app-dialog-host />` in
 * `app.html`) — so any service, guard or component can open one without needing
 * a `ViewContainerRef` or an anchor in its own template.
 *
 * @example
 * // Annotate `ref` whenever an action reads it back (as `disabled` does here):
 * // without it the initializer is self-referential and TypeScript infers `any`.
 * const ref: DialogRef<boolean, EditListingForm> = this.dialog.open<
 *   { id: string },
 *   boolean,
 *   EditListingForm
 * >({
 *   header: { title: 'Edit listing', icon: 'fa-solid fa-pen' },
 *   content: EditListingForm,
 *   data: { id },
 *   size: 'lg',
 *   actions: [
 *     { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true, result: false },
 *     {
 *       id: 'save',
 *       label: 'Save',
 *       icon: 'fa-solid fa-check',
 *       disabled: () => !ref.body()?.valid(),
 *       // Returning the request keeps the button spinning until it settles.
 *       handler: (r) => r.body()!.save$().pipe(tap(() => r.close(true))),
 *     },
 *   ],
 * });
 * ref.closed.subscribe((saved) => saved && this.reload());
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  /**
   * Open dialogs, oldest first. Read by the host; treat as read-only elsewhere.
   *
   * Held at the erased `DialogRef<unknown, unknown>` so one list can carry
   * differently-parameterised dialogs — `DialogRef` is invariant in `R`/`C`
   * (its signal and subject appear in both input and output positions), so the
   * per-dialog types only survive on the handle `open()` hands back.
   */
  readonly stack = signal<readonly DialogRef[]>([]);

  private nextId = 0;

  constructor() {
    // The native <dialog> makes the page inert but does not stop it scrolling
    // behind the panel, so lock the body while anything is open.
    effect(() => {
      document.body.classList.toggle(BODY_LOCK_CLASS, this.stack().length > 0);
    });
  }

  /**
   * Open a dialog and return its handle. `D` is the `data` shape, `R` the value
   * `closed` emits, `C` the body component type.
   */
  open<D = unknown, R = unknown, C = unknown>(
    config: DialogConfig<D, R, C>,
  ): DialogRef<R, C> {
    const ref = new DialogRef<R, C>(this.nextId++, config, (closing) => this.detach(closing));
    this.stack.update((list) => [...list, ref as unknown as DialogRef]);
    return ref;
  }

  /**
   * Yes/no confirmation. Resolves `true` only if the confirm action was pressed —
   * Esc, the backdrop and ✕ all resolve `false`.
   */
  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const ref = this.open<unknown, boolean>({
        header: {
          title: options.title,
          icon: options.icon ?? 'fa-solid fa-circle-question',
          iconBg:
            options.confirmVariant === 'danger' ? 'rgba(220, 38, 38, 0.12)' : 'var(--fb-primary-soft)',
        },
        message: options.message,
        size: options.size ?? 'sm',
        actions: [
          {
            id: 'cancel',
            label: options.cancelLabel ?? 'Cancel',
            variant: 'ghost',
            close: true,
            result: false,
          },
          {
            id: 'confirm',
            label: options.confirmLabel ?? 'Confirm',
            variant: options.confirmVariant ?? 'solid',
            close: true,
            result: true,
          },
        ],
      });
      ref.closed.subscribe((result) => resolve(result === true));
    });
  }

  /** Close every open dialog (each resolves with no result). */
  closeAll(): void {
    for (const ref of [...this.stack()]) {
      ref.close();
    }
  }

  /** The dialog on top of the stack, or null. */
  topmost(): DialogRef | null {
    const list = this.stack();
    return list.length ? list[list.length - 1] : null;
  }

  private detach(ref: { id: number; }): void {
    this.stack.update((list) => list.filter((d) => d.id !== ref.id));
  }
}
