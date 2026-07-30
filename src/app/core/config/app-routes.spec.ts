import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppNavState, fromView } from './app-routes';

/**
 * Stands in for a destination page (e.g. the New Donation form) that decides
 * whether to offer a Back button. Reads the state in a FIELD INITIALISER,
 * exactly as CreateListing does — that is the part worth pinning down, since it
 * only works if the router has already written the state into history.state by
 * the time the routed component is constructed.
 */
@Component({
  selector: 'app-nav-state-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class NavStateProbe {
  private readonly location = inject(Location);
  readonly from = (this.location.getState() as AppNavState | null)?.from;
  readonly showBack = this.from === 'listings';
}

@Component({
  selector: 'app-nav-state-origin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class OriginPage {}

describe('fromView / AppNavState', () => {
  it('builds a state fragment naming the originating view', () => {
    expect(fromView('listings')).toEqual({ state: { from: 'listings' } });
  });

  describe('round trip through the router', () => {
    let router: Router;
    let harness: RouterTestingHarness;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'app/listings', component: OriginPage },
            { path: 'app/create', component: NavStateProbe },
          ]),
        ],
      });
      router = TestBed.inject(Router);
      harness = await RouterTestingHarness.create();
    });

    const probe = (): NavStateProbe =>
      harness.routeDebugElement!.componentInstance as NavStateProbe;

    it('exposes `from` to the destination when the origin passes it', async () => {
      await router.navigateByUrl('/app/listings');
      await router.navigate(['/app/create'], fromView('listings'));
      harness.detectChanges();

      expect(probe().from).toBe('listings');
      expect(probe().showBack).toBeTrue();
    });

    it('leaves `from` undefined for a direct navigation (sidebar / deep link)', async () => {
      await router.navigate(['/app/create']);
      harness.detectChanges();

      expect(probe().from).toBeUndefined();
      expect(probe().showBack).toBeFalse();
    });

    it('ignores a `from` that names a different view', async () => {
      await router.navigate(['/app/create'], fromView('dashboard'));
      harness.detectChanges();

      expect(probe().from).toBe('dashboard');
      expect(probe().showBack).toBeFalse();
    });

    it('keeps `from` alongside query params (the edit route)', async () => {
      await router.navigate(['/app/create'], {
        queryParams: { edit: 'abc-123' },
        ...fromView('listings'),
      });
      harness.detectChanges();

      expect(probe().showBack).toBeTrue();
      expect(router.url).toContain('edit=abc-123');
    });

    it('does not leak `from` into a later unrelated navigation', async () => {
      await router.navigate(['/app/create'], fromView('listings'));
      harness.detectChanges();
      expect(probe().showBack).toBeTrue();

      // Navigating away and back without state must reset the affordance,
      // otherwise the button would linger for the rest of the session.
      await router.navigate(['/app/listings']);
      await router.navigate(['/app/create']);
      harness.detectChanges();

      expect(probe().showBack).toBeFalse();
    });
  });
});
