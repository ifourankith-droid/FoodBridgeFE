import { InjectionToken, Type } from '@angular/core';
import { Observable } from 'rxjs';
import type { FbButtonVariant } from '@shared/ui/button/button';
import type { DialogRef } from './dialog-ref';

/** Panel width preset. `full` fills the viewport (minus the outer gutter). */
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Whatever the opener passed as `data`, injected into the body component.
 *
 * @example
 * private readonly data = inject<EditPayload>(DIALOG_DATA);
 */
export const DIALOG_DATA = new InjectionToken<unknown>('DIALOG_DATA');

export interface DialogHeader {
  title: string;
  subtitle?: string;
  /** Font Awesome class for the tile left of the title. Omit for no tile. */
  icon?: string;
  /** Any CSS background for the icon tile. */
  iconBg?: string;
  /** Show the ✕ button (default true, forced off when `disableClose`). */
  showClose?: boolean;
}

/**
 * Optional async work returned by an action handler. While it is pending the
 * action shows a spinner and every other action is disabled; the dialog also
 * refuses to close via Esc or the backdrop. Returning nothing means "synchronous".
 */
export type DialogActionWork = Promise<unknown> | Observable<unknown> | void;

/**
 * A footer button. Either it closes the dialog outright (`close: true`) or it runs
 * a `handler` that decides — the handler gets the {@link DialogRef} and calls
 * `ref.close(result)` when (and if) it wants to dismiss.
 */
export interface DialogAction<R = unknown, C = unknown> {
  /** Stable identity — also the key used to target this button's spinner. */
  id: string;
  label: string;
  icon?: string;
  variant?: FbButtonVariant;
  /** `start` pins the button to the left of the footer (e.g. a destructive action). */
  align?: 'start' | 'end';
  /**
   * Static, or a predicate re-read on every render. For the predicate to stay live,
   * read signals inside it (e.g. `() => !ref.body<Form>()?.valid()`).
   */
  disabled?: boolean | (() => boolean);
  /** Close immediately with {@link result}, skipping `handler`. */
  close?: boolean;
  /** Value emitted on `ref.closed` when this action closes the dialog. */
  result?: R;
  /** Click handler. Return a Promise/Observable to drive the button's spinner. */
  handler?: (ref: DialogRef<R, C>) => DialogActionWork;
}

/**
 * Everything `DialogService.open()` accepts.
 *
 * `D` is the shape of `data`, `R` the value `closed` emits, `C` the body component.
 */
export interface DialogConfig<D = unknown, R = unknown, C = unknown> {
  /** A plain string is shorthand for `{ title }`. Omit for a headerless dialog. */
  header?: DialogHeader | string;
  /** Component rendered as the body. */
  content?: Type<C>;
  /** Plain-text body, used when `content` is omitted (both may be set). */
  message?: string;
  /** Provided to the body component as {@link DIALOG_DATA}. */
  data?: D;
  /** Inputs applied to the body component via `setInput`. */
  inputs?: Record<string, unknown>;
  actions?: DialogAction<R, C>[];
  size?: DialogSize;
  /** Ignore Esc, backdrop clicks and the ✕ button (default false). */
  disableClose?: boolean;
  /** Extra class on the panel element, for one-off styling. */
  panelClass?: string;
  /**
   * Stop the panel and body clipping their overflow.
   *
   * Needed when the body holds an **anchored popover** — `<app-date-picker>` or a
   * searchable `<app-select>` — because those panels are absolutely positioned
   * against their field, and the body's `overflow-y: auto` would otherwise cut
   * them off. Only set it when the body is short enough that it never needs to
   * scroll: with clipping off, tall content escapes the panel instead of scrolling
   * inside it.
   */
  allowOverflow?: boolean;
}

/** `DialogConfig` with the defaults filled in — what the frame actually renders. */
export interface ResolvedDialogConfig<D = unknown, R = unknown, C = unknown>
  extends DialogConfig<D, R, C> {
  header?: DialogHeader;
  size: DialogSize;
  disableClose: boolean;
  actions: DialogAction<R, C>[];
}

/** Normalise the caller's config: string header → object, defaults applied. */
export function resolveDialogConfig<D, R, C>(
  config: DialogConfig<D, R, C>,
): ResolvedDialogConfig<D, R, C> {
  const header = typeof config.header === 'string' ? { title: config.header } : config.header;
  return {
    ...config,
    header,
    size: config.size ?? 'md',
    disableClose: config.disableClose ?? false,
    actions: config.actions ?? [],
  };
}
