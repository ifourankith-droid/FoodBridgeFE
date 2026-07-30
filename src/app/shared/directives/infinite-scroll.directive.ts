import { afterNextRender, Directive, ElementRef, inject, input, OnDestroy, output } from '@angular/core';

/**
 * Emits `scrolled` when the host element (a sentinel placed at the end of a list)
 * scrolls near the viewport — for lazy "load more on scroll" pagination.
 *
 * @example
 * <div appInfiniteScroll [appInfiniteScrollDisabled]="loading() || done()" (scrolled)="loadMore()"></div>
 */
@Directive({
  selector: '[appInfiniteScroll]',
})
export class InfiniteScroll implements OnDestroy {
  /** Pause emissions (e.g. while a page is loading or the last page was reached). */
  readonly disabled = input(false, { alias: 'appInfiniteScrollDisabled' });
  readonly scrolled = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!this.disabled() && entries.some((e) => e.isIntersecting)) {
            this.scrolled.emit();
          }
        },
        { rootMargin: '320px 0px' },
      );
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
