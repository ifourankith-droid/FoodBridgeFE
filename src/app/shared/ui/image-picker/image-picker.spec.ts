import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImagePicker } from './image-picker';

/** A File whose `size`/`type` we control without allocating real bytes. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Put a FileList-ish value on the hidden input and fire `change`. */
function pick(fixture: ComponentFixture<ImagePicker>, ...files: File[]): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

function query<T extends HTMLElement>(fixture: ComponentFixture<ImagePicker>, sel: string): T | null {
  return fixture.nativeElement.querySelector(sel);
}

describe('ImagePicker', () => {
  let fixture: ComponentFixture<ImagePicker>;
  let emitted: (File | null)[];
  let created: string[];
  let revoked: string[];
  let urlSeq = 0;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImagePicker] });

    created = [];
    revoked = [];
    urlSeq = 0;
    spyOn(URL, 'createObjectURL').and.callFake(() => {
      const url = `blob:fake/${++urlSeq}`;
      created.push(url);
      return url;
    });
    spyOn(URL, 'revokeObjectURL').and.callFake((url: string) => revoked.push(url));

    fixture = TestBed.createComponent(ImagePicker);
    emitted = [];
    fixture.componentInstance.fileChange.subscribe((f) => emitted.push(f));
    fixture.detectChanges();
  });

  it('starts empty, showing the drop zone', () => {
    expect(query(fixture, '.zone')).toBeTruthy();
    expect(query(fixture, '.preview')).toBeNull();
  });

  it('emits the file and shows a preview once picked', () => {
    pick(fixture, fakeFile('meal.jpg', 'image/jpeg', 1024));

    expect(emitted).toEqual([jasmine.any(File)]);
    expect(emitted[0]!.name).toBe('meal.jpg');
    expect(query(fixture, '.preview')).toBeTruthy();
    expect(query<HTMLImageElement>(fixture, '.preview img')!.getAttribute('src')).toBe(created[0]);
  });

  it('shows the file name and a human-readable size', () => {
    pick(fixture, fakeFile('meal.jpg', 'image/jpeg', 2 * 1024 * 1024));
    expect(query(fixture, '.meta-text')!.textContent).toContain('meal.jpg');
    expect(query(fixture, '.meta-text')!.textContent).toContain('2.0 MB');
  });

  it('revokes the previous blob URL when the image is replaced', () => {
    pick(fixture, fakeFile('a.jpg', 'image/jpeg', 100));
    pick(fixture, fakeFile('b.jpg', 'image/jpeg', 100));

    // Two URLs created, and the first released — otherwise every replace would
    // leak a blob for the lifetime of the page.
    expect(created.length).toBe(2);
    expect(revoked).toContain(created[0]);
  });

  it('revokes the blob URL and emits null on remove', () => {
    pick(fixture, fakeFile('a.jpg', 'image/jpeg', 100));
    query<HTMLButtonElement>(fixture, '.icon-btn.is-danger')!.click();
    fixture.detectChanges();

    expect(emitted[emitted.length - 1]).toBeNull();
    expect(revoked).toContain(created[0]);
    expect(query(fixture, '.preview')).toBeNull();
    expect(query(fixture, '.zone')).toBeTruthy();
  });

  it('revokes the blob URL when the component is destroyed', () => {
    pick(fixture, fakeFile('a.jpg', 'image/jpeg', 100));
    expect(revoked).not.toContain(created[0]);

    fixture.destroy();
    expect(revoked).toContain(created[0]);
  });

  it('clears input.value so the same file can be picked twice', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    pick(fixture, fakeFile('a.jpg', 'image/jpeg', 100));
    expect(input.value).toBe('');
  });

  describe('validation', () => {
    it('rejects a file over the size cap and reports why', () => {
      fixture.componentRef.setInput('maxSizeMb', 1);
      fixture.detectChanges();

      pick(fixture, fakeFile('big.jpg', 'image/jpeg', 3 * 1024 * 1024));

      expect(emitted.length).toBe(0);
      expect(query(fixture, '.msg.is-error')!.textContent).toContain('3.0 MB');
      expect(query(fixture, '.msg.is-error')!.textContent).toContain('limit is 1 MB');
    });

    it('rejects a disallowed type', () => {
      pick(fixture, fakeFile('doc.pdf', 'application/pdf', 100));

      expect(emitted.length).toBe(0);
      expect(query(fixture, '.msg.is-error')!.textContent).toContain('not supported');
    });

    it('keeps an already-good image when a later pick is rejected', () => {
      pick(fixture, fakeFile('good.jpg', 'image/jpeg', 100));
      pick(fixture, fakeFile('bad.pdf', 'application/pdf', 100));

      // Still one emission (the good file) and the preview survives.
      expect(emitted.length).toBe(1);
      expect(query(fixture, '.preview')).toBeTruthy();
    });

    it('honours a wildcard accept', () => {
      fixture.componentRef.setInput('accept', 'image/*');
      fixture.detectChanges();

      pick(fixture, fakeFile('pic.webp', 'image/webp', 100));
      expect(emitted.length).toBe(1);
    });
  });

  describe('existingUrl', () => {
    it('previews a stored image before anything is picked', () => {
      fixture.componentRef.setInput('existingUrl', 'https://cdn/example.jpg');
      fixture.detectChanges();

      expect(query<HTMLImageElement>(fixture, '.preview img')!.getAttribute('src')).toBe(
        'https://cdn/example.jpg',
      );
    });

    it('prefers a freshly picked file over the stored image', () => {
      fixture.componentRef.setInput('existingUrl', 'https://cdn/example.jpg');
      fixture.detectChanges();
      pick(fixture, fakeFile('new.jpg', 'image/jpeg', 100));

      expect(query<HTMLImageElement>(fixture, '.preview img')!.getAttribute('src')).toBe(created[0]);
    });
  });

  describe('camera', () => {
    let tracks: { stop: jasmine.Spy; kind: string }[];
    let getUserMedia: jasmine.Spy;
    let stream: MediaStream;

    beforeEach(() => {
      tracks = [
        { stop: jasmine.createSpy('stop'), kind: 'video' },
        { stop: jasmine.createSpy('stop'), kind: 'video' },
      ];
      // A real MediaStream, because the component assigns it to video.srcObject
      // and the DOM rejects a plain object. Only getTracks is faked, so track
      // teardown stays observable.
      stream = new MediaStream();
      spyOn(stream, 'getTracks').and.returnValue(tracks as unknown as MediaStreamTrack[]);
      getUserMedia = jasmine.createSpy('getUserMedia').and.resolveTo(stream);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
      });
      // Rebuild so `cameraSupported` sees the stub.
      fixture = TestBed.createComponent(ImagePicker);
      fixture.detectChanges();
    });

    it('offers the camera when getUserMedia exists', () => {
      expect(query(fixture, '.cam-btn')).toBeTruthy();
    });

    it('requests the rear camera and no audio', async () => {
      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      await fixture.whenStable();

      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'environment' },
        audio: false,
      });
    });

    /**
     * getUserMedia resolves before Angular renders the sheet, so the <video>
     * does not exist yet at that moment. The stream therefore has to be
     * attached reactively — this asserts it actually lands on the element AND
     * that nothing tore it down on the way, which an earlier version did.
     */
    it('attaches the stream to the video once the sheet renders', async () => {
      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const video = query<HTMLVideoElement>(fixture, '.cam-stage video')!;
      expect(video.srcObject).toBeTruthy();
      tracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());
    });

    it('stops every track when the sheet is closed', async () => {
      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      tracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());

      query<HTMLButtonElement>(fixture, '.cam-sheet .icon-btn')!.click();
      fixture.detectChanges();

      // An un-stopped track leaves the device's recording light on.
      tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
      expect(query(fixture, '.cam-sheet')).toBeNull();
    });

    it('stops every track when the component is destroyed while open', async () => {
      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      // Guard against a vacuous pass: the tracks must still be live here, so
      // that the assertion after destroy can only be satisfied by cleanup.
      tracks.forEach((t) => expect(t.stop).not.toHaveBeenCalled());

      fixture.destroy();
      tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
    });

    it('releases the device if the sheet closed while permission was pending', async () => {
      let resolveStream!: (s: MediaStream) => void;
      getUserMedia.and.returnValue(new Promise((r) => (resolveStream = r)));

      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      // Dismiss before permission resolves. The sheet is not rendered yet, so
      // there is no ✕ to click — go through the component directly.
      (fixture.componentInstance as unknown as { closeCamera(): void }).closeCamera();
      resolveStream(stream);
      await fixture.whenStable();

      tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
    });

    it('surfaces a denied permission instead of hanging', async () => {
      getUserMedia.and.rejectWith(new DOMException('Permission denied', 'NotAllowedError'));

      query<HTMLButtonElement>(fixture, '.cam-btn')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(fixture, '.cam-error')!.textContent).toContain('Camera unavailable');
      // No shutter offered when there is no stream to capture from.
      expect(query(fixture, '.cam-shutter')).toBeNull();
    });

    it('hides the camera path when getUserMedia is unavailable', () => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      const bare = TestBed.createComponent(ImagePicker);
      bare.detectChanges();

      expect(bare.nativeElement.querySelector('.cam-btn')).toBeNull();
    });

    it('hides the camera path when sources is upload-only', () => {
      fixture.componentRef.setInput('sources', 'upload');
      fixture.detectChanges();
      expect(query(fixture, '.cam-btn')).toBeNull();
    });

    it('drops the secondary camera button when the zone itself is the camera', () => {
      fixture.componentRef.setInput('sources', 'camera');
      fixture.detectChanges();
      // One route in, not two: the zone opens the camera directly.
      expect(query(fixture, '.cam-btn')).toBeNull();
      expect(query(fixture, '.zone-title')!.textContent).toContain('Take a photo');
    });
  });
});
