/**
 * Timezone-aware date utilities for streak, momentum, and week calculations.
 * All date strings use the "YYYY-MM-DD" format.
 */

export function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
    new Date(),
  );
}

export function formatDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return formatDateStr(d);
}

export function subtractDays(dateStr: string, n: number): string {
  return addDays(dateStr, -n);
}

/** Returns whole days between two "YYYY-MM-DD" date strings. */
export function daysBetween(fromDate: string, toDate: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(
    (new Date(toDate + 'T00:00:00Z').getTime() -
      new Date(fromDate + 'T00:00:00Z').getTime()) /
      msPerDay,
  );
}

/** Returns the Monday (ISO week start) for the week containing `dateStr`. */
export function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return formatDateStr(d);
}
