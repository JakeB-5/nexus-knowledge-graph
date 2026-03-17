/**
 * Date utility functions for the Nexus platform.
 * All functions work with Date objects or ISO strings.
 */

/**
 * Parse an ISO 8601 date string into a Date object.
 */
export function parseISO(dateString: string): Date {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date string: ${dateString}`);
  }
  return d;
}

/**
 * Check whether a value is a valid Date.
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Format a date as a relative time string.
 * e.g. "2 hours ago", "yesterday", "in 3 days"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSeconds) < 60) return "just now";
  if (Math.abs(diffMinutes) < 60) {
    const abs = Math.abs(diffMinutes);
    return diffMinutes > 0 ? `${abs} minute${abs === 1 ? "" : "s"} ago` : `in ${abs} minute${abs === 1 ? "" : "s"}`;
  }
  if (Math.abs(diffHours) < 24) {
    const abs = Math.abs(diffHours);
    return diffHours > 0 ? `${abs} hour${abs === 1 ? "" : "s"} ago` : `in ${abs} hour${abs === 1 ? "" : "s"}`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays === -1) return "tomorrow";
  if (Math.abs(diffDays) < 7) {
    const abs = Math.abs(diffDays);
    return diffDays > 0 ? `${abs} days ago` : `in ${abs} days`;
  }
  if (Math.abs(diffDays) < 30) {
    const weeks = Math.round(Math.abs(diffDays) / 7);
    return diffDays > 0 ? `${weeks} week${weeks === 1 ? "" : "s"} ago` : `in ${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (Math.abs(diffDays) < 365) {
    const months = Math.round(Math.abs(diffDays) / 30);
    return diffDays > 0 ? `${months} month${months === 1 ? "" : "s"} ago` : `in ${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.round(Math.abs(diffDays) / 365);
  return diffDays > 0 ? `${years} year${years === 1 ? "" : "s"} ago` : `in ${years} year${years === 1 ? "" : "s"}`;
}

type DateFormatToken = "YYYY" | "MM" | "DD" | "HH" | "mm" | "ss";

/**
 * Format a date according to a format string.
 * Supported tokens: YYYY, MM, DD, HH, mm, ss
 */
export function formatDate(date: Date | string, format: string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const replacements: Record<DateFormatToken, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => replacements[token as DateFormatToken] ?? token);
}

/**
 * Check whether a date falls within [start, end] (inclusive).
 */
export function isWithinRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export type DatePeriod = "day" | "week" | "month" | "year";

/**
 * Get the start and end Date for a named period ending now.
 */
export function getDateRange(period: DatePeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  switch (period) {
    case "day":
      start.setDate(start.getDate() - 1);
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start, end };
}

/** Return a copy of the date set to 00:00:00.000 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Return a copy of the date set to 23:59:59.999 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Return the Monday of the week containing the given date. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Return the Sunday of the week containing the given date. */
export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Return the first moment of the month for the given date. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** Return the last moment of the month for the given date. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Return the difference in whole days between two dates. */
export function diffInDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

/** Return the difference in whole hours between two dates. */
export function diffInHours(a: Date, b: Date): number {
  const msPerHour = 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerHour);
}

/** Return a new date with the given number of days added. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Return a new date with the given number of hours added. */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Return a new date with the given number of days subtracted. */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days);
}
