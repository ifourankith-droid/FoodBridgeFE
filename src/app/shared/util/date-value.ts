/**
 * Local date/time value handling for {@link FbDatePicker}.
 *
 * The picker's control value uses the SAME string formats as the native inputs
 * it replaces, so it is a drop-in swap for `type="date" | "time" |
 * "datetime-local"` and existing form code keeps working:
 *
 *   date      `YYYY-MM-DD`
 *   time      `HH:mm`
 *   datetime  `YYYY-MM-DDTHH:mm`
 *
 * All of these are **local wall-clock** times, never UTC — same as the native
 * controls. Callers convert at the API boundary (`new Date(v).toISOString()`),
 * which is what the existing donor/volunteer forms already do.
 */
export type DatePickerMode = 'date' | 'time' | 'datetime';

const pad = (n: number): string => `${n}`.padStart(2, '0');

/** Parse a control value into a local `Date`. Returns null for empty/invalid. */
export function parseLocal(value: string | null | undefined, mode: DatePickerMode): Date | null {
  if (!value) {
    return null;
  }

  if (mode === 'time') {
    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) {
      return null;
    }
    const today = new Date();
    today.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return isValid(today) ? today : null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(value);
  if (!match) {
    return null;
  }
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    0,
    0,
  );
  return isValid(parsed) ? parsed : null;
}

/** Serialise a local `Date` back into the mode's control-value format. */
export function formatLocal(date: Date, mode: DatePickerMode): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (mode === 'time') {
    return time;
  }
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date' ? day : `${day}T${time}`;
}

/** Human-readable label for the closed trigger, e.g. "28 Jul 2026, 6:30 pm". */
export function formatDisplay(date: Date, mode: DatePickerMode, use12Hour: boolean): string {
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: use12Hour,
  });
  if (mode === 'time') {
    return time;
  }
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return mode === 'date' ? day : `${day}, ${time}`;
}

export function isValid(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The 42 cells (6 fixed weeks) of a month view. Always six rows so the panel
 * height doesn't jump as you page between months.
 */
export function monthGrid(year: number, month: number, weekStartsOn: number): Date[] {
  const leadingDays = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, 1 - leadingDays + i),
  );
}

/** Weekday headers in the grid's own order, localised. */
export function weekdayLabels(weekStartsOn: number): string[] {
  // 2024-01-07 was a Sunday, so it anchors day-of-week 0.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + ((weekStartsOn + i) % 7))
      .toLocaleDateString(undefined, { weekday: 'short' })
      .slice(0, 2),
  );
}

/** Localised month names, January first. */
export function monthLabels(style: 'long' | 'short' = 'short'): string[] {
  return Array.from({ length: 12 }, (_, m) =>
    new Date(2024, m, 1).toLocaleDateString(undefined, { month: style }),
  );
}

export function clampToRange(date: Date, min: Date | null, max: Date | null): Date {
  if (min && date < min) {
    return new Date(min);
  }
  if (max && date > max) {
    return new Date(max);
  }
  return date;
}

/** A day is selectable when *any* instant within it falls inside the range. */
export function isDayDisabled(day: Date, min: Date | null, max: Date | null): boolean {
  return (!!min && endOfDay(day) < min) || (!!max && startOfDay(day) > max);
}

/** True when no minute of the given month is reachable — used to gate paging. */
export function isMonthDisabled(
  year: number,
  month: number,
  min: Date | null,
  max: Date | null,
): boolean {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return (!!min && endOfDay(lastDay) < min) || (!!max && startOfDay(firstDay) > max);
}

/** Combine a calendar day with an hour/minute, keeping everything local. */
export function withTime(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

/** Round up to the next `step` minutes — a sane default when opening empty. */
export function roundUpToStep(date: Date, step: number): Date {
  if (step <= 1) {
    return date;
  }
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % step;
  if (remainder) {
    rounded.setMinutes(rounded.getMinutes() + (step - remainder));
  }
  return rounded;
}
