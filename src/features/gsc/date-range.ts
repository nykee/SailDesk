/** Date strings accepted by GSC use the stable ISO calendar-day representation. */
export type DateRange = { startDate: string; endDate: string };

/**
 * Returns an inclusive UTC day range ending yesterday. Search Console data is
 * delayed, so excluding today avoids presenting a partial day as a regression.
 */
export function defaultDateRange(now = new Date(), days = 28): DateRange {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days + 1);
  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

/** A prior period has exactly the same inclusive length as the selected range. */
export function previousDateRange(range: DateRange): DateRange {
  const start = parseDateKey(range.startDate);
  const end = parseDateKey(range.endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousEnd.getUTCDate() - days + 1);
  return {
    startDate: toDateKey(previousStart),
    endDate: toDateKey(previousEnd),
  };
}

/** Rejects malformed and inverted query parameters before they reach Google. */
export function isValidDateRange(range: DateRange): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(range.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate)
  )
    return false;
  const start = parseDateKey(range.startDate);
  const end = parseDateKey(range.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return false;
  return (
    toDateKey(start) === range.startDate &&
    toDateKey(end) === range.endDate &&
    start <= end
  );
}

/** Calendar-day arithmetic is always UTC, independent of browser timezone/DST. */
export function shiftDate(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

/** Enumerates the full comparison axis, including dates with no search activity. */
export function dateKeys(range: DateRange): string[] {
  const dates: string[] = [];
  for (
    let date = range.startDate;
    date <= range.endDate;
    date = shiftDate(date, 1)
  )
    dates.push(date);
  return dates;
}

/**
 * GSC retains 16 calendar months in Pacific time. Clamp month-end dates instead
 * of allowing JavaScript month arithmetic to overflow into a different month.
 * Both comparison periods must fit inside this boundary; unavailable historical
 * data must not be presented as a zero-traffic baseline.
 */
export function oldestSearchConsoleDate(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  const date = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 17, 1)
  );
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(Number(parts.day), lastDay));
  return toDateKey(date);
}

/**
 * Both the selected and the comparison window must fit inside Search Console's
 * 16-month retention. Rejecting this at the API boundary also caps how many
 * dates a single request can expand into, so one request cannot exhaust quota.
 */
export function isWithinRetention(range: DateRange, now = new Date()): boolean {
  return previousDateRange(range).startDate >= oldestSearchConsoleDate(now);
}

/**
 * Google reports its first incomplete date. Move the whole window back by the
 * exact reported delay; never guess a fixed two/three-day ingestion delay.
 */
export function completedDateRange(
  range: DateRange,
  firstIncompleteDates: string[]
): DateRange {
  const firstIncomplete = firstIncompleteDates
    .filter((date) => date <= range.endDate)
    .sort()[0];
  if (!firstIncomplete) return range;
  const endDate = shiftDate(firstIncomplete, -1);
  const offset = Math.round(
    (parseDateKey(endDate).getTime() - parseDateKey(range.endDate).getTime()) /
      86_400_000
  );
  return { startDate: shiftDate(range.startDate, offset), endDate };
}

function parseDateKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
