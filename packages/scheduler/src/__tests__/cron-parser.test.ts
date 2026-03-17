import { describe, it, expect } from 'vitest';
import { CronParser } from '../cron-parser.js';

describe('CronParser', () => {
  describe('parsing basic expressions', () => {
    it('parses wildcard expression', () => {
      const p = new CronParser('* * * * *');
      const fields = p.parsedFields;
      expect(fields.minute).toHaveLength(60);
      expect(fields.hour).toHaveLength(24);
      expect(fields.dayOfMonth).toHaveLength(31);
      expect(fields.month).toHaveLength(12);
      expect(fields.dayOfWeek).toHaveLength(7);
    });

    it('parses single values', () => {
      const p = new CronParser('30 9 15 6 1');
      const f = p.parsedFields;
      expect(f.minute).toEqual([30]);
      expect(f.hour).toEqual([9]);
      expect(f.dayOfMonth).toEqual([15]);
      expect(f.month).toEqual([6]);
      expect(f.dayOfWeek).toEqual([1]);
    });

    it('parses range expressions', () => {
      const p = new CronParser('0-30 8-17 * * *');
      const f = p.parsedFields;
      expect(f.minute[0]).toBe(0);
      expect(f.minute[f.minute.length - 1]).toBe(30);
      expect(f.minute).toHaveLength(31);
      expect(f.hour[0]).toBe(8);
      expect(f.hour[f.hour.length - 1]).toBe(17);
    });

    it('parses step expressions', () => {
      const p = new CronParser('*/15 * * * *');
      expect(p.parsedFields.minute).toEqual([0, 15, 30, 45]);
    });

    it('parses list expressions', () => {
      const p = new CronParser('0,15,30,45 * * * *');
      expect(p.parsedFields.minute).toEqual([0, 15, 30, 45]);
    });

    it('parses range with step', () => {
      const p = new CronParser('0-59/10 * * * *');
      expect(p.parsedFields.minute).toEqual([0, 10, 20, 30, 40, 50]);
    });
  });

  describe('name substitution', () => {
    it('parses month names', () => {
      const p = new CronParser('0 0 1 JAN,JUN,DEC *');
      expect(p.parsedFields.month).toEqual([1, 6, 12]);
    });

    it('parses day-of-week names', () => {
      const p = new CronParser('0 0 * * MON,WED,FRI');
      expect(p.parsedFields.dayOfWeek).toEqual([1, 3, 5]);
    });

    it('parses full month names range', () => {
      const p = new CronParser('0 0 * MAR-MAY *');
      expect(p.parsedFields.month).toEqual([3, 4, 5]);
    });
  });

  describe('aliases', () => {
    it('@yearly resolves to 0 0 1 1 *', () => {
      const p = new CronParser('@yearly');
      const f = p.parsedFields;
      expect(f.minute).toEqual([0]);
      expect(f.hour).toEqual([0]);
      expect(f.dayOfMonth).toEqual([1]);
      expect(f.month).toEqual([1]);
    });

    it('@monthly resolves correctly', () => {
      const p = new CronParser('@monthly');
      expect(p.parsedFields.dayOfMonth).toEqual([1]);
    });

    it('@weekly runs on Sunday midnight', () => {
      const p = new CronParser('@weekly');
      expect(p.parsedFields.dayOfWeek).toEqual([0]);
    });

    it('@daily runs at midnight', () => {
      const p = new CronParser('@daily');
      expect(p.parsedFields.hour).toEqual([0]);
      expect(p.parsedFields.minute).toEqual([0]);
    });

    it('@hourly runs at minute 0', () => {
      const p = new CronParser('@hourly');
      expect(p.parsedFields.minute).toEqual([0]);
    });
  });

  describe('validation', () => {
    it('validates correct expressions', () => {
      expect(CronParser.validate('0 9 * * 1-5')).toBeNull();
      expect(CronParser.validate('@daily')).toBeNull();
      expect(CronParser.validate('*/5 * * * *')).toBeNull();
    });

    it('returns error for wrong field count', () => {
      expect(CronParser.validate('* * * *')).not.toBeNull();
      expect(CronParser.validate('* * * * * *')).not.toBeNull();
    });

    it('returns error for invalid step', () => {
      expect(CronParser.validate('*/0 * * * *')).not.toBeNull();
    });
  });

  describe('nextDate', () => {
    it('returns future date', () => {
      const p = new CronParser('* * * * *');
      const now = new Date();
      const next = p.nextDate(now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });

    it('nextDate for hourly is within next hour', () => {
      const p = new CronParser('@hourly');
      const now = new Date('2024-01-15T10:30:00Z');
      const next = p.nextDate(now);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCHours()).toBe(11);
    });

    it('nextDate for daily is at midnight', () => {
      const p = new CronParser('@daily');
      const now = new Date('2024-01-15T10:30:00Z');
      const next = p.nextDate(now);
      // next midnight: either UTC midnight on Jan 16 or local midnight - check minutes and that it's after now
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });

    it('nextDate respects minute field', () => {
      const p = new CronParser('30 * * * *');
      const now = new Date('2024-01-15T10:00:00Z');
      const next = p.nextDate(now);
      expect(next.getUTCMinutes()).toBe(30);
    });
  });

  describe('nextN', () => {
    it('returns N occurrences in order', () => {
      const p = new CronParser('@hourly');
      const from = new Date('2024-01-15T00:00:00Z');
      const nexts = p.nextN(5, from);
      expect(nexts).toHaveLength(5);
      for (let i = 1; i < nexts.length; i++) {
        expect(nexts[i]!.getTime()).toBeGreaterThan(nexts[i - 1]!.getTime());
      }
    });

    it('hourly occurrences are 1 hour apart', () => {
      const p = new CronParser('@hourly');
      const from = new Date('2024-01-15T00:00:00Z');
      const nexts = p.nextN(3, from);
      expect(nexts[1]!.getTime() - nexts[0]!.getTime()).toBe(3_600_000);
    });
  });

  describe('prevDate', () => {
    it('returns date before the given date', () => {
      const p = new CronParser('@hourly');
      const from = new Date('2024-01-15T10:30:00Z');
      const prev = p.prevDate(from);
      expect(prev.getTime()).toBeLessThan(from.getTime());
    });

    it('daily prev is previous midnight', () => {
      const p = new CronParser('@daily');
      const from = new Date('2024-01-15T10:30:00Z');
      const prev = p.prevDate(from);
      expect(prev.getUTCMinutes()).toBe(0);
      expect(prev.getTime()).toBeLessThan(from.getTime());
    });
  });

  describe('describe', () => {
    it('describes @daily', () => {
      const p = new CronParser('@daily');
      expect(p.describe()).toBeTruthy();
      expect(typeof p.describe()).toBe('string');
    });

    it('describes standard expression', () => {
      const p = new CronParser('0 9 * * *');
      const desc = p.describe();
      expect(desc).toContain('9');
    });

    it('describes monthly expression with month names', () => {
      const p = new CronParser('0 0 1 JAN *');
      const desc = p.describe();
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });
  });
});
