import { describe, it, expect, beforeEach } from 'vitest';
import { Calendar } from '../calendar.js';

describe('Calendar', () => {
  let cal: Calendar;

  beforeEach(() => {
    cal = new Calendar();
  });

  describe('isWeekend', () => {
    it('Saturday is weekend', () => {
      const sat = new Date('2024-01-06T12:00:00Z'); // Saturday
      expect(cal.isWeekend(sat)).toBe(true);
    });

    it('Sunday is weekend', () => {
      const sun = new Date('2024-01-07T12:00:00Z'); // Sunday
      expect(cal.isWeekend(sun)).toBe(true);
    });

    it('Monday is not weekend', () => {
      const mon = new Date('2024-01-08T12:00:00Z'); // Monday
      expect(cal.isWeekend(mon)).toBe(false);
    });

    it('Friday is not weekend', () => {
      const fri = new Date('2024-01-05T12:00:00Z'); // Friday
      expect(cal.isWeekend(fri)).toBe(false);
    });
  });

  describe('isHoliday', () => {
    it('returns false with no holidays configured', () => {
      expect(cal.isHoliday(new Date('2024-12-25'))).toBe(false);
    });

    it('returns true for configured holiday', () => {
      const xmas = new Date('2024-12-25T00:00:00Z');
      const calWithHoliday = new Calendar({ holidays: [xmas] });
      expect(calWithHoliday.isHoliday(new Date('2024-12-25T15:00:00Z'))).toBe(true);
    });

    it('add and remove holiday', () => {
      const date = new Date('2024-07-04T00:00:00Z');
      cal.addHoliday(date);
      expect(cal.isHoliday(date)).toBe(true);
      cal.removeHoliday(date);
      expect(cal.isHoliday(date)).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('Monday is a business day', () => {
      expect(cal.isBusinessDay(new Date('2024-01-08T12:00:00Z'))).toBe(true);
    });

    it('Saturday is not a business day', () => {
      expect(cal.isBusinessDay(new Date('2024-01-06T12:00:00Z'))).toBe(false);
    });

    it('Holiday is not a business day', () => {
      const holiday = new Date('2024-01-08T00:00:00Z'); // Monday but a holiday
      const c = new Calendar({ holidays: [holiday] });
      expect(c.isBusinessDay(new Date('2024-01-08T12:00:00Z'))).toBe(false);
    });
  });

  describe('nextBusinessDay', () => {
    it('next business day from Friday is Monday', () => {
      const fri = new Date('2024-01-05T12:00:00Z'); // Friday
      const next = cal.nextBusinessDay(fri);
      const mon = new Date('2024-01-08T12:00:00Z');
      expect(next.getUTCDay()).toBe(1); // Monday
    });

    it('next business day from Monday is Tuesday', () => {
      const mon = new Date('2024-01-08T12:00:00Z');
      const next = cal.nextBusinessDay(mon);
      expect(next.getUTCDay()).toBe(2);
    });

    it('includeToday option', () => {
      const mon = new Date('2024-01-08T12:00:00Z'); // Monday
      const next = cal.nextBusinessDay(mon, true);
      // Should return same day since Monday is already a business day
      expect(next.getUTCDate()).toBe(8);
    });

    it('skips holidays', () => {
      const fri = new Date('2024-01-05T12:00:00Z');
      const mon = new Date('2024-01-08T00:00:00Z');
      const c = new Calendar({ holidays: [mon] }); // Monday is holiday
      const next = c.nextBusinessDay(fri);
      expect(next.getUTCDay()).toBe(2); // Tuesday
    });
  });

  describe('prevBusinessDay', () => {
    it('prev business day from Monday is Friday', () => {
      const mon = new Date('2024-01-08T12:00:00Z');
      const prev = cal.prevBusinessDay(mon);
      expect(prev.getUTCDay()).toBe(5); // Friday
    });

    it('prev business day from Wednesday is Tuesday', () => {
      const wed = new Date('2024-01-10T12:00:00Z');
      const prev = cal.prevBusinessDay(wed);
      expect(prev.getUTCDay()).toBe(2); // Tuesday
    });
  });

  describe('businessDaysBetween', () => {
    it('counts business days between dates', () => {
      const mon = new Date('2024-01-08T00:00:00Z'); // Monday
      const fri = new Date('2024-01-12T00:00:00Z'); // Friday
      expect(cal.businessDaysBetween(mon, fri)).toBe(4); // Tue,Wed,Thu,Fri
    });

    it('returns 0 for same day', () => {
      const d = new Date('2024-01-08T00:00:00Z');
      expect(cal.businessDaysBetween(d, d)).toBe(0);
    });

    it('returns negative for reversed dates', () => {
      const mon = new Date('2024-01-08T00:00:00Z');
      const fri = new Date('2024-01-12T00:00:00Z');
      expect(cal.businessDaysBetween(fri, mon)).toBe(-4);
    });

    it('excludes weekends', () => {
      const fri = new Date('2024-01-05T00:00:00Z'); // Friday
      const mon = new Date('2024-01-08T00:00:00Z'); // Monday
      expect(cal.businessDaysBetween(fri, mon)).toBe(1); // Only Monday
    });
  });

  describe('addBusinessDays', () => {
    it('adds business days skipping weekends', () => {
      const fri = new Date('2024-01-05T00:00:00Z'); // Friday
      const result = cal.addBusinessDays(fri, 3);
      // Fri + 1 = Mon, +2 = Tue, +3 = Wed
      expect(result.getUTCDay()).toBe(3); // Wednesday
    });

    it('subtracts business days', () => {
      const wed = new Date('2024-01-10T00:00:00Z'); // Wednesday
      const result = cal.addBusinessDays(wed, -3);
      // Wed - 1 = Tue, -2 = Mon, -3 = Fri
      expect(result.getUTCDay()).toBe(5); // Friday
    });
  });

  describe('isWithinWorkingHours', () => {
    it('9am is within working hours', () => {
      const d = new Date('2024-01-08T09:00:00Z'); // Monday 9am
      expect(cal.isWithinWorkingHours(d)).toBe(true);
    });

    it('5pm is not within working hours (exclusive end)', () => {
      const d = new Date('2024-01-08T17:00:00Z'); // Monday 5pm
      expect(cal.isWithinWorkingHours(d)).toBe(false);
    });

    it('weekend is not within working hours', () => {
      const d = new Date('2024-01-06T10:00:00Z'); // Saturday 10am
      expect(cal.isWithinWorkingHours(d)).toBe(false);
    });

    it('8am is not within working hours', () => {
      const d = new Date('2024-01-08T08:00:00Z'); // Monday 8am
      expect(cal.isWithinWorkingHours(d)).toBe(false);
    });

    it('custom working hours', () => {
      const c = new Calendar({ workStart: 8, workEnd: 16 });
      expect(c.isWithinWorkingHours(new Date('2024-01-08T08:00:00Z'))).toBe(true);
      expect(c.isWithinWorkingHours(new Date('2024-01-08T16:00:00Z'))).toBe(false);
    });
  });

  describe('businessDaysInMonth', () => {
    it('January 2024 has correct business days', () => {
      // Jan 2024: starts Tue, 5 full weeks
      const days = cal.businessDaysInMonth(2024, 1);
      expect(days).toBeGreaterThan(19);
      expect(days).toBeLessThanOrEqual(23);
    });
  });

  describe('listHolidays', () => {
    it('returns sorted list of holidays', () => {
      cal.addHoliday(new Date('2024-12-25T00:00:00Z'));
      cal.addHoliday(new Date('2024-01-01T00:00:00Z'));
      const holidays = cal.listHolidays();
      expect(holidays).toHaveLength(2);
      expect(holidays[0]! < holidays[1]!).toBe(true);
    });
  });

  describe('workingHoursRemaining', () => {
    it('returns hours remaining on a business day', () => {
      const d = new Date('2024-01-08T10:00:00Z'); // Monday 10am
      expect(cal.workingHoursRemaining(d)).toBe(7); // 10am to 5pm
    });

    it('returns 0 on weekend', () => {
      const sat = new Date('2024-01-06T10:00:00Z');
      expect(cal.workingHoursRemaining(sat)).toBe(0);
    });

    it('returns 0 after work hours', () => {
      const d = new Date('2024-01-08T18:00:00Z'); // Monday 6pm
      expect(cal.workingHoursRemaining(d)).toBe(0);
    });
  });
});
