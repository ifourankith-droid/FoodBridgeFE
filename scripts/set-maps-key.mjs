/**
 * Injects the Google Maps browser key into `environment.prod.ts` immediately before a production
 * build, from the `GOOGLE_MAPS_API_KEY` environment variable.
 *
 * WHY A BUILD STEP AND NOT AN AZURE APP SETTING
 * ---------------------------------------------
 * Static Web Apps "environment variables" / application settings are only visible to its **managed
 * Functions API**, server-side. This project is a plain Angular SPA with no Functions backend: the
 * browser downloads static JS, so there is no server left to read a variable at request time.
 * `environment.googleMapsApiKey` is a compile-time constant — the value has to be present when
 * `ng build` runs, which is what this script arranges. Setting GOOGLE_MAPS_API_KEY in the Static Web
 * App's configuration blade has no effect on the bundle whatsoever.
 *
 * ON SECRECY: a Maps *browser* key cannot be hidden. It ships in the bundle and is visible in
 * DevTools to anyone who loads the site — that is true of every client-side Maps integration,
 * Google's own docs included. It is kept in a CI secret so it stays out of git history, but the real
 * protection against someone else spending your quota is an **HTTP referrer restriction** plus an
 * API allow-list on the key itself, in Google Cloud Console. Do both.
 *
 * Deliberately a no-op when the variable is unset, so a local `ng build --configuration production`
 * still works — it just produces a keyless bundle, which renders the static placeholder card rather
 * than a broken map.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../src/environments/environment.prod.ts', import.meta.url);

/** The committed line the real key replaces. Kept empty in git so no key is ever checked in. */
const MARKER = /googleMapsApiKey:\s*'[^']*'/;

const key = process.env.GOOGLE_MAPS_API_KEY?.trim();

if (!key) {
  console.log(
    '[set-maps-key] GOOGLE_MAPS_API_KEY is not set — leaving environment.prod.ts untouched. ' +
      'The bundle will ship without a Maps key and the map will render its placeholder card.',
  );
  process.exit(0);
}

// A wrong-looking value here costs a whole deploy to discover, since the failure is a silent
// placeholder card rather than a build error. Google browser keys are 39 chars starting "AIza".
if (!/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
  console.error(
    `::error::GOOGLE_MAPS_API_KEY does not look like a Google API key (expected 39 characters ` +
      `beginning "AIza", got ${key.length}). Refusing to build with it — check the secret's value.`,
  );
  process.exit(1);
}

const source = readFileSync(TARGET, 'utf8');

if (!MARKER.test(source)) {
  console.error(
    '::error::Could not find a `googleMapsApiKey: \'…\'` line in environment.prod.ts. ' +
      'The file was restructured — update scripts/set-maps-key.mjs to match.',
  );
  process.exit(1);
}

writeFileSync(TARGET, source.replace(MARKER, `googleMapsApiKey: '${key}'`), 'utf8');

// Never log the key itself — CI logs are readable by anyone with repo access.
console.log(
  `[set-maps-key] Injected the Maps key into environment.prod.ts (…${key.slice(-4)}, ${key.length} chars).`,
);
