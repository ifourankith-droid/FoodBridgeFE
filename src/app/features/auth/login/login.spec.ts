import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let sendOtp: jasmine.Spy;
  let navigate: jasmine.Spy;

  function build(send: jasmine.Spy): void {
    TestBed.resetTestingModule();
    sendOtp = send;
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: AuthService, useValue: { sendOtp, startRegistration: () => undefined } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
  }

  function typeNumber(value = '9876543210'): void {
    (fixture.componentInstance as unknown as { mobile: { setValue(v: string): void } }).mobile
      .setValue(value);
    fixture.detectChanges();
  }

  function submit(): void {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('form button[type=submit]');
  }

  function field(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  describe('while the OTP request is in flight', () => {
    let pending: Subject<unknown>;

    beforeEach(() => {
      pending = new Subject();
      build(jasmine.createSpy('sendOtp').and.returnValue(pending));
      typeNumber();
      submit();
    });

    it('shows the button as busy', () => {
      expect(button().disabled).toBeTrue();
      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(button().textContent).toContain('Sending OTP');
    });

    /**
     * Enter submits the form, so without a guard an impatient second press sends
     * a second OTP — and the send is rate-limited per number, so it's the retry
     * that fails, on a screen that looked idle.
     */
    it('ignores a second submit', () => {
      submit();
      expect(sendOtp).toHaveBeenCalledTimes(1);
    });

    it('locks the number so it cannot drift from the one being sent to', () => {
      expect(field().disabled).toBeTrue();
    });

    it('blocks the route out to registration', () => {
      const link: HTMLButtonElement = fixture.nativeElement.querySelector('p .fb-link');
      expect(link.disabled).toBeTrue();
    });
  });

  it('releases the form when the request fails', () => {
    build(jasmine.createSpy('sendOtp').and.returnValue(throwError(() => new Error('Too many requests'))));
    typeNumber();
    submit();

    expect(button().disabled).toBeFalse();
    expect(button().textContent).toContain('Send OTP');
    expect(field().disabled).toBeFalse();
    // A retry has to be possible — that's the whole point of releasing it.
    submit();
    expect(sendOtp).toHaveBeenCalledTimes(2);
  });

  it('never starts a request for an invalid number', () => {
    build(jasmine.createSpy('sendOtp'));
    typeNumber('98765');
    submit();

    expect(sendOtp).not.toHaveBeenCalled();
    expect(button().disabled).toBeFalse();
  });

  it('holds the busy state across the navigation to the OTP screen', async () => {
    const done = new Subject<unknown>();
    build(jasmine.createSpy('sendOtp').and.returnValue(done));
    typeNumber();
    submit();

    done.next({});
    done.complete();
    fixture.detectChanges();

    // Response has landed and navigation was asked for, but has not resolved:
    // clearing here would flash an idle, pressable button.
    expect(navigate).toHaveBeenCalled();
    expect(button().disabled).toBeTrue();

    await fixture.whenStable();
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();
  });
});
