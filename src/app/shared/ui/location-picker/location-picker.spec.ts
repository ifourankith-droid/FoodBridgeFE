import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY, of, throwError } from 'rxjs';
import { GeocodingService } from '@core/services/geocoding.service';
import { GeolocationError, GeolocationService } from '@core/services/geolocation.service';
import { GoogleMapsLoaderService } from '@core/services/google-maps-loader.service';
import { LocationPermissionService } from '@core/services/location-permission.service';
import { ToastService } from '@core/services/toast.service';
import type { FbLatLng } from '@shared/ui/map/fb-map.model';
import { LocationPicker } from './location-picker';

describe('LocationPicker', () => {
  let fixture: ComponentFixture<LocationPicker>;
  let toast: ToastService;
  let prompt: jasmine.Spy;

  /** Mount with a geolocation stub that behaves however the test needs. */
  function build(geo: Partial<GeolocationService>): void {
    TestBed.resetTestingModule();
    prompt = jasmine.createSpy('prompt').and.resolveTo(false);
    TestBed.configureTestingModule({
      imports: [LocationPicker],
      providers: [
        // Keeps the real Google Maps bootstrap (and its network fetch) out of the
        // test; FbMap falls back to its placeholder, which is all we need here.
        {
          provide: GoogleMapsLoaderService,
          useValue: { state: signal('no-key'), load: () => Promise.resolve('no-key') },
        },
        { provide: GeolocationService, useValue: { supported: true, ...geo } },
        { provide: LocationPermissionService, useValue: { prompt } },
        { provide: GeocodingService, useValue: { reverseGeocode: () => EMPTY } },
      ],
    });
    fixture = TestBed.createComponent(LocationPicker);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  function clickGps(): void {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();
  }

  /** The persistent notice under the GPS button, if shown. */
  function notice(): string | null {
    const el = fixture.nativeElement.querySelector('p.text-amber-600');
    return el ? el.textContent.trim() : null;
  }

  function lastToast(): string {
    const list = toast.toasts();
    return list.length ? list[list.length - 1].message : '';
  }

  describe('when the device cannot produce a fix', () => {
    beforeEach(() => {
      // What a wired desktop with no Wi-Fi or GPS radio actually returns:
      // POSITION_UNAVAILABLE, so `denied` is false and it fails every attempt.
      build({
        current: () =>
          throwError(
            () => new GeolocationError('Your location is currently unavailable', false),
          ),
      });
    });

    /**
     * The old text was a fixed "Could not read your location", which collapsed
     * "this device will never manage it" and "that attempt timed out" into one
     * line — so it never said which had happened.
     */
    it('reports the reason the geolocation service worked out', () => {
      clickGps();

      expect(lastToast()).toContain('Your location is currently unavailable');
      expect(lastToast()).not.toBe('Could not read your location — drop a pin on the map instead.');
    });

    it('leaves a notice that outlives the toast', () => {
      clickGps();
      expect(notice()).toContain('Your location is currently unavailable');
      expect(notice()).toContain('set the point on the map');

      // The toast self-dismisses after a few seconds; the notice must not, or the
      // user is left pressing a button that cannot ever work.
      toast.clear();
      fixture.detectChanges();
      expect(notice()).toContain('Your location is currently unavailable');
    });

    it('clears the notice once a point is set on the map', () => {
      clickGps();
      expect(notice()).not.toBeNull();

      (fixture.componentInstance as unknown as { onPin(p: FbLatLng): void }).onPin({
        lat: 23.05,
        lng: 72.6,
      });
      fixture.detectChanges();

      expect(notice()).toBeNull();
    });

    it('does not raise the permission modal — nothing was blocked', () => {
      clickGps();
      expect(prompt).not.toHaveBeenCalled();
    });
  });

  describe('when permission is blocked', () => {
    beforeEach(() => {
      build({
        current: () =>
          throwError(() => new GeolocationError('Location permission is blocked', true)),
      });
    });

    it('raises the permission modal instead of the notice', () => {
      clickGps();

      expect(prompt).toHaveBeenCalled();
      expect(notice()).toBeNull();
    });
  });

  describe('on success', () => {
    it('emits the point and shows no notice', () => {
      build({ current: () => of({ lat: 23.05, lng: 72.6 }) });
      const emitted: FbLatLng[] = [];
      fixture.componentInstance.locationChange.subscribe((p) => emitted.push(p));

      clickGps();

      expect(emitted).toEqual([{ lat: 23.05, lng: 72.6 }]);
      expect(notice()).toBeNull();
    });
  });
});
