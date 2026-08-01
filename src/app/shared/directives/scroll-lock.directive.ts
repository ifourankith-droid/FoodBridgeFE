import { DestroyRef, Directive, effect, inject, Injectable, input } from '@angular/core';

/**
 * Reference-counted body scroll-lock. Overlays share one lock: a native
 * `<dialog>` opened with `showModal()` makes the page behind *inert* (unclickable)
 * but browsers still let it scroll, and off-canvas drawers have no inertness at
 * all — so both have to freeze the document scroller themselves.
 *
 * Counting matters because overlays stack: a dialog opened from a popover, or a
 * confirm on top of a dialog, means two locks are live at once. A naive
 * set/remove would unlock the moment the *first* closes, freeing the page while
 * the second is still up. Only the 0→1 acquire freezes and only the last 1→0
 * release restores, so the background stays locked for as long as *anything* is
 * open.
 *
 * Freezing removes the scrollbar, which would shift the page left; the width it
 * occupied is added back as body padding so the layout doesn't jump.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private count = 0;
  /** Inline styles captured at the first lock, restored at the last unlock. */
  private restore: { htmlOverflow: string; bodyPaddingRight: string } | null = null;

  /** Freeze the document scroller (no-op beyond the first concurrent caller). */
  lock(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this.count += 1;
    if (this.count > 1) {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    // The scrollbar width is the gap between the viewport and the root's client
    // box; add it back as padding so hiding the bar doesn't shift the page.
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    this.restore = { htmlOverflow: html.style.overflow, bodyPaddingRight: body.style.paddingRight };
    html.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPad = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPad + scrollbarWidth}px`;
    }
  }

  /** Release one lock; restores the scroller only when the last one is released. */
  unlock(): void {
    if (typeof document === 'undefined' || this.count === 0) {
      return;
    }
    this.count -= 1;
    if (this.count > 0) {
      return;
    }

    if (this.restore) {
      document.documentElement.style.overflow = this.restore.htmlOverflow;
      document.body.style.paddingRight = this.restore.bodyPaddingRight;
      this.restore = null;
    }
  }
}

/**
 * Locks background scroll while its bound value is true. Put it on any overlay
 * (dialog, drawer, modal popover) and drive it from that overlay's open state:
 *
 * @example
 * <dialog [fbScrollLock]="true">…</dialog>                  <!-- while mounted -->
 * <dialog [fbScrollLock]="open() && asModal()">…</dialog>   <!-- while a signal is true -->
 *
 * It takes and releases exactly one shared lock (see {@link ScrollLockService}),
 * and always releases on destroy — so an overlay removed from the DOM while still
 * "open" (an `@if` dropping it) can't strand the page frozen.
 */
@Directive({ selector: '[fbScrollLock]' })
export class FbScrollLock {
  private readonly service = inject(ScrollLockService);

  /** Whether the background should be locked right now. */
  readonly active = input.required<boolean>({ alias: 'fbScrollLock' });

  /** This instance's own held/not-held state, so it locks/unlocks at most once. */
  private held = false;

  constructor() {
    effect(() => {
      if (this.active()) {
        this.acquire();
      } else {
        this.release();
      }
    });

    inject(DestroyRef).onDestroy(() => this.release());
  }

  private acquire(): void {
    if (!this.held) {
      this.held = true;
      this.service.lock();
    }
  }

  private release(): void {
    if (this.held) {
      this.held = false;
      this.service.unlock();
    }
  }
}
