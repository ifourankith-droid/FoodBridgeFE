import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of } from 'rxjs';
import { DropOffLocationService } from '@core/services/dropoff-location.service';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import type { FbLatLng } from '@shared/ui/map/fb-map.model';
import { DeliveryDialog, DeliveryDialogData } from './delivery-dialog';

/** The members the template drives, which the class keeps `protected`. */
interface Internals {
  spotControl: FormControl<string | null>;
  nameControl: FormControl<string>;
  newCoords: { (): FbLatLng | null; set(v: FbLatLng | null): void };
  newAddress: { (): string; set(v: string): void };
  pickupPoint: FbLatLng;
  onPin(pos: FbLatLng): void;
}

const PICKUP: DeliveryDialogData = {
  latitude: 23.0225,
  longitude: 72.5714,
  completesDonation: true,
};

describe('DeliveryDialog', () => {
  let fixture: ComponentFixture<DeliveryDialog>;
  let dialog: DeliveryDialog;
  let inner: Internals;

  function build(data: DeliveryDialogData = PICKUP): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DeliveryDialog],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DropOffLocationService, useValue: { hotspots: () => of([]) } },
      ],
    });
    fixture = TestBed.createComponent(DeliveryDialog);
    dialog = fixture.componentInstance;
    inner = dialog as unknown as Internals;
    fixture.detectChanges();
  }

  beforeEach(() => build());

  /** Reach the "add a new spot" branch, which is what carries the map. */
  function addNewSpot(name = 'Paldi underbridge camp'): void {
    inner.spotControl.setValue('__new__');
    inner.nameControl.setValue(name);
  }

  describe('a new drop-off spot', () => {
    /**
     * The map has to start *somewhere*, and the picker always draws its pin — but
     * the point it merely opened on is not a place anyone chose. If that leaked
     * into the submitted value, every unattended confirm would file the drop-off
     * at the pickup address.
     */
    it('does not treat the map’s starting point as a chosen location', () => {
      addNewSpot();

      expect(inner.pickupPoint).toEqual({ lat: PICKUP.latitude, lng: PICKUP.longitude });
      expect(inner.newCoords()).toBeNull();
      expect(dialog.dropOff()).toBeNull();
    });

    it('is submittable once the pin is placed', () => {
      addNewSpot();
      inner.onPin({ lat: 23.05, lng: 72.6 });

      expect(dialog.dropOff()).toEqual({
        latitude: 23.05,
        longitude: 72.6,
        name: 'Paldi underbridge camp',
      });
    });

    it('sends the reverse-geocoded address when one resolved', () => {
      addNewSpot();
      inner.onPin({ lat: 23.05, lng: 72.6 });
      inner.newAddress.set('Paldi, Ahmedabad');

      expect(dialog.dropOff()).toEqual({
        latitude: 23.05,
        longitude: 72.6,
        name: 'Paldi underbridge camp',
        address: 'Paldi, Ahmedabad',
      });
    });

    /** Otherwise dragging the pin down the road keeps the old street name on it. */
    it('drops a stale address when the pin moves', () => {
      addNewSpot();
      inner.onPin({ lat: 23.05, lng: 72.6 });
      inner.newAddress.set('Paldi, Ahmedabad');

      inner.onPin({ lat: 23.09, lng: 72.66 });

      expect(inner.newAddress()).toBe('');
      expect(dialog.dropOff()).toEqual({
        latitude: 23.09,
        longitude: 72.66,
        name: 'Paldi underbridge camp',
      });
    });

    it('still requires a name', () => {
      addNewSpot('');
      inner.onPin({ lat: 23.05, lng: 72.6 });

      expect(dialog.dropOff()).toBeNull();
    });
  });

  it('records a matched recipient at the pickup point, with no pin needed', () => {
    build({ ...PICKUP, recipientName: 'Seva Trust' });

    expect(dialog.dropOff()).toEqual({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
      name: 'Seva Trust',
    });
  });
});
