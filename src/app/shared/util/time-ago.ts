const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact "x ago" label for activity timestamps.
 *
 * `nowMs` is passed in — callers hand it {@link ClockService.now} so the label
 * re-renders on the shared 30s tick instead of each call site reading the wall
 * clock (which a signal graph can't invalidate).
 */
export function timeAgo(isoUtc: string, nowMs: number): string {
  const then = parseUtc(isoUtc);
  if (Number.isNaN(then)) {
    return '';
  }

  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < MINUTE) {
    return 'Just now';
  }
  if (seconds < HOUR) {
    return `${Math.floor(seconds / MINUTE)}m ago`;
  }
  if (seconds < DAY) {
    return `${Math.floor(seconds / HOUR)}h ago`;
  }

  const days = Math.floor(seconds / DAY);
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo ago`;
  }
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * `datetime2` columns come back without a timezone designator (Dapper hands
 * back `DateTimeKind.Unspecified`, so System.Text.Json omits the `Z`), and bare
 * `new Date('2026-07-28T10:00:00')` would read that as *local* time — an "x ago"
 * label off by the viewer's UTC offset. The field is `...Utc` by contract, so
 * treat a naked timestamp as UTC. Strings that already carry an offset or `Z`
 * (e.g. locally pushed notifications) pass through untouched.
 */
function parseUtc(isoUtc: string): number {
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(isoUtc);
  return new Date(hasZone ? isoUtc : `${isoUtc}Z`).getTime();
}

/** Calendar-day bucket for grouping a list into Today / Yesterday / Earlier. */
export type DayBucket = 'today' | 'yesterday' | 'earlier';

export function dayBucket(isoUtc: string, nowMs: number): DayBucket {
  const then = parseUtc(isoUtc);
  if (Number.isNaN(then)) {
    return 'earlier';
  }

  const startOfToday = new Date(nowMs).setHours(0, 0, 0, 0);
  if (then >= startOfToday) {
    return 'today';
  }
  return then >= startOfToday - DAY * 1000 ? 'yesterday' : 'earlier';
}
