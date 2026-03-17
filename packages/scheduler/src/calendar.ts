// Calendar utilities for business day calculations
export interface CalendarConfig {
  // Custom holiday dates (UTC dates, only year/month/day matter)
  holidays?: Date[];
  // Working hours
  workStart?: number; // hour 0-23, default 9
  workEnd?: number;   // hour 0-23, default 17
  // UTC offset in hours, default 0
  utcOffset?: number;
}

export class Calendar {
  private readonly holidays: Set<string>; // 'YYYY-MM-DD' strings
  private readonly workStart: number;
  private readonly workEnd: number;
  private readonly utcOffset: number;

  constructor(config: CalendarConfig = {}) {
    this.workStart = config.workStart ?? 9;
    this.workEnd = config.workEnd ?? 17;
    this.utcOffset = config.utcOffset ?? 0;
    this.holidays = new Set(
      (config.holidays ?? []).map((d) => this.toDateKey(d)),
    );
  }

  // Adjust date to the configured timezone
  private toLocal(date: Date): Date {
    return new Date(date.getTime() + this.utcOffset * 3_600_000);
  }

  private toDateKey(date: Date): string {
    const d = this.toLocal(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Check if a date is a weekend (Sat or Sun)
  isWeekend(date: Date): boolean {
    const local = this.toLocal(date);
    const dow = local.getUTCDay();
    return dow === 0 || dow === 6;
  }

  // Check if a date is a holiday
  isHoliday(date: Date): boolean {
    return this.holidays.has(this.toDateKey(date));
  }

  // Check if a date is a business day (not weekend and not holiday)
  isBusinessDay(date: Date): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  // Next business day on or after the given date
  nextBusinessDay(from: Date, includeToday = false): Date {
    let d = new Date(from);
    if (!includeToday) {
      d = this.addDays(d, 1);
    }
    while (!this.isBusinessDay(d)) {
      d = this.addDays(d, 1);
    }
    return d;
  }

  // Previous business day on or before the given date
  prevBusinessDay(from: Date, includeToday = false): Date {
    let d = new Date(from);
    if (!includeToday) {
      d = this.addDays(d, -1);
    }
    while (!this.isBusinessDay(d)) {
      d = this.addDays(d, -1);
    }
    return d;
  }

  // Number of business days between two dates (exclusive of start, inclusive of end)
  businessDaysBetween(start: Date, end: Date): number {
    if (start > end) return -this.businessDaysBetween(end, start);
    let count = 0;
    let d = this.addDays(start, 1);
    while (d <= end) {
      if (this.isBusinessDay(d)) count++;
      d = this.addDays(d, 1);
    }
    return count;
  }

  // Add N calendar days to a date
  addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  // Add N business days to a date
  addBusinessDays(date: Date, days: number): Date {
    let d = new Date(date);
    let remaining = Math.abs(days);
    const direction = days >= 0 ? 1 : -1;

    while (remaining > 0) {
      d = this.addDays(d, direction);
      if (this.isBusinessDay(d)) remaining--;
    }
    return d;
  }

  // Check if a datetime is within working hours
  isWithinWorkingHours(date: Date): boolean {
    if (!this.isBusinessDay(date)) return false;
    const local = this.toLocal(date);
    const hour = local.getUTCHours();
    return hour >= this.workStart && hour < this.workEnd;
  }

  // Next working hour slot at or after the given date
  nextWorkingTime(from: Date): Date {
    let d = new Date(from);

    // If not a business day, move to next business day start
    if (!this.isBusinessDay(d)) {
      d = this.nextBusinessDay(d, false);
      return this.startOfWorkDay(d);
    }

    const local = this.toLocal(d);
    const hour = local.getUTCHours();

    if (hour < this.workStart) {
      return this.startOfWorkDay(d);
    }
    if (hour >= this.workEnd) {
      // Move to next business day
      const next = this.nextBusinessDay(d, false);
      return this.startOfWorkDay(next);
    }

    return d; // already within working hours
  }

  private startOfWorkDay(date: Date): Date {
    const local = this.toLocal(date);
    // Set to workStart hour in local timezone, convert back
    const result = new Date(date);
    result.setUTCHours(
      local.getUTCHours() - local.getUTCHours() + this.workStart - this.utcOffset,
      0, 0, 0,
    );
    // Simpler: set UTC hours accounting for offset
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const day = local.getUTCDate();
    return new Date(Date.UTC(y, m, day, this.workStart - this.utcOffset, 0, 0, 0));
  }

  // Add a holiday
  addHoliday(date: Date): void {
    this.holidays.add(this.toDateKey(date));
  }

  // Remove a holiday
  removeHoliday(date: Date): void {
    this.holidays.delete(this.toDateKey(date));
  }

  // List all holidays as date keys
  listHolidays(): string[] {
    return [...this.holidays].sort();
  }

  // Business days in a given month
  businessDaysInMonth(year: number, month: number): number {
    // month is 1-based
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0)); // last day of month
    let count = 0;
    let d = new Date(start);
    while (d <= end) {
      if (this.isBusinessDay(d)) count++;
      d = this.addDays(d, 1);
    }
    return count;
  }

  // Working hours remaining in the day
  workingHoursRemaining(date: Date): number {
    if (!this.isBusinessDay(date)) return 0;
    const local = this.toLocal(date);
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    if (hour >= this.workEnd) return 0;
    if (hour < this.workStart) return this.workEnd - this.workStart;
    return this.workEnd - hour;
  }
}
