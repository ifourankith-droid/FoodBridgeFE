import { signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type { DialogConfig, ResolvedDialogConfig } from './dialog.model';
import { resolveDialogConfig } from './dialog.model';

/**
 * Handle to one open dialog. Returned by `DialogService.open()` and injectable
 * inside the body component, so the body can close itself or drive the footer.
 *
 * @example
 * const ref = dialog.open({ header: 'Edit', content: EditForm, actions: [...] });
 * ref.closed.subscribe((saved) => saved && this.reload());
 *
 * // …inside EditForm
 * private readonly ref = inject(DialogRef<Listing, EditForm>);
 * save() { this.ref.close(this.form.getRawValue()); }
 */
export class DialogRef<R = unknown, C = unknown> {
  /** Live config — patch it to retitle the dialog or swap actions while it is open. */
  readonly config = signal<ResolvedDialogConfig<unknown, R, C>>(
    resolveDialogConfig<unknown, R, C>({}),
  );

  /** Id of the action currently running async work, else null. */
  readonly busyAction = signal<string | null>(null);

  /** Emits once with the result when the dialog closes, then completes. */
  readonly closed: Observable<R | undefined>;

  private readonly closedSubject = new Subject<R | undefined>();
  private readonly instance = signal<C | null>(null);
  private settled = false;

  constructor(
    readonly id: number,
    config: DialogConfig<unknown, R, C>,
    /** Supplied by DialogService — removes this dialog from the stack. */
    private readonly detach: (ref: DialogRef<R, C>) => void,
  ) {
    this.config.set(resolveDialogConfig(config));
    this.closed = this.closedSubject.asObservable();
  }

  /** The instantiated body component, or null for a message-only dialog. */
  body<T = C>(): T | null {
    return this.instance() as T | null;
  }

  /** Close with a result. Idempotent — later calls are ignored. */
  close(result?: R): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.detach(this);
    this.closedSubject.next(result);
    this.closedSubject.complete();
  }

  /** Merge changes into the live config (header text, actions, size, …). */
  patch(changes: Partial<DialogConfig<unknown, R, C>>): void {
    this.config.update((current) => resolveDialogConfig({ ...current, ...changes }));
  }

  /** True once {@link close} has run — guards late callbacks. */
  get isClosed(): boolean {
    return this.settled;
  }

  /** @internal Called by the frame once the body component exists. */
  attachBody(instance: C): void {
    this.instance.set(instance);
  }
}
