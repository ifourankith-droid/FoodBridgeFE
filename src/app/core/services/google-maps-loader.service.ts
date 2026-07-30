import { Injectable, signal } from '@angular/core';
import { environment } from '@env/environment';

export type MapsLoadState = 'idle' | 'loading' | 'ready' | 'no-key' | 'error';

/**
 * Loads the Google Maps JavaScript API on demand, exactly once, using the key
 * from `environment.googleMapsApiKey`. Components await `load()` before
 * rendering a `<google-map>`; when no key is configured it resolves to a
 * `no-key` state so callers can show a graceful fallback instead of erroring.
 *
 * Uses Google's official inline bootstrap loader, which installs
 * `google.maps.importLibrary` — the entry point `@angular/google-maps`
 * relies on. (A plain `<script src=".../js">` tag does not reliably expose it.)
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  /** Reactive load state, handy for template `@if` branches. */
  readonly state = signal<MapsLoadState>('idle');

  private promise: Promise<MapsLoadState> | null = null;

  /** Additional Maps libraries to request (e.g. 'places', 'geometry'). */
  private readonly libraries = ['places', 'geometry', 'marker'];

  get isReady(): boolean {
    return this.state() === 'ready';
  }

  /** Load the API once; repeated calls share the same promise. */
  load(): Promise<MapsLoadState> {
    if (this.promise) {
      return this.promise;
    }

    this.promise = (async (): Promise<MapsLoadState> => {
      // Already available (loaded here or elsewhere) — reuse it.
      if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') {
        this.state.set('ready');
        return 'ready';
      }

      const key = environment.googleMapsApiKey?.trim();
      if (!key) {
        this.state.set('no-key');
        return 'no-key';
      }

      this.state.set('loading');
      // Google invokes this global when the key is rejected (InvalidKeyMapError,
      // RefererNotAllowed, etc.). Flip to `error` so we show our own placeholder
      // instead of Google's broken "Oops!" overlay.
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () =>
        this.state.set('error');
      try {
        this.installBootstrap(key);
        // Force the core library to resolve so the API is truly usable.
        await google.maps.importLibrary('maps');
        this.state.set('ready');
        return 'ready';
      } catch {
        this.state.set('error');
        return 'error';
      }
    })();

    return this.promise;
  }

  /**
   * Injects Google's official inline bootstrap loader. It defines
   * `google.maps.importLibrary` synchronously and lazily fetches libraries on
   * first use. Parameterised with the API key and the libraries we need.
   */
  private installBootstrap(key: string): void {
    const libs = this.libraries.join(',');
    const script = document.createElement('script');
    // Verbatim Google loader snippet; key/libraries injected as JSON literals.
    script.textContent =
      `(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",` +
      `q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),` +
      `r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await(a=m.createElement("script"));` +
      `e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);` +
      `e.set("callback",c+".maps."+q);a.src=\`https://maps.\${c}apis.com/maps/api/js?\`+e;d[q]=f;` +
      `a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";` +
      `m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):` +
      `d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})(` +
      `{key:${JSON.stringify(key)},v:"weekly",libraries:${JSON.stringify(libs)}});`;
    document.head.appendChild(script);
  }
}
