import { Injectable, signal } from '@angular/core';

/** Below this width the sidebar behaves as an off-canvas drawer. */
const DESKTOP_BREAKPOINT = 1024;

/** Shared layout state — the sidebar drawer (mobile) and collapsed rail (desktop). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** Off-canvas drawer visibility on tablet/mobile widths. */
  readonly sidebarOpen = signal(false);

  /** Icon-only collapsed rail on desktop widths. */
  readonly collapsed = signal(false);

  /**
   * Single toggle wired to the topbar button: collapses the rail on desktop,
   * opens/closes the drawer on smaller screens.
   */
  toggleSidebar(): void {
    if (typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT) {
      this.collapsed.update((collapsed) => !collapsed);
    } else {
      this.sidebarOpen.update((open) => !open);
    }
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
