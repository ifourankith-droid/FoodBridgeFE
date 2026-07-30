/**
 * Central registry of client-side route paths (absolute, for navigation).
 *
 * Use these constants for `router.navigate([...])` and `routerLink` instead of
 * hard-coding strings. The route *table* itself lives in `app.routes.ts`;
 * these mirror its paths for type-safe navigation.
 */
export const APP_ROUTES = {
  login: '/login',
  otp: '/otp',
  register: '/register',
  app: '/app',
  dashboard: '/app/dashboard',
  /** Build an in-app view path, e.g. appView('profile') → '/app/profile'. */
  appView: (view: string) => `/app/${view}`,
} as const;

/**
 * Navigation state passed between in-app views.
 *
 * `from` records the view a navigation originated in, so the destination can
 * offer a Back affordance only when there is somewhere meaningful to go back
 * to. A view reached from the sidebar or a deep link carries no state, and must
 * not show Back — it would send the user somewhere they were never at.
 *
 * Read it with Angular's `Location.getState()` rather than
 * `Router.getCurrentNavigation()`: the router persists this into
 * `history.state`, so `getState()` still returns it after a page reload,
 * whereas the current-navigation object is gone by then.
 *
 * @example
 * // origin
 * this.router.navigate([APP_ROUTES.appView('create')], fromView('listings'));
 * // destination
 * const state = this.location.getState() as AppNavState | null;
 * this.showBack = state?.from === 'listings';
 */
export interface AppNavState {
  from?: string;
  /** Added by the Angular router itself; present on every history entry. */
  navigationId?: number;
}

/** Builds the `NavigationOptions` fragment that records the originating view. */
export function fromView(view: string): { state: AppNavState } {
  return { state: { from: view } };
}
