import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseISO,
  isValidDate,
  formatRelativeTime,
  formatDate,
  isWithinRange,
  getDateRange,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  diffInDays,
  diffInHours,
  addDays,
  addHours,
  subtractDays,
} from "../utils/date.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseISO", () => {
  it("parses a valid ISO date string", () => {
    const d = parseISO("2024-01-15T10:00:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2024);
  });

  it("throws for invalid date string", () => {
    expect(() => parseISO("not-a-date")).toThrow();
  });
});

describe("isValidDate", () => {
  it("returns true for a valid Date", () => {
    expect(isValidDate(new Date())).toBe(true);
  });

  it("returns false for an invalid Date", () => {
    expect(isValidDate(new Date("invalid"))).toBe(false);
  });

  it("returns false for non-Date values", () => {
    expect(isValidDate("2024-01-01")).toBe(false);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for recent time", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-01T12:00:00Z");
    vi.setSystemTime(now);
    const d = new Date("2024-06-01T11:59:50Z");
    expect(formatRelativeTime(d)).toBe("just now");
  });

  it("returns minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-01T12:00:00Z");
    vi.setSystemTime(now);
    const d = new Date("2024-06-01T11:55:00Z");
    expect(formatRelativeTime(d)).toBe("5 minutes ago");
  });

  it("returns hours ago", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-01T12:00:00Z");
    vi.setSystemTime(now);
    const d = new Date("2024-06-01T10:00:00Z");
    expect(formatRelativeTime(d)).toBe("2 hours ago");
  });

  it("returns yesterday for ~24h ago", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-02T12:00:00Z");
    vi.setSystemTime(now);
    const d = new Date("2024-06-01T12:00:00Z");
    expect(formatRelativeTime(d)).toBe("yesterday");
  });

  it("returns days ago", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-10T12:00:00Z");
    vi.setSystemTime(now);
    const d = new Date("2024-06-07T12:00:00Z");
    expect(formatRelativeTime(d)).toBe("3 days ago");
  });

  it("accepts ISO string", () => {
    vi.useFakeTimers();
    const now = new Date("2024-06-01T12:00:00Z");
    vi.setSystemTime(now);
    expect(typeof formatRelativeTime("2024-06-01T11:55:00Z")).toBe("string");
  });
});

describe("formatDate", () => {
  it("formats YYYY-MM-DD", () => {
    const d = new Date(2024, 0, 15); // Jan 15 local
    expect(formatDate(d, "YYYY-MM-DD")).toBe("2024-01-15");
  });

  it("formats with time tokens", () => {
    const d = new Date(2024, 5, 1, 9, 5, 3); // Jun 1, 09:05:03 local
    expect(formatDate(d, "YYYY/MM/DD HH:mm:ss")).toBe("2024/06/01 09:05:03");
  });

  it("accepts ISO string", () => {
    const result = formatDate("2024-03-20T00:00:00.000Z", "YYYY");
    expect(typeof result).toBe("string");
  });
});

describe("isWithinRange", () => {
  it("returns true for date within range", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-12-31");
    const mid = new Date("2024-06-15");
    expect(isWithinRange(mid, start, end)).toBe(true);
  });

  it("returns true for date at boundary", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-12-31");
    expect(isWithinRange(start, start, end)).toBe(true);
    expect(isWithinRange(end, start, end)).toBe(true);
  });

  it("returns false for date outside range", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-12-31");
    expect(isWithinRange(new Date("2023-12-31"), start, end)).toBe(false);
    expect(isWithinRange(new Date("2025-01-01"), start, end)).toBe(false);
  });
});

describe("getDateRange", () => {
  it("returns start before end", () => {
    const { start, end } = getDateRange("week");
    expect(start.getTime()).toBeLessThan(end.getTime());
  });

  it("day range is ~24h", () => {
    const { start, end } = getDateRange("day");
    const diff = end.getTime() - start.getTime();
    expect(diff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});

describe("startOfDay / endOfDay", () => {
  const d = new Date(2024, 5, 15, 10, 30, 45);

  it("sets hours to 0", () => {
    const s = startOfDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
  });

  it("sets hours to 23:59:59.999", () => {
    const e = endOfDay(d);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
  });
});

describe("startOfWeek / endOfWeek", () => {
  it("start of week is Monday", () => {
    const wednesday = new Date(2024, 5, 5); // Wed Jun 5 2024
    const start = startOfWeek(wednesday);
    expect(start.getDay()).toBe(1); // Monday
  });

  it("end of week is Sunday", () => {
    const wednesday = new Date(2024, 5, 5);
    const end = endOfWeek(wednesday);
    expect(end.getDay()).toBe(0); // Sunday
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("start of month is day 1", () => {
    const d = new Date(2024, 1, 20); // Feb 20
    expect(startOfMonth(d).getDate()).toBe(1);
  });

  it("end of month is last day", () => {
    const d = new Date(2024, 1, 20); // Feb 20, 2024 (leap year)
    expect(endOfMonth(d).getDate()).toBe(29);
  });
});

describe("diffInDays / diffInHours", () => {
  it("calculates difference in days", () => {
    const a = new Date("2024-06-10");
    const b = new Date("2024-06-07");
    expect(diffInDays(a, b)).toBe(3);
  });

  it("calculates difference in hours", () => {
    const a = new Date("2024-06-01T12:00:00Z");
    const b = new Date("2024-06-01T09:00:00Z");
    expect(diffInHours(a, b)).toBe(3);
  });
});

describe("addDays / addHours / subtractDays", () => {
  const base = new Date(2024, 5, 1); // Jun 1

  it("adds days", () => {
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(6);
  });

  it("adds hours", () => {
    const d = new Date("2024-06-01T10:00:00Z");
    const result = addHours(d, 3);
    expect(result.getUTCHours()).toBe(13);
  });

  it("subtracts days", () => {
    const result = subtractDays(base, 5);
    expect(result.getDate()).toBe(27); // May 27
    expect(result.getMonth()).toBe(4); // May
  });

  it("does not mutate original", () => {
    const original = new Date(base);
    addDays(base, 10);
    expect(base.getTime()).toBe(original.getTime());
  });
});
