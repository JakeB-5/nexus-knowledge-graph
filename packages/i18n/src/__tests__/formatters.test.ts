import { describe, it, expect } from 'vitest';
import {
  NumberFormatter,
  CompactNumberFormatter,
  CurrencyFormatter,
  DateFormatter,
  RelativeTimeFormatter,
  ListFormatter,
} from '../formatters.js';

describe('NumberFormatter', () => {
  const fmt = new NumberFormatter();

  it('formats number with grouping', () => {
    const result = fmt.format(1234567.89);
    expect(result).toContain('1,234,567');
  });

  it('formats number without grouping', () => {
    const result = fmt.format(1234567, { useGrouping: false });
    expect(result).not.toContain(',');
  });

  it('formats with fixed decimal places', () => {
    const result = fmt.format(3.14159, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(result).toContain('3.14');
  });

  it('formats percent', () => {
    const result = fmt.formatPercent(0.75);
    expect(result).toContain('75');
  });

  it('formats ordinal', () => {
    expect(fmt.formatOrdinal(1)).toBe('1st');
    expect(fmt.formatOrdinal(2)).toBe('2nd');
    expect(fmt.formatOrdinal(3)).toBe('3rd');
    expect(fmt.formatOrdinal(4)).toBe('4th');
    expect(fmt.formatOrdinal(11)).toBe('11th');
    expect(fmt.formatOrdinal(21)).toBe('21st');
  });
});

describe('CompactNumberFormatter', () => {
  const fmt = new CompactNumberFormatter();

  it('formats thousands as K', () => {
    expect(fmt.format(1500)).toBe('1.5K');
  });

  it('formats millions as M', () => {
    expect(fmt.format(2_500_000)).toBe('2.5M');
  });

  it('formats billions as B', () => {
    expect(fmt.format(3_500_000_000)).toBe('3.5B');
  });

  it('formats small numbers normally', () => {
    const result = fmt.format(42);
    expect(result).toBe('42');
  });
});

describe('CurrencyFormatter', () => {
  const fmt = new CurrencyFormatter();

  it('formats USD', () => {
    const result = fmt.formatUSD(1234.56);
    expect(result).toContain('1,234.56');
    expect(result).toContain('$');
  });

  it('formats EUR', () => {
    const result = fmt.formatEUR(1234.56);
    expect(result).toContain('1.234,56');
  });

  it('formats KRW without decimals', () => {
    const result = fmt.formatKRW(50000);
    expect(result).toContain('50,000');
    expect(result).not.toContain('.');
  });

  it('formats custom currency', () => {
    const result = fmt.format(100, { currency: 'GBP', locale: 'en-GB' });
    expect(result).toContain('100');
  });
});

describe('DateFormatter', () => {
  const fmt = new DateFormatter();
  const date = new Date('2024-01-15T10:30:00.000Z');

  it('formats date with dateStyle', () => {
    const result = fmt.format(date, { dateStyle: 'short' });
    expect(result).toBeTruthy();
  });

  it('formatCustom formats with pattern', () => {
    // Use UTC to avoid timezone issues
    const utcDate = new Date(Date.UTC(2024, 0, 15, 10, 30, 45));
    // formatCustom uses local time, so we test pattern structure
    const result = fmt.formatCustom(utcDate, 'YYYY');
    expect(result).toMatch(/\d{4}/);
  });

  it('formatDate returns string', () => {
    const result = fmt.formatDate(date, 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatTime returns string', () => {
    const result = fmt.formatTime(date, 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatDateTime returns string', () => {
    const result = fmt.formatDateTime(date, 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles invalid date gracefully', () => {
    const result = fmt.format('not-a-date');
    expect(result).toBe('not-a-date');
  });
});

describe('RelativeTimeFormatter', () => {
  const fmt = new RelativeTimeFormatter();

  it('fromNow returns "just now" for very recent date', () => {
    const result = fmt.fromNow(new Date());
    expect(result).toBe('just now');
  });

  it('fromNow returns minutes ago', () => {
    const past = new Date(Date.now() - 3 * 60 * 1000);
    const result = fmt.fromNow(past);
    expect(result).toContain('3');
  });

  it('fromNow returns Korean for ko locale', () => {
    const result = fmt.fromNow(new Date(), 'ko');
    expect(result).toBe('방금 전');
  });

  it('fromNow returns Korean minutes', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    const result = fmt.fromNow(past, 'ko');
    expect(result).toContain('분 전');
  });
});

describe('ListFormatter', () => {
  const fmt = new ListFormatter();

  it('formats single item', () => {
    expect(fmt.format(['Alice'])).toBe('Alice');
  });

  it('formats two items with conjunction', () => {
    const result = fmt.conjunction(['Alice', 'Bob'], 'en');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  it('formats multiple items', () => {
    const result = fmt.conjunction(['Alice', 'Bob', 'Carol'], 'en');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('Carol');
  });

  it('formats empty list as empty string', () => {
    expect(fmt.format([])).toBe('');
  });

  it('formats disjunction with or', () => {
    const result = fmt.disjunction(['cats', 'dogs'], 'en');
    expect(result.toLowerCase()).toContain('or');
  });
});
