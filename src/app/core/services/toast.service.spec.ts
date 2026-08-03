import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toast = TestBed.inject(ToastService);
  });

  /** The most recently pushed toast. */
  function latest() {
    const list = toast.toasts();
    return list[list.length - 1];
  }

  describe('severity', () => {
    /**
     * The regression this file exists for: cancelling a listing succeeds, the
     * confirmation carries the cancelled-status glyph (fa-ban), and inferring
     * "error" from it published a green-path confirmation under the error
     * type's default title — "Something went wrong" — right after a 200.
     */
    it('does not read the cancelled-status icon as a failure', () => {
      toast.show('fa-solid fa-ban', 'Listing cancelled');

      expect(latest().type).not.toBe('error');
      expect(latest().title).not.toBe('Something went wrong');
    });

    it('lets the caller state the type outright, overriding the icon', () => {
      toast.show('fa-solid fa-ban', 'Listing cancelled', 'success');

      expect(latest().type).toBe('success');
      expect(latest().title).toBe('Success');
    });

    it('still infers a type when the caller gives none', () => {
      toast.show('fa-solid fa-circle-check', 'Saved');
      expect(latest().type).toBe('success');

      toast.show('fa-solid fa-circle-xmark', 'Rejected');
      expect(latest().type).toBe('error');

      toast.show('fa-solid fa-triangle-exclamation', 'Could not load');
      expect(latest().type).toBe('warning');
    });
  });

  it('defaults the title per type', () => {
    toast.error('Boom');
    expect(latest().title).toBe('Something went wrong');

    toast.error('Boom again', 'Custom title');
    expect(latest().title).toBe('Custom title');
  });
});
