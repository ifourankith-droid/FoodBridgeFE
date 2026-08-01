import { formatDate } from '@angular/common';

/**
 * App-wide time zone. FoodBridge operates in India, so every wall-clock time —
 * pickup deadlines, join dates, timestamps — is entered and displayed in IST
 * regardless of the browser's own zone. Pair this with the global
 * `DATE_PIPE_DEFAULT_OPTIONS` timezone (see app.config) so template `| date`
 * pipes agree with these boundary conversions.
 */
export const APP_TIME_ZONE = 'Asia/Kolkata';

/** BCP-47 locale paired with {@link APP_TIME_ZONE}. */
export const APP_LOCALE = 'en-IN';

/**
 * IST as a fixed GMT offset. Angular's `DatePipe` / `formatDate` accept **only**
 * a numeric offset here (e.g. `+0530`), not an IANA zone name — passing
 * `Asia/Kolkata` silently falls back to the browser's own zone. India has no
 * DST, so this constant is exact year-round.
 */
export const APP_TIME_ZONE_OFFSET = '+0530';

const pad = (n: number): string => `${n}`.padStart(2, '0');

/**
 * Offset in minutes of {@link APP_TIME_ZONE} at a given instant, where
 * `localWallClock = utcInstant + offset`. Derived from `Intl` so it stays
 * correct for any zone (India has no DST, so a single pass is exact here).
 */
function zoneOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Interpret a picker wall-clock value (`YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD`) as a
 * time in {@link APP_TIME_ZONE} and return the matching UTC ISO string — what the
 * backend's `...Utc` fields expect.
 *
 * e.g. `2026-08-01T17:30` (IST) → `2026-08-01T12:00:00.000Z`.
 */
export function appZonedInputToUtcIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(value);
  if (!match) {
    // Not a wall-clock string — fall back to the browser's own parsing.
    return new Date(value).toISOString();
  }
  const [, year, month, day, hour, minute] = match;
  // Treat the wall-clock as if it were UTC, then subtract the zone's offset at
  // that instant to land on the true UTC moment.
  const guess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
  );
  const offset = zoneOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60_000).toISOString();
}

/**
 * Inverse of {@link appZonedInputToUtcIso}: a UTC ISO string → the picker's IST
 * wall-clock value `YYYY-MM-DDTHH:mm`.
 *
 * e.g. `2026-08-01T12:00:00Z` → `2026-08-01T17:30`.
 */
export function utcIsoToAppZonedInput(iso: string): string {
  const instant = new Date(iso);
  const local = new Date(instant.getTime() + zoneOffsetMinutes(instant) * 60_000);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
  );
}

/** "Now" as an IST wall-clock picker value — a zone-correct `min` for deadlines. */
export function appZonedNowInput(): string {
  return utcIsoToAppZonedInput(new Date().toISOString());
}

/**
 * Format a UTC/offset ISO instant as the app's standard "MMM d, h:mm a" display in
 * {@link APP_TIME_ZONE} — e.g. `2026-07-22T09:16:00Z` → "Jul 22, 2:46 PM". For code
 * that needs the same string a `| date` pipe produces but outside a template.
 */
export function appDateTime(iso: string): string {
  return formatDate(iso, 'MMM d, h:mm a', APP_LOCALE, APP_TIME_ZONE_OFFSET);
}

/**
 * The current instant — a single app-wide source of "now" so every time
 * comparison (expiry checks, deadline meters) reads the same clock and can be
 * stubbed in tests, instead of each caller reaching for `Date.now()` directly.
 */
export function appNow(): Date {
  return new Date();
}

/**
 * True when a UTC (or offset-tagged) ISO instant has already passed — i.e. it is
 * at or before {@link appNow}. Both sides are absolute instants, so the
 * comparison is time-zone agnostic; "now" still comes from the shared clock so
 * expiry is judged against one consistent, testable notion of the current time.
 */
export function isExpired(iso: string | null | undefined, now: Date = appNow()): boolean {
  if (!iso) {
    return false;
  }
  const at = Date.parse(iso);
  return Number.isFinite(at) && at <= now.getTime();
}

/**
 * Interpret a picker wall-clock value as IST and return an **offset-tagged** ISO
 * string that keeps the wall-clock visible while still naming the exact instant.
 *
 * e.g. `2026-08-01T17:30` → `2026-08-01T17:30:00+05:30` (the same moment as
 * `2026-08-01T12:00:00Z`). Preferred over the `…Z` form when the payload should
 * read back as the local time the donor actually chose.
 */
export function appZonedInputToOffsetIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(value);
  if (!match) {
    return new Date(value).toISOString();
  }
  const [, year, month, day, hour, minute] = match;
  const offset = `${APP_TIME_ZONE_OFFSET.slice(0, 3)}:${APP_TIME_ZONE_OFFSET.slice(3)}`;
  return `${year}-${month}-${day}T${pad(Number(hour ?? 0))}:${pad(Number(minute ?? 0))}:00${offset}`;
}
