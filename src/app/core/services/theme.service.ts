import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';

const THEME_KEY = 'foodbridge.theme.dark';
const BRAND_KEY = 'foodbridge.theme.brand';

/**
 * Selectable brand palettes. The `id` must match a key in `THEMES` in
 * tailwind.config.js — that file owns the actual colours, and emits a
 * `.theme-<id>` class carrying this palette's CSS variables. Nothing here
 * hard-codes a hex; swatches read `--fb-primary-rgb` off that class.
 */
export const BRAND_THEMES = [
  { id: 'terracotta', label: 'Terracotta', hint: 'Warm & appetising' },
  { id: 'teal', label: 'Teal', hint: 'Fresh & trustworthy' },
  { id: 'navy', label: 'Navy Blue', hint: 'Institutional' },
  { id: 'emerald', label: 'Emerald', hint: 'Sustainable' },
  { id: 'indigo', label: 'Indigo', hint: 'Modern' },
] as const;

export type BrandTheme = (typeof BRAND_THEMES)[number]['id'];

/** Must match DEFAULT_THEME in tailwind.config.js. */
const DEFAULT_BRAND: BrandTheme = 'terracotta';

function isBrandTheme(value: unknown): value is BrandTheme {
  return BRAND_THEMES.some((t) => t.id === value);
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageService);

  readonly themes = BRAND_THEMES;

  /** Hydrated from localStorage so the theme choice is global and sticky. */
  readonly darkMode = signal(this.storage.getItem<boolean>(THEME_KEY) ?? false);

  /** Active brand palette. Falls back to the default if storage holds junk
   *  or a theme that has since been removed from the config. */
  readonly brand = signal<BrandTheme>(this.readStoredBrand());

  /**
   * Resolved hex of the active theme's primary, for the few places that need
   * a literal colour rather than a CSS var (canvas, SVG data URIs, the
   * theme-color meta tag). Re-read whenever the palette changes.
   */
  readonly primaryHex = signal('#d87757');

  constructor() {
    // Apply + persist whenever the preference changes (runs once on init too).
    effect(() => {
      const dark = this.darkMode();
      this.document.body.classList.toggle('dark', dark);
      this.storage.setItem(THEME_KEY, dark);
    });

    effect(() => {
      const brand = this.brand();
      const body = this.document.body;
      // Swap the palette class, leaving any other classes (e.g. `dark`) alone.
      for (const t of BRAND_THEMES) {
        body.classList.toggle(`theme-${t.id}`, t.id === brand);
      }
      this.storage.setItem(BRAND_KEY, brand);
      this.syncResolvedColors();
    });
  }

  toggle(): void {
    this.darkMode.update((dark) => !dark);
  }

  setBrand(brand: BrandTheme): void {
    this.brand.set(brand);
  }

  private readStoredBrand(): BrandTheme {
    const stored = this.storage.getItem<string>(BRAND_KEY);
    return isBrandTheme(stored) ? stored : DEFAULT_BRAND;
  }

  /**
   * Read the freshly-applied `--fb-primary-rgb` back out of the cascade, so
   * tailwind.config.js stays the single source of truth for the hex. Also
   * keeps the browser chrome colour (`<meta name="theme-color">`) in step.
   */
  private syncResolvedColors(): void {
    const raw = getComputedStyle(this.document.body)
      .getPropertyValue('--fb-primary-rgb')
      .trim();
    if (!raw) {
      return;
    }
    const [r, g, b] = raw.split(/[\s,]+/).map(Number);
    if ([r, g, b].some((c) => !Number.isFinite(c))) {
      return;
    }
    const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    this.primaryHex.set(hex);
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', hex);
  }
}
