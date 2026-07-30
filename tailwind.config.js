/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

/* ============================================================
   BRAND THEMES

   The app ships all of these and switches between them at
   RUNTIME (Settings → Brand colour, persisted to localStorage).
   ThemeService puts a `theme-<name>` class on <body>; the CSS
   variables below are emitted for every theme by the plugin at
   the bottom of this file.

   DEFAULT_THEME is only the pre-hydration fallback baked into
   :root — i.e. what a brand-new visitor sees before they pick.
   ============================================================ */
const DEFAULT_THEME = 'terracotta';

/* Hex is the single source of truth; every channel triplet, dark-mode tint
   and gradient below is derived from it.

     primary.DEFAULT — buttons, active states. White text sits on this, so
                       each is chosen to clear WCAG AA (>= 4.5:1).
     primary.deep    — gradient end, link text, text on `soft` fills.
     primary.bright  — hover/dark-mode text (must read on dark surfaces).
     primary.soft    — tinted fills, selected cards, focus rings.
     accent.*        — warm counterpoint for avatars/badges/gradients.
                       Surface + gradient use only — not for body text. */
const THEMES = {
  // Warm terracotta — the original prototype palette. Appetising and
  // food-forward, but primary.DEFAULT is only 3.1:1 on white text.
  terracotta: {
    // `deep` is #a9522f rather than the prototype's #b65c3f: as a foreground on
    // its own `soft` fill the original was 4.09:1, under WCAG AA.
    primary: { DEFAULT: '#d87757', deep: '#a9522f', bright: '#e2906c', soft: '#fdf0e7' },
    accent: { DEFAULT: '#ff7a3d', deep: '#e8621f', soft: '#ffeee3' },
  },

  // Teal + amber accent. Fresh, hygienic and trustworthy; the amber keeps
  // food warmth. 5.5:1 on white text.
  teal: {
    primary: { DEFAULT: '#0f766e', deep: '#134e4a', bright: '#2dd4bf', soft: '#f0fdfa' },
    accent: { DEFAULT: '#f59e0b', deep: '#b45309', soft: '#fffbeb' },
  },

  // Navy + gold accent. Institutional credibility — reads well to municipal
  // partners and CSR donors. 8.7:1 on white text.
  navy: {
    primary: { DEFAULT: '#1e40af', deep: '#172554', bright: '#60a5fa', soft: '#eff6ff' },
    accent: { DEFAULT: '#f59e0b', deep: '#b45309', soft: '#fffbeb' },
  },

  // Emerald + orange accent. Sustainability / "rescued food" story. Note it
  // shares hue space with the `success` token, so success states read less
  // distinctly. 5.5:1 on white text.
  emerald: {
    primary: { DEFAULT: '#047857', deep: '#064e3b', bright: '#34d399', soft: '#ecfdf5' },
    accent: { DEFAULT: '#f97316', deep: '#c2410c', soft: '#fff7ed' },
  },

  // Indigo + amber accent. Modern product feel, maximum separation from the
  // green success states. 6.3:1 on white text.
  indigo: {
    primary: { DEFAULT: '#4f46e5', deep: '#3730a3', bright: '#818cf8', soft: '#eef2ff' },
    accent: { DEFAULT: '#f59e0b', deep: '#b45309', soft: '#fffbeb' },
  },
};

if (!THEMES[DEFAULT_THEME]) {
  throw new Error(
    `tailwind.config.js: unknown DEFAULT_THEME "${DEFAULT_THEME}". ` +
      `Expected one of: ${Object.keys(THEMES).join(', ')}`,
  );
}

// ---- Colour helpers -------------------------------------------------------
const SURFACE_DARK = '#241e19'; // body.dark card surface

/** '#d87757' -> [216, 119, 87] */
function channels(hex) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#d87757' -> '216 119 87' (space-separated, for rgb(... / <alpha>)) */
function triplet(hex) {
  return channels(hex).join(' ');
}

/** Blend `hex` over `onto` at `weight` opacity, returning a triplet. */
function blend(hex, onto, weight) {
  const a = channels(hex);
  const b = channels(onto);
  return a.map((v, i) => Math.round(v * weight + b[i] * (1 - weight))).join(' ');
}

/**
 * The light-mode `soft` tints are near-white, which blows out on a dark
 * surface. Derive an equivalent dark tint by blending the brand hue over the
 * dark surface instead — keeps the same "subtle brand-tinted fill" reading.
 */
function softDark(hex) {
  return blend(hex, SURFACE_DARK, 0.22);
}

/** [r,g,b] (0-255) -> { h: 0-360, s: 0-100, l: 0-100 } */
function toHsl([r255, g255, b255]) {
  const [r, g, b] = [r255 / 255, g255 / 255, b255 / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

/** { h, s, l } -> '#rrggbb' */
function hslToHex(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.min(5, Math.floor(hp))];
  const m = L - c / 2;
  return (
    '#' +
    [r1, g1, b1]
      .map((v) => Math.round((v + m) * 255))
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Recolour: keep the HUE of `hex` but force a specific lightness/saturation.
 *
 * This is what lets every surface — page background, sidebar, borders, body
 * text — carry the brand hue while staying at a fixed, predictable contrast
 * across all five palettes. Anchoring on lightness rather than blending
 * matters because the palettes' own lightness differs a lot (navy's `deep` is
 * far darker than terracotta's), so a plain blend would produce a near-black
 * sidebar for one theme and a mid-brown one for another.
 *
 * `sMax` caps saturation instead of setting it, for cases where a muted
 * palette should stay muted.
 */
function tint(hex, { s, sMax, l }) {
  const hsl = toHsl(channels(hex));
  const sat = s ?? Math.min(hsl.s, sMax ?? 100);
  return hslToHex(hsl.h, sat, l);
}

/** 'R G B' + alpha -> 'rgb(R G B / 0.3)' */
function alpha(tripletStr, a) {
  return `rgb(${tripletStr} / ${a})`;
}

/**
 * Every brand-derived custom property, for one theme.
 *
 * These must ALL be declared in the same rule as the triplets they read.
 * `var()` is substituted on the element where the property is *declared*, not
 * where it is used — so a `--fb-primary: rgb(var(--fb-primary-rgb))` sitting
 * on :root would freeze at the default palette and never follow the
 * `theme-*` class on <body>.
 */
function varsFor(theme) {
  const p = theme.primary;
  const a = theme.accent;
  const softP = triplet(p.soft);
  const softA = triplet(a.soft);
  return {
    // Raw channels — consumed by the Tailwind colour utilities (which append
    // `/ <alpha-value>`) and by component CSS needing custom opacity.
    '--fb-primary-rgb': triplet(p.DEFAULT),
    '--fb-primary-deep-rgb': triplet(p.deep),
    '--fb-primary-bright-rgb': triplet(p.bright),
    // `deep` as a FOREGROUND. Split from the triplet above because the two
    // roles need opposite behaviour in dark mode: gradients and glows must keep
    // the true (dark) deep, while deep-coloured *text* has to become `bright`
    // or it lands dark-on-dark — `text-primary-deep` on a `bg-primary-soft`
    // fill measured 1.02:1 on navy before this split. See darkVarsFor().
    '--fb-primary-deep-fg-rgb': triplet(p.deep),
    '--fb-primary-soft-rgb': softP,
    '--fb-accent-rgb': triplet(a.DEFAULT),
    '--fb-accent-deep-rgb': triplet(a.deep),
    '--fb-accent-soft-rgb': softA,
    // Named tokens — the ergonomic form used throughout the SCSS.
    '--fb-primary': p.DEFAULT,
    '--fb-primary-deep': p.deep,
    '--fb-primary-bright': p.bright,
    '--fb-primary-soft': p.soft,
    '--fb-accent': a.DEFAULT,
    '--fb-accent-deep': a.deep,
    '--fb-accent-soft': a.soft,
    // Legacy accent aliases, kept so existing rules keep working.
    '--fb-orange': a.DEFAULT,
    '--fb-orange-soft': a.soft,
    // Translucent brand tints (button glows, radial washes).
    '--fb-glow-primary': alpha(triplet(p.DEFAULT), 0.3),
    '--fb-glow-primary-deep': alpha(triplet(p.deep), 0.25),
    '--fb-wash-primary': alpha(triplet(p.bright), 0.18),
    '--fb-wash-accent': alpha(triplet(a.DEFAULT), 0.16),
    // Focus ring.
    '--fb-ring': `0 0 0 3px ${p.soft}`,

    // ---- Surfaces (light mode) -------------------------------------------
    // The page sits on a barely-there tint of the brand hue; cards stay pure
    // white so they lift off it. Borders and body copy carry the same hue at
    // higher lightness / lower saturation.
    ...surfaceVars({
      // l:97 with the saturation lifted to 60 — a lighter, airier page than the
      // old l:96/s:44 while keeping a *visible* brand tint rather than washing
      // out to plain white (terracotta #fcf5f3, teal #f3fcfb).
      //
      // The two constraints this balances, measured across all five palettes:
      //   · `muted` body text (used ~90×) IMPROVES as the page lightens —
      //     worst case teal 4.66:1 → 4.78:1, so AA has more margin, not less.
      //   · white-card-vs-page fill contrast drops (teal/emerald 1.07 → 1.04).
      //     Cards stay delineated because `.card-fb` carries a 1px `line`
      //     border, and border-vs-page contrast moves the other way (1.13 →
      //     1.16) since `line` is pinned at l:90. Below ~l:97 the page reads
      //     beige; much above it the border is doing all the work alone.
      bg: tint(p.DEFAULT, { l: 97, s: 60 }),
      surface: '#ffffff',
      ink: tint(p.DEFAULT, { l: 14, s: 22 }),
      // l:41 not 43 — `text-muted` is used ~90 times, and at 43 the teal and
      // emerald palettes landed at 4.4:1 on their own background, just under
      // WCAG AA. 41 clears 4.5:1 for every palette (worst case 4.76:1).
      muted: tint(p.DEFAULT, { l: 41, s: 11 }),
      line: tint(p.DEFAULT, { l: 90, s: 26 }),
    }),

    // ---- Sidebar shell ---------------------------------------------------
    // Deliberately dark in BOTH modes (the reference design), so it reads as
    // navigation chrome rather than content. Derived from `deep` at a fixed
    // lightness so every palette lands equally dark.
    ...shellVars(p),
  };
}

/** Page/card/text surfaces, as both named tokens and channel triplets. */
function surfaceVars({ bg, surface, ink, muted, line }) {
  return {
    '--fb-bg': bg,
    '--fb-surface': surface,
    '--fb-ink': ink,
    '--fb-muted': muted,
    '--fb-line': line,
    '--fb-bg-rgb': triplet(bg),
    '--fb-surface-rgb': triplet(surface),
    '--fb-ink-rgb': triplet(ink),
    '--fb-muted-rgb': triplet(muted),
    '--fb-line-rgb': triplet(line),
  };
}

/**
 * The dark navigation shell. `l` values are fixed constants rather than
 * derived from the palette so contrast inside the sidebar is identical for
 * every theme; only the hue changes.
 */
function shellVars(p) {
  return {
    '--fb-sidebar': tint(p.deep, { l: 13, sMax: 52 }),
    '--fb-sidebar-raised': tint(p.deep, { l: 19, sMax: 46 }),
    '--fb-sidebar-line': tint(p.deep, { l: 26, sMax: 38 }),
    '--fb-sidebar-ink': tint(p.DEFAULT, { l: 96, s: 22 }),
    '--fb-sidebar-muted': tint(p.DEFAULT, { l: 71, s: 15 }),
    '--fb-sidebar-rgb': triplet(tint(p.deep, { l: 13, sMax: 52 })),
  };
}

/** Dark-mode overrides for one theme: the `soft` fills and every surface. */
function darkVarsFor(theme) {
  const p = theme.primary;
  const softP = softDark(p.DEFAULT);
  const softA = softDark(theme.accent.DEFAULT);
  return {
    '--fb-primary-soft-rgb': softP,
    '--fb-accent-soft-rgb': softA,
    '--fb-primary-soft': alpha(softP, 1),
    '--fb-accent-soft': alpha(softA, 1),
    '--fb-orange-soft': alpha(softA, 1),
    '--fb-ring': `0 0 0 3px ${alpha(softP, 1)}`,

    // Flip the brand foreground to `bright`. In dark mode the `soft` fills are
    // dark, so a `deep` foreground on them is dark-on-dark. Only the FG form
    // flips — `--fb-primary-deep-rgb` keeps the true deep so gradients and the
    // button glows stay correct.
    '--fb-primary-deep': p.bright,
    '--fb-primary-deep-fg-rgb': triplet(p.bright),

    // Same problem, same fix, for the fixed success colour: the light-mode
    // `deep` green is unreadable on a dark surface. Theme-independent, but it
    // lives here so it applies under any `.dark` scope, not just body.dark.
    '--fb-success-deep': '#4ade80',
    // ...and its `soft` fill has to darken alongside, or the flipped bright
    // `deep` foreground lands on a near-white tile (~1.7:1). Every
    // success-soft + success-deep pairing in the app depends on this staying
    // in step — the verified badge, toast icons, the delivery done-note.
    '--fb-success-soft': alpha(softDark('#1e9e5c'), 1),

    // Same hue as light mode, inverted lightness. The page is darker than the
    // cards so the elevation hierarchy survives the flip.
    ...surfaceVars({
      bg: tint(p.DEFAULT, { l: 7, s: 20 }),
      surface: tint(p.DEFAULT, { l: 11, s: 16 }),
      ink: tint(p.DEFAULT, { l: 94, s: 14 }),
      muted: tint(p.DEFAULT, { l: 62, s: 12 }),
      line: tint(p.DEFAULT, { l: 21, s: 18 }),
    }),
  };
}

// Colours resolve through CSS vars so runtime theme switching reaches every
// Tailwind utility (bg-primary, text-primary-deep, bg-primary/20, ...).
// `<alpha-value>` is Tailwind's placeholder for the opacity modifier.
const v = (name) => `rgb(var(--fb-${name}-rgb) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // ThemeService and the Settings picker compose these class names at runtime
  // (`theme-${id}`), so the content scanner never sees them as literals and
  // would purge the palette rules the plugin emits below. Derived from THEMES
  // so adding a palette needs no change here.
  safelist: Object.keys(THEMES).map((name) => `theme-${name}`),
  darkMode: 'class', // matches the prototype's `body.dark` theme
  theme: {
    extend: {
      colors: {
        // ---- FoodBridge brand — var-driven, see ThemeService ----
        primary: {
          DEFAULT: v('primary'),
          // Foreground-only (text-primary-deep) — hence the -fg var, which
          // flips to `bright` in dark mode. Gradients read the raw triplet via
          // backgroundImage below, so they are unaffected.
          deep: v('primary-deep-fg'),
          bright: v('primary-bright'),
          soft: v('primary-soft'),
        },
        accent: {
          DEFAULT: v('accent'),
          deep: v('accent-deep'),
          soft: v('accent-soft'),
        },
        // `orange` is the legacy accent alias used by existing markup.
        // Aliasing it to the theme accent retints those spots too, while
        // Tailwind's built-in orange-50..950 scale survives the deep merge
        // (badge-pending relies on orange-100/700).
        orange: {
          DEFAULT: v('accent'),
          soft: v('accent-soft'),
        },
        success: {
          DEFAULT: '#1e9e5c',
          deep: '#146c43',
          soft: '#e7f7ee',
        },
        // ---- Neutrals / surfaces — brand-tinted, so text-muted and
        // border-line follow the active palette like everything else ----
        cream: v('bg'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        surface: v('surface'),
        // The dark navigation chrome: bg-sidebar, text-sidebar-ink, ...
        sidebar: {
          DEFAULT: v('sidebar'),
          raised: 'var(--fb-sidebar-raised)',
          line: 'var(--fb-sidebar-line)',
          ink: 'var(--fb-sidebar-ink)',
          muted: 'var(--fb-sidebar-muted)',
        },
        // ---- Status badge palette (listing lifecycle) ----
        status: {
          pending: '#ff7a3d',
          claimed: '#9a6b00',
          pickedup: '#2258c7',
          delivered: '#146c43',
          confirmed: '#0f7a45',
          expired: '#8a8a8a',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Poppins"', 'sans-serif'],
      },
      borderRadius: {
        fb: '20px', // --radius
        'fb-btn': '14px',
      },
      boxShadow: {
        fb: '0 10px 30px rgba(20, 60, 35, 0.08)', // --shadow
        'fb-lg': '0 20px 50px rgba(20, 60, 35, 0.14)', // --shadow-lg
      },
      backgroundImage: {
        'gradient-primary':
          'linear-gradient(135deg, rgb(var(--fb-primary-rgb)), rgb(var(--fb-primary-deep-rgb)))',
        'gradient-accent':
          'linear-gradient(135deg, rgb(var(--fb-accent-rgb)), rgb(var(--fb-accent-deep-rgb)))',
        // Legacy alias — same gradient as gradient-accent.
        'gradient-orange':
          'linear-gradient(135deg, rgb(var(--fb-accent-rgb)), rgb(var(--fb-accent-deep-rgb)))',
      },
    },
  },
  plugins: [
    /* Emit every theme's variables so ThemeService can swap them by toggling a
       single class on <body>, with no rebuild.

       The selector is a bare `.theme-x` rather than `body.theme-x` so any
       element can opt into a palette — that's what lets the Settings picker
       render each theme's real swatch without duplicating hexes in TS.

       Custom properties inherit, so `.theme-x` on <body> already beats
       `:root` on <html> regardless of specificity. Within <body> though,
       specificity decides: `.theme-x.dark` (0,2,0) must outrank the
       default-theme `body.dark` (0,1,1) — it does, on class count. */
    plugin(({ addBase }) => {
      const fallback = THEMES[DEFAULT_THEME];
      const base = {
        ':root': varsFor(fallback),
        'body.dark': darkVarsFor(fallback),
      };
      for (const [name, theme] of Object.entries(THEMES)) {
        base[`.theme-${name}`] = varsFor(theme);
        base[`.theme-${name}.dark`] = darkVarsFor(theme);
      }
      addBase(base);
    }),
  ],
};
