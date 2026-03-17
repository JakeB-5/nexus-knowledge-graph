import { describe, it, expect } from 'vitest';
import { Recurrence } from '../recurrence.js';

describe('Recurrence', () => {
  describe('builder pattern', () => {
    it('builds everyDays rule', () => {
      const rule = Recurrence.everyDays(3).build();
      expect(rule.days).toBe(3);
    });

    it('builds everyHours rule', () => {
      const rule = Recurrence.everyHours(6).build();
      expect(rule.hours).toBe(6);
    });

    it('builds everyWeeks rule', () => {
      const rule = Recurrence.everyWeeks(2).build();
      expect(rule.weeks).toBe(2);
    });

    it('builds everyMonths rule', () => {
      const rule = Recurrence.everyMonths(1).build();
      expect(rule.months).toBe(1);
    });

    it('builds everyMinutes rule', () => {
      const rule = Recurrence.everyMinutes(30).build();
      expect(rule.minutes).toBe(30);
    });

    it('chains multiple conditions', () => {
      const rule = Recurrence.everyWeeks(1)
        .onDaysOfWeek([1, 3, 5]) // Mon, Wed, Fri
        .endAfter(10)
        .build();
      expect(rule.weeks).toBe(1);
      expect(rule.daysOfWeek).toEqual([1, 3, 5]);
      expect(rule.endAfterOccurrences).toBe(10);
    });
  });

  describe('occurrencesBetween', () => {
    it('generates daily occurrences', () => {
      const rule = Recurrence.everyDays(1).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-07T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      expect(dates.length).toBeGreaterThan(5);
    });

    it('generates weekly occurrences', () => {
      const rule = Recurrence.everyWeeks(1).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-02-01T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      // Jan 1, 8, 15, 22, 29 = 5 occurrences within [Jan 1, Feb 1]
      expect(dates.length).toBeGreaterThanOrEqual(4);
      expect(dates.length).toBeLessThanOrEqual(6);
    });

    it('respects endAfterOccurrences', () => {
      const rule = Recurrence.everyDays(1).endAfter(5).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-12-31T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      expect(dates.length).toBe(5);
    });

    it('respects endDate', () => {
      const rule = Recurrence.everyDays(1)
        .endBy(new Date('2024-01-10T00:00:00Z'))
        .build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-12-31T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      expect(dates.every((d) => d <= new Date('2024-01-10T00:00:00Z'))).toBe(true);
    });

    it('filters by daysOfWeek', () => {
      const rule = Recurrence.everyDays(1).onDaysOfWeek([1]).build(); // Mondays only
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-02-01T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      expect(dates.every((d) => d.getDay() === 1)).toBe(true);
    });

    it('excludes specified dates', () => {
      const exclude = new Date('2024-01-03T00:00:00Z');
      const rule = Recurrence.everyDays(1).excluding([exclude]).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-07T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      const keys = dates.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      expect(keys).not.toContain('2024-0-3'); // Jan 3
    });

    it('filters by dayOfMonth', () => {
      const rule = Recurrence.everyMonths(1).onDayOfMonth(15).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-06-30T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      expect(dates.every((d) => d.getDate() === 15)).toBe(true);
    });
  });

  describe('nextN', () => {
    it('returns N daily occurrences', () => {
      const rule = Recurrence.everyDays(1).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const dates = Recurrence.nextN(rule, 7, from);
      expect(dates).toHaveLength(7);
    });

    it('occurrences are in ascending order', () => {
      const rule = Recurrence.everyHours(2).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const dates = Recurrence.nextN(rule, 5, from);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]!.getTime()).toBeGreaterThan(dates[i - 1]!.getTime());
      }
    });

    it('respects endAfterOccurrences in nextN', () => {
      const rule = Recurrence.everyDays(1).endAfter(3).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const dates = Recurrence.nextN(rule, 10, from);
      expect(dates.length).toBe(3);
    });
  });

  describe('first/last weekday of month', () => {
    it('firstWeekdayOfMonth filters correctly', () => {
      // First Monday (dow=1) of each month
      const rule = Recurrence.everyMonths(1).firstWeekdayOfMonth(1).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-04-30T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      // All should be Mondays
      dates.forEach((d) => expect(d.getDay()).toBe(1));
    });

    it('lastWeekdayOfMonth filters correctly', () => {
      // Last Friday (dow=5) of each month
      const rule = Recurrence.everyMonths(1).lastWeekdayOfMonth(5).build();
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-04-30T00:00:00Z');
      const dates = Recurrence.occurrencesBetween(rule, from, to);
      dates.forEach((d) => expect(d.getDay()).toBe(5));
    });
  });

  describe('between method on instance', () => {
    it('generates occurrences via instance method', () => {
      const r = Recurrence.everyDays(2);
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-15T00:00:00Z');
      const dates = r.between(from, to);
      expect(dates.length).toBeGreaterThan(0);
      // Each date should be 2 days apart
      for (let i = 1; i < dates.length; i++) {
        const diff = dates[i]!.getTime() - dates[i - 1]!.getTime();
        expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
      }
    });
  });
});
