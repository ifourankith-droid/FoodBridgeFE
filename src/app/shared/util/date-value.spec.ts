import {
  clampToRange,
  formatDisplay,
  formatLocal,
  isDayDisabled,
  isMonthDisabled,
  isSameDay,
  monthGrid,
  parseLocal,
  roundUpToStep,
  weekdayLabels,
  withTime,
} from './date-value';

describe('date-value', () => {
  describe('parseLocal', () => {
    it('reads a datetime as local wall-clock, not UTC', () => {
      const parsed = parseLocal('2026-07-28T18:30', 'datetime');
      // Would be shifted by the runner's UTC offset if it went through Date.parse.
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(6);
      expect(parsed?.getDate()).toBe(28);
      expect(parsed?.getHours()).toBe(18);
      expect(parsed?.getMinutes()).toBe(30);
    });

    it('defaults the time to midnight for date-only values', () => {
      const parsed = parseLocal('2026-07-28', 'date');
      expect(parsed?.getHours()).toBe(0);
      expect(parsed?.getMinutes()).toBe(0);
    });

    it('anchors a bare time to today', () => {
      const parsed = parseLocal('07:05', 'time');
      const today = new Date();
      expect(isSameDay(parsed, today)).toBeTrue();
      expect(parsed?.getHours()).toBe(7);
      expect(parsed?.getMinutes()).toBe(5);
    });

    it('returns null for empty and malformed input', () => {
      expect(parseLocal('', 'date')).toBeNull();
      expect(parseLocal(null, 'date')).toBeNull();
      expect(parseLocal('not-a-date', 'datetime')).toBeNull();
      expect(parseLocal('28/07/2026', 'date')).toBeNull();
    });
  });

  describe('formatLocal', () => {
    it('round-trips each mode through parseLocal', () => {
      expect(formatLocal(parseLocal('2026-07-28T18:30', 'datetime')!, 'datetime')).toBe(
        '2026-07-28T18:30',
      );
      expect(formatLocal(parseLocal('2026-07-28', 'date')!, 'date')).toBe('2026-07-28');
      expect(formatLocal(parseLocal('07:05', 'time')!, 'time')).toBe('07:05');
    });

    it('zero-pads single-digit months, days, hours and minutes', () => {
      expect(formatLocal(new Date(2026, 0, 3, 4, 5), 'datetime')).toBe('2026-01-03T04:05');
    });

    it('emits a value the native input would accept', () => {
      const input = document.createElement('input');
      input.type = 'datetime-local';
      input.value = formatLocal(new Date(2026, 6, 28, 18, 30), 'datetime');
      expect(input.value).toBe('2026-07-28T18:30');
    });
  });

  describe('formatDisplay', () => {
    it('includes the date and time for datetime, date only for date', () => {
      const date = new Date(2026, 6, 28, 18, 30);
      expect(formatDisplay(date, 'date', true)).not.toContain(':');
      expect(formatDisplay(date, 'datetime', true)).toContain(':');
      expect(formatDisplay(date, 'time', true)).toContain(':');
    });
  });

  describe('monthGrid', () => {
    it('always returns six full weeks so the panel height is stable', () => {
      for (let month = 0; month < 12; month++) {
        expect(monthGrid(2026, month, 0).length).toBe(42);
      }
    });

    it('starts on the configured first day of the week', () => {
      expect(monthGrid(2026, 6, 0)[0]?.getDay()).toBe(0);
      expect(monthGrid(2026, 6, 1)[0]?.getDay()).toBe(1);
    });

    it('covers every day of the target month', () => {
      const grid = monthGrid(2026, 1, 0); // February 2026
      const inMonth = grid.filter((d) => d.getMonth() === 1);
      expect(inMonth.length).toBe(28);
      expect(inMonth[0]?.getDate()).toBe(1);
    });

    it('spans a month boundary without skipping or repeating a day', () => {
      const grid = monthGrid(2026, 6, 0);
      for (let i = 1; i < grid.length; i++) {
        const gap = grid[i]!.getTime() - grid[i - 1]!.getTime();
        // Exactly one calendar day apart, tolerating a DST shift.
        expect(gap).toBeGreaterThanOrEqual(23 * 3600_000);
        expect(gap).toBeLessThanOrEqual(25 * 3600_000);
      }
    });
  });

  describe('weekdayLabels', () => {
    it('rotates to match the configured week start', () => {
      const fromSunday = weekdayLabels(0);
      const fromMonday = weekdayLabels(1);
      expect(fromSunday.length).toBe(7);
      expect(fromMonday[0]).toBe(fromSunday[1]!);
      expect(fromMonday[6]).toBe(fromSunday[0]!);
    });
  });

  describe('range helpers', () => {
    const min = new Date(2026, 6, 10, 9, 0);
    const max = new Date(2026, 6, 20, 17, 0);

    it('clamps outside dates to the nearest bound and leaves inside ones alone', () => {
      expect(clampToRange(new Date(2026, 6, 1), min, max).getTime()).toBe(min.getTime());
      expect(clampToRange(new Date(2026, 6, 25), min, max).getTime()).toBe(max.getTime());
      const inside = new Date(2026, 6, 15, 12, 0);
      expect(clampToRange(inside, min, max).getTime()).toBe(inside.getTime());
    });

    it('keeps the boundary days selectable even when the bound is mid-day', () => {
      expect(isDayDisabled(new Date(2026, 6, 10), min, max)).toBeFalse();
      expect(isDayDisabled(new Date(2026, 6, 20), min, max)).toBeFalse();
      expect(isDayDisabled(new Date(2026, 6, 9), min, max)).toBeTrue();
      expect(isDayDisabled(new Date(2026, 6, 21), min, max)).toBeTrue();
    });

    it('treats a null bound as unbounded on that side', () => {
      expect(isDayDisabled(new Date(1990, 0, 1), null, max)).toBeFalse();
      expect(isDayDisabled(new Date(2090, 0, 1), min, null)).toBeFalse();
    });

    it('disables only months with no reachable day', () => {
      expect(isMonthDisabled(2026, 6, min, max)).toBeFalse();
      expect(isMonthDisabled(2026, 5, min, max)).toBeTrue();
      expect(isMonthDisabled(2026, 7, min, max)).toBeTrue();
    });
  });

  describe('withTime', () => {
    it('keeps the calendar day and replaces the clock time', () => {
      const combined = withTime(new Date(2026, 6, 28, 3, 15), 18, 45);
      expect(formatLocal(combined, 'datetime')).toBe('2026-07-28T18:45');
    });
  });

  describe('roundUpToStep', () => {
    it('advances to the next step boundary', () => {
      expect(formatLocal(roundUpToStep(new Date(2026, 6, 28, 10, 1), 5), 'datetime')).toBe(
        '2026-07-28T10:05',
      );
    });

    it('leaves a value already on a boundary untouched', () => {
      expect(formatLocal(roundUpToStep(new Date(2026, 6, 28, 10, 10), 5), 'datetime')).toBe(
        '2026-07-28T10:10',
      );
    });

    it('rolls over into the next hour', () => {
      expect(formatLocal(roundUpToStep(new Date(2026, 6, 28, 10, 58), 5), 'datetime')).toBe(
        '2026-07-28T11:00',
      );
    });

    it('rolls over into the next day at end of day', () => {
      expect(formatLocal(roundUpToStep(new Date(2026, 6, 28, 23, 58), 5), 'datetime')).toBe(
        '2026-07-29T00:00',
      );
    });
  });
});
