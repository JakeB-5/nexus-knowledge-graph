// Cron expression parser: supports 5-field standard cron plus extended aliases

export interface CronFields {
  minute: number[];   // 0-59
  hour: number[];     // 0-23
  dayOfMonth: number[]; // 1-31
  month: number[];    // 1-12
  dayOfWeek: number[]; // 0-6 (Sun=0)
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

// Predefined aliases
const ALIASES: Record<string, string> = {
  '@yearly':   '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly':  '0 0 1 * *',
  '@weekly':   '0 0 * * 0',
  '@daily':    '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly':   '0 * * * *',
};

export class CronParser {
  private readonly fields: CronFields;
  private readonly raw: string;

  constructor(expression: string) {
    this.raw = expression.trim();
    this.fields = this.parse(this.raw);
  }

  private parse(expr: string): CronFields {
    const resolved = ALIASES[expr.toLowerCase()] ?? expr;
    const parts = resolved.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression "${expr}": expected 5 fields, got ${parts.length}`);
    }

    return {
      minute:     this.parseField(parts[0]!, 0, 59, {}),
      hour:       this.parseField(parts[1]!, 0, 23, {}),
      dayOfMonth: this.parseField(parts[2]!, 1, 31, {}),
      month:      this.parseField(parts[3]!, 1, 12, MONTH_NAMES),
      dayOfWeek:  this.parseField(parts[4]!, 0, 6, DOW_NAMES),
    };
  }

  private parseField(
    field: string,
    min: number,
    max: number,
    names: Record<string, number>,
  ): number[] {
    // Replace names with numbers
    let f = field.toUpperCase();
    for (const [name, val] of Object.entries(names)) {
      f = f.replace(new RegExp(name, 'g'), String(val));
    }

    // Wildcard
    if (f === '*') return this.range(min, max, 1);

    const values = new Set<number>();

    for (const part of f.split(',')) {
      if (part.includes('/')) {
        // Step: */5 or 1-10/2
        const [rangeStr, stepStr] = part.split('/');
        const step = parseInt(stepStr!, 10);
        if (isNaN(step) || step <= 0) throw new Error(`Invalid step in "${part}"`);

        if (rangeStr === '*') {
          for (const v of this.range(min, max, step)) values.add(v);
        } else if (rangeStr!.includes('-')) {
          const [lo, hi] = rangeStr!.split('-').map(Number);
          for (const v of this.range(lo!, hi!, step)) values.add(v);
        } else {
          const start = parseInt(rangeStr!, 10);
          for (const v of this.range(start, max, step)) values.add(v);
        }
      } else if (part.includes('-')) {
        // Range: 1-5
        const [lo, hi] = part.split('-').map(Number);
        for (const v of this.range(lo!, hi!, 1)) values.add(v);
      } else {
        // Single value
        const v = parseInt(part, 10);
        if (isNaN(v)) throw new Error(`Invalid value "${part}"`);
        values.add(v);
      }
    }

    const result = [...values].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
    if (result.length === 0) throw new Error(`No valid values in field "${field}"`);
    return result;
  }

  private range(start: number, end: number, step: number): number[] {
    const result: number[] = [];
    for (let i = start; i <= end; i += step) result.push(i);
    return result;
  }

  get parsedFields(): CronFields {
    return this.fields;
  }

  // Validate without throwing — returns error message or null
  static validate(expr: string): string | null {
    try {
      new CronParser(expr);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  // Next occurrence after a given date - O(minutes scanned)
  nextDate(after: Date = new Date()): Date {
    const d = new Date(after.getTime() + 60_000); // advance by 1 minute
    d.setSeconds(0, 0);
    return this.findNext(d, 10000);
  }

  private findNext(from: Date, maxIterations: number): Date {
    const d = new Date(from);
    d.setSeconds(0, 0);

    for (let i = 0; i < maxIterations; i++) {
      // Check month (1-based)
      const month = d.getMonth() + 1;
      if (!this.fields.month.includes(month)) {
        // Advance to next valid month
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() + 1);
        continue;
      }

      // Check day of month and day of week
      const dom = d.getDate();
      const dow = d.getDay();
      const domWild = this.raw.includes('*') &&
        (ALIASES[this.raw.toLowerCase()]?.split(' ')[2] === '*' ||
         this.raw.split(/\s+/)[2] === '*');
      const dowWild = this.raw.includes('*') &&
        (ALIASES[this.raw.toLowerCase()]?.split(' ')[4] === '*' ||
         this.raw.split(/\s+/)[4] === '*');

      const domMatch = this.fields.dayOfMonth.includes(dom);
      const dowMatch = this.fields.dayOfWeek.includes(dow);

      // Standard cron: if both are non-wildcard, either matching is OK (OR logic)
      // If one is wildcard, the other must match
      const dayMatch = domWild ? dowMatch : (dowWild ? domMatch : (domMatch || dowMatch));

      if (!dayMatch) {
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }

      // Check hour
      const hour = d.getHours();
      const nextHour = this.fields.hour.find((h) => h >= hour);
      if (nextHour === undefined) {
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }
      if (nextHour !== hour) {
        d.setHours(nextHour, 0, 0, 0);
        continue;
      }

      // Check minute
      const minute = d.getMinutes();
      const nextMinute = this.fields.minute.find((m) => m >= minute);
      if (nextMinute === undefined) {
        // Advance to next valid hour
        const nextH = this.fields.hour.find((h) => h > hour);
        if (nextH === undefined) {
          d.setDate(d.getDate() + 1);
          d.setHours(this.fields.hour[0]!, 0, 0, 0);
        } else {
          d.setHours(nextH, 0, 0, 0);
        }
        continue;
      }

      d.setMinutes(nextMinute, 0, 0);
      return d;
    }

    throw new Error('Could not find next occurrence within iteration limit');
  }

  // N next occurrences
  nextN(n: number, after: Date = new Date()): Date[] {
    const results: Date[] = [];
    let current = after;
    for (let i = 0; i < n; i++) {
      current = this.nextDate(current);
      results.push(new Date(current));
    }
    return results;
  }

  // Previous occurrence before a given date
  prevDate(before: Date = new Date()): Date {
    const d = new Date(before.getTime() - 60_000);
    d.setSeconds(0, 0);
    return this.findPrev(d, 10000);
  }

  private findPrev(from: Date, maxIterations: number): Date {
    const d = new Date(from);
    d.setSeconds(0, 0);

    for (let i = 0; i < maxIterations; i++) {
      const month = d.getMonth() + 1;
      if (!this.fields.month.includes(month)) {
        d.setDate(0); // last day of prev month
        d.setHours(23, 59, 0, 0);
        continue;
      }

      const dom = d.getDate();
      const dow = d.getDay();
      const domMatch = this.fields.dayOfMonth.includes(dom);
      const dowMatch = this.fields.dayOfWeek.includes(dow);
      const dayMatch = domMatch || dowMatch;

      if (!dayMatch) {
        d.setDate(d.getDate() - 1);
        d.setHours(23, 59, 0, 0);
        continue;
      }

      const hour = d.getHours();
      const validHour = [...this.fields.hour].reverse().find((h) => h <= hour);
      if (validHour === undefined) {
        d.setDate(d.getDate() - 1);
        d.setHours(23, 59, 0, 0);
        continue;
      }
      if (validHour !== hour) {
        d.setHours(validHour, this.fields.minute[this.fields.minute.length - 1]!, 0, 0);
        continue;
      }

      const minute = d.getMinutes();
      const validMinute = [...this.fields.minute].reverse().find((m) => m <= minute);
      if (validMinute === undefined) {
        const prevH = [...this.fields.hour].reverse().find((h) => h < hour);
        if (prevH === undefined) {
          d.setDate(d.getDate() - 1);
          d.setHours(this.fields.hour[this.fields.hour.length - 1]!, this.fields.minute[this.fields.minute.length - 1]!, 0, 0);
        } else {
          d.setHours(prevH, this.fields.minute[this.fields.minute.length - 1]!, 0, 0);
        }
        continue;
      }

      d.setMinutes(validMinute, 0, 0);
      return d;
    }

    throw new Error('Could not find previous occurrence within iteration limit');
  }

  // Human-readable description
  describe(): string {
    const { minute, hour, dayOfMonth, month, dayOfWeek } = this.fields;

    // Check for aliases
    const resolved = ALIASES[this.raw.toLowerCase()];
    if (resolved) {
      const aliasDesc: Record<string, string> = {
        '@yearly': 'At midnight on January 1st',
        '@annually': 'At midnight on January 1st',
        '@monthly': 'At midnight on the 1st of every month',
        '@weekly': 'At midnight on Sunday',
        '@daily': 'At midnight every day',
        '@midnight': 'At midnight every day',
        '@hourly': 'At the start of every hour',
      };
      return aliasDesc[this.raw.toLowerCase()] ?? `Every: ${resolved}`;
    }

    const parts: string[] = [];

    // Minutes
    if (minute.length === 60) parts.push('every minute');
    else if (minute.length === 1) parts.push(`at minute ${minute[0]}`);
    else parts.push(`at minutes ${minute.join(', ')}`);

    // Hours
    if (hour.length === 24) { /* every hour, already covered */ }
    else if (hour.length === 1) parts.push(`of hour ${hour[0]}`);
    else parts.push(`of hours ${hour.join(', ')}`);

    // Day
    const fields = this.raw.split(/\s+/);
    if (fields[2] !== '*') {
      parts.push(`on day ${dayOfMonth.join(', ')} of month`);
    }
    if (fields[4] !== '*') {
      const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      parts.push(`on ${dayOfWeek.map((d) => dowNames[d]).join(', ')}`);
    }

    // Month
    if (fields[3] !== '*') {
      const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      parts.push(`in ${month.map((m) => monthNames[m]).join(', ')}`);
    }

    return parts.join(', ');
  }
}
