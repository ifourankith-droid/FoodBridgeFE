import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import type { ListingWriteBody } from '@core/models/listing-api.model';
import { DashboardService } from '@core/services/dashboard.service';
import { DialogService } from '@core/services/dialog.service';
import { GeocodingService } from '@core/services/geocoding.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { GoogleMapsLoaderService } from '@core/services/google-maps-loader.service';
import { ListingService } from '@core/services/listing.service';
import { LocationPermissionService } from '@core/services/location-permission.service';
import { PickupAddress, PickupAddressService } from '@core/services/pickup-address.service';
import type { FbLatLng } from '@shared/ui/map/fb-map.model';
import { CreateListing } from './create-listing';

const SAVED: PickupAddress = {
  id: 'addr-1',
  label: 'Main Branch',
  address: '12 Ashram Road, Ahmedabad',
  latitude: 23.03,
  longitude: 72.57,
};

/** Members the template drives, which the class keeps `protected`/`private`. */
interface Internals {
  pickupCtrl: { setValue(v: string | null): void };
  pickupOptions(): { value: string; label: string }[];
  useCurrentLocation(): boolean;
  gpsCoords(): FbLatLng | null;
  activeAddress(): { label: string; latitude: number; longitude: number } | null;
  onGpsPin(p: FbLatLng): void;
  onGpsAddress(a: { address: string; city: string; state: string; pincode: string }): void;
  submit(): void;
  form: { patchValue(v: Record<string, unknown>): void };
}

describe('CreateListing — current location as the pickup', () => {
  let fixture: ComponentFixture<CreateListing>;
  let inner: Internals;
  let create: jasmine.Spy;
  let selectSpy: jasmine.Spy;

  function build(addresses: PickupAddress[] = [SAVED]): void {
    TestBed.resetTestingModule();
    create = jasmine.createSpy('create').and.returnValue(EMPTY);
    selectSpy = jasmine.createSpy('select').and.returnValue(of(null));
    const selected = signal<PickupAddress | null>(addresses[0] ?? null);
    TestBed.configureTestingModule({
      imports: [CreateListing],
      providers: [
        {
          provide: PickupAddressService,
          useValue: {
            addresses: signal(addresses),
            selected,
            serverBacked: signal(true),
            select: selectSpy,
          },
        },
        { provide: ListingService, useValue: { create, update: () => EMPTY, getById: () => EMPTY } },
        { provide: DashboardService, useValue: { donor: () => EMPTY } },
        // A new donation is gated behind the food-safety consent dialog. Resolving it
        // with `true` stands in for the donor ticking the box and pressing Confirm.
        {
          provide: DialogService,
          useValue: {
            open: () => ({ closed: of(true), body: () => null, close: () => undefined }),
          },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        // Map stack: no Google bootstrap, no real GPS.
        {
          provide: GoogleMapsLoaderService,
          useValue: { state: signal('no-key'), load: () => Promise.resolve('no-key') },
        },
        { provide: GeolocationService, useValue: { supported: false, current: () => EMPTY } },
        { provide: LocationPermissionService, useValue: { prompt: () => Promise.resolve(false) } },
        { provide: GeocodingService, useValue: { reverseGeocode: () => EMPTY } },
      ],
    });
    fixture = TestBed.createComponent(CreateListing);
    inner = fixture.componentInstance as unknown as Internals;
    fixture.detectChanges();
  }

  /** Everything except the pickup, so submit fails only on what a test is probing. */
  function fillTheRest(): void {
    inner.form.patchValue({
      title: 'Surplus Wedding Catering',
      foodType: 'Mixed Veg Meals',
      quantityMeals: '80',
      pickupDeadline: '2026-12-31T18:00',
    });
  }

  function chooseCurrentLocation(): void {
    inner.pickupCtrl.setValue('__current__');
    fixture.detectChanges();
  }

  /** The body the listing endpoint was actually called with. */
  function posted(): ListingWriteBody {
    return create.calls.mostRecent().args[0] as ListingWriteBody;
  }

  it('offers current location even with no saved address at all', () => {
    build([]);
    const values = inner.pickupOptions().map((o) => o.value);

    // Before this existed, a donor with an empty address book could not post.
    expect(values).toEqual(['__current__']);
  });

  it('lists it after the saved addresses', () => {
    build();
    expect(inner.pickupOptions().map((o) => o.value)).toEqual(['addr-1', '__current__']);
  });

  it('does not save the one-off point to the address book', () => {
    build();
    chooseCurrentLocation();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  describe('once chosen', () => {
    beforeEach(() => {
      build();
      fillTheRest();
      chooseCurrentLocation();
    });

    it('has no pickup until a point is actually marked', () => {
      expect(inner.useCurrentLocation()).toBeTrue();
      expect(inner.gpsCoords()).toBeNull();
      expect(inner.activeAddress()).toBeNull();

      inner.submit();
      expect(create).not.toHaveBeenCalled();
    });

    /**
     * The trap this file exists for. `pickup.selected()` still holds the saved
     * address — choosing "current location" never clears it — so a payload built
     * without excluding this branch posts `donorAddressId` and drops the marked
     * point, putting the listing at the wrong address with nothing on screen to say so.
     */
    it('posts the marked point, never the still-selected saved address', () => {
      inner.onGpsPin({ lat: 23.11, lng: 72.63 });
      inner.onGpsAddress({ address: 'Riverfront Park', city: 'Ahmedabad', state: 'GJ', pincode: '380001' });
      inner.submit();

      expect(create).toHaveBeenCalled();
      const body = posted();
      expect(body.donorAddressId).toBeUndefined();
      expect(body.latitude).toBe(23.11);
      expect(body.longitude).toBe(72.63);
      expect(body.pickupAddress).toBe('Riverfront Park, Ahmedabad');
    });

    it('falls back to coordinates when geocoding gives nothing', () => {
      inner.onGpsPin({ lat: 23.11, lng: 72.63 });
      inner.submit();

      // Never empty: this text is what a volunteer reads to find the place.
      expect(posted().pickupAddress).toBe('23.11000, 72.63000');
    });

    it('drops a stale address when the pin moves', () => {
      inner.onGpsPin({ lat: 23.11, lng: 72.63 });
      inner.onGpsAddress({ address: 'Riverfront Park', city: 'Ahmedabad', state: 'GJ', pincode: '380001' });
      inner.onGpsPin({ lat: 23.2, lng: 72.7 });
      inner.submit();

      expect(posted().pickupAddress).toBe('23.20000, 72.70000');
    });

    it('discards the marked point on switching back to a saved address', () => {
      inner.onGpsPin({ lat: 23.11, lng: 72.63 });
      inner.pickupCtrl.setValue('addr-1');
      fixture.detectChanges();

      expect(inner.gpsCoords()).toBeNull();
      inner.submit();
      expect(posted().donorAddressId).toBe('addr-1');
      expect(posted().latitude).toBeUndefined();
    });
  });

  it('still posts a saved address as donorAddressId', () => {
    build();
    fillTheRest();
    inner.submit();

    expect(posted().donorAddressId).toBe('addr-1');
  });
});
