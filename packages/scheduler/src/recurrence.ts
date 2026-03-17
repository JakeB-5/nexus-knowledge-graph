import type { RecurrenceRule } from './types.js';

// Builder and engine for recurrence rules
export class Recurrence {
  private rule: RecurrenceRule = {};

  // Factory: every N minutes
  static everyMinutes(n: number): Recurrence {
    return new Recurrence().everyMinutes(n);
  }

  everyMinutes(n: number): this {
    this.rule.minutes = n;
    return this;
  }

  // Every N hours
  static everyHours(n: number): Recurrence {
    return new Recurrence().everyHours(n);
  }

  everyHours(n: number): this {
    this.rule.hours = n;
    return this;
  }

  // Every N days
  static everyDays(n: number): Recurrence {
    return new Recurrence().everyDays(n);
  }

  everyDays(n: number): this {
    this.rule.days = n;
    return this;
  }

  // Every N weeks
  static everyWeeks(n: number): Recurrence {
    return new Recurrence().everyWeeks(n);
  }

  everyWeeks(n: number): this {
    this.rule.weeks = n;
    return this;
  }

  // Every N months
  static everyMonths(n: number): Recurrence {
    return new Recurrence().everyMonths(n);
  }

  everyMonths(n: number): this {
    this.rule.months = n;
    return this;
  }

  // On specific days of week (0=Sun, 1=Mon, ..., 6=Sat)
  onDaysOfWeek(days: number[]): this {
    this.rule.daysOfWeek = days;
    return this;
  }

  // On specific day of month (1-31)
  onDayOfMonth(day: number): this {
    this.rule.dayOfMonth = day;
    return this;
  }

  // First weekday of month
  firstWeekdayOfMonth(weekday: number): this {
    this.rule.firstWeekdayOfMonth = weekday;
    return this;
  }

  // Last weekday of month
  lastWeekdayOfMonth(weekday: number): this {
    this.rule.lastWeekdayOfMonth = weekday;
    return this;
  }

  // Exclude specific dates
  excluding(dates: Date[]): this {
    this.rule.excludeDates = [...(this.rule.excludeDates ?? []), ...dates];
    return this;
  }

  // End after N occurrences
  endAfter(occurrences: number): this {
    this.rule.endAfterOccurrences = occurrences;
    return this;
  }

  // End by a specific date
  endBy(date: Date): this {
    this.rule.endDate = date;
    return this;
  }

  // Start from a specific date
  startFrom(date: Date): this {
    this.rule.startDate = date;
    return this;
  }

  // Build and return the rule
  build(): RecurrenceRule {
    return { ...this.rule };
  }

  // Generate all occurrences between start and end dates
  static occurrencesBetween(
    rule: RecurrenceRule,
    from: Date,
    to: Date,
  ): Date[] {
    const results: Date[] = [];
    const start = rule.startDate && rule.startDate > from ? rule.startDate : from;
    let current = new Date(start);
    let count = 0;
    const maxOccurrences = rule.endAfterOccurrences ?? Infinity;

    // Safety limit to avoid infinite loops
    const maxIterations = 100_000;
    let iterations = 0;

    while (current <= to && count < maxOccurrences && iterations < maxIterations) {
      iterations++;

      // Check end date
      if (rule.endDate && current > rule.endDate) break;

      const candidate = new Date(current);

      // Advance by interval
      current = advanceByRule(rule, current);

      // Check if candidate passes day-of-week filter
      if (rule.daysOfWeek && !rule.daysOfWeek.includes(candidate.getDay())) {
        continue;
      }

      // Check day-of-month filter
      if (rule.dayOfMonth && candidate.getDate() !== rule.dayOfMonth) {
        continue;
      }

      // Check first weekday of month
      if (rule.firstWeekdayOfMonth !== undefined) {
        const fw = firstWeekdayOfMonth(candidate.getFullYear(), candidate.getMonth(), rule.firstWeekdayOfMonth);
        if (candidate.toDateString() !== fw.toDateString()) continue;
      }

      // Check last weekday of month
      if (rule.lastWeekdayOfMonth !== undefined) {
        const lw = lastWeekdayOfMonth(candidate.getFullYear(), candidate.getMonth(), rule.lastWeekdayOfMonth);
        if (candidate.toDateString() !== lw.toDateString()) continue;
      }

      // Check excluded dates
      if (rule.excludeDates) {
        const key = toDateString(candidate);
        if (rule.excludeDates.some((d) => toDateString(d) === key)) continue;
      }

      results.push(candidate);
      count++;
    }

    return results;
  }

  // Generate occurrences using this builder's rule
  between(from: Date, to: Date): Date[] {
    return Recurrence.occurrencesBetween(this.rule, from, to);
  }

  // Next N occurrences from a given date
  static nextN(rule: RecurrenceRule, n: number, from: Date = new Date()): Date[] {
    const results: Date[] = [];
    let current = new Date(from);
    const maxOccurrences = Math.min(n, rule.endAfterOccurrences ?? n);
    let count = 0;
    const maxIter = 100_000;
    let iter = 0;

    while (count < maxOccurrences && iter < maxIter) {
      iter++;

      const candidate = new Date(current);
      current = advanceByRule(rule, current);

      if (rule.endDate && candidate > rule.endDate) break;

      if (rule.daysOfWeek && !rule.daysOfWeek.includes(candidate.getDay())) continue;
      if (rule.dayOfMonth && candidate.getDate() !== rule.dayOfMonth) continue;

      if (rule.excludeDates) {
        const key = toDateString(candidate);
        if (rule.excludeDates.some((d) => toDateString(d) === key)) continue;
      }

      results.push(candidate);
      count++;
    }

    return results;
  }
}

function advanceByRule(rule: RecurrenceRule, date: Date): Date {
  const d = new Date(date);

  if (rule.minutes) {
    d.setMinutes(d.getMinutes() + rule.minutes);
  } else if (rule.hours) {
    d.setHours(d.getHours() + rule.hours);
  } else if (rule.days) {
    d.setDate(d.getDate() + rule.days);
  } else if (rule.weeks) {
    d.setDate(d.getDate() + rule.weeks * 7);
  } else if (rule.months) {
    d.setMonth(d.getMonth() + rule.months);
  } else {
    // Default: advance by 1 day
    d.setDate(d.getDate() + 1);
  }

  return d;
}

function firstWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const d = new Date(year, month, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  // Last day of month
  const d = new Date(year, month + 1, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return d;
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
