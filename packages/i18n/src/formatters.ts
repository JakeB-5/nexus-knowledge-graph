// Locale-aware formatters
import type {
  Locale,
  NumberFormatOptions,
  DateFormatOptions,
  CurrencyFormatOptions,
  RelativeTimeUnit,
} from './types.js';

// ─── Number Formatter ─────────────────────────────────────────────────────────

export class NumberFormatter {
  format(value: number, options: NumberFormatOptions = {}): string {
    const locale = options.locale ?? 'en';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: options.minimumFractionDigits,
      maximumFractionDigits: options.maximumFractionDigits,
      useGrouping: options.useGrouping ?? true,
    }).format(value);
  }

  formatPercent(value: number, locale: Locale = 'en'): string {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  formatOrdinal(n: number, locale: Locale = 'en'): string {
    const pr = new Intl.PluralRules(locale, { type: 'ordinal' });
    const suffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
    const rule = pr.select(n);
    const suffix = suffixes[rule] ?? 'th';
    return `${n}${suffix}`;
  }
}

// ─── Compact Number Formatter ─────────────────────────────────────────────────

export class CompactNumberFormatter {
  format(value: number, locale: Locale = 'en'): string {
    if (Math.abs(value) >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat(locale).format(value);
  }
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

export class CurrencyFormatter {
  format(value: number, options: CurrencyFormatOptions): string {
    const locale = options.locale ?? 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: options.currency,
      minimumFractionDigits: options.minimumFractionDigits ?? 2,
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
    }).format(value);
  }

  formatUSD(value: number, locale: Locale = 'en-US'): string {
    return this.format(value, { currency: 'USD', locale });
  }

  formatEUR(value: number, locale: Locale = 'de-DE'): string {
    return this.format(value, { currency: 'EUR', locale });
  }

  formatKRW(value: number, locale: Locale = 'ko-KR'): string {
    return this.format(value, { currency: 'KRW', locale, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

// ─── Date Formatter ───────────────────────────────────────────────────────────

export class DateFormatter {
  format(value: Date | string | number, options: DateFormatOptions = {}): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    const locale = options.locale ?? 'en';

    if (options.format) {
      return this.formatCustom(date, options.format);
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: options.dateStyle,
      timeStyle: options.timeStyle,
    }).format(date);
  }

  formatCustom(date: Date, fmt: string): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return fmt
      .replace('YYYY', String(date.getFullYear()))
      .replace('YY', String(date.getFullYear()).slice(-2))
      .replace('MM', pad(date.getMonth() + 1))
      .replace('M', String(date.getMonth() + 1))
      .replace('DD', pad(date.getDate()))
      .replace('D', String(date.getDate()))
      .replace('HH', pad(date.getHours()))
      .replace('H', String(date.getHours()))
      .replace('mm', pad(date.getMinutes()))
      .replace('ss', pad(date.getSeconds()))
      .replace('SSS', pad(date.getMilliseconds(), 3));
  }

  formatDate(value: Date | string, locale: Locale = 'en'): string {
    return this.format(value, { locale, dateStyle: 'medium' });
  }

  formatTime(value: Date | string, locale: Locale = 'en'): string {
    return this.format(value, { locale, timeStyle: 'short' });
  }

  formatDateTime(value: Date | string, locale: Locale = 'en'): string {
    return this.format(value, { locale, dateStyle: 'medium', timeStyle: 'short' });
  }
}

// ─── Relative Time Formatter ──────────────────────────────────────────────────

export class RelativeTimeFormatter {
  private thresholds: Array<{ unit: RelativeTimeUnit; ms: number }> = [
    { unit: 'second', ms: 1000 },
    { unit: 'minute', ms: 60 * 1000 },
    { unit: 'hour',   ms: 60 * 60 * 1000 },
    { unit: 'day',    ms: 24 * 60 * 60 * 1000 },
    { unit: 'week',   ms: 7 * 24 * 60 * 60 * 1000 },
    { unit: 'month',  ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: 'year',   ms: 365 * 24 * 60 * 60 * 1000 },
  ];

  format(value: Date | string | number, locale: Locale = 'en', numeric: 'always' | 'auto' = 'auto'): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);

    const diff = date.getTime() - Date.now();
    const absDiff = Math.abs(diff);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric });

    for (let i = this.thresholds.length - 1; i >= 0; i--) {
      const threshold = this.thresholds[i]!;
      if (absDiff >= threshold.ms || i === 0) {
        const prevMs = i > 0 ? (this.thresholds[i - 1]?.ms ?? threshold.ms) : threshold.ms;
        const value = Math.round(diff / (i === 0 ? prevMs : threshold.ms));
        return rtf.format(value, threshold.unit);
      }
    }

    return rtf.format(0, 'second');
  }

  fromNow(value: Date | string | number, locale: Locale = 'en'): string {
    const date = value instanceof Date ? value : new Date(value);
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return locale === 'ko' ? '방금 전' : 'just now';
    if (minutes < 60) return locale === 'ko' ? `${minutes}분 전` : `${minutes}m ago`;
    if (hours < 24) return locale === 'ko' ? `${hours}시간 전` : `${hours}h ago`;
    if (days < 30) return locale === 'ko' ? `${days}일 전` : `${days}d ago`;
    return this.format(value, locale);
  }
}

// ─── List Formatter ───────────────────────────────────────────────────────────

export class ListFormatter {
  format(items: string[], locale: Locale = 'en', type: 'conjunction' | 'disjunction' = 'conjunction'): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0] ?? '';

    try {
      return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
    } catch {
      // Fallback for environments without Intl.ListFormat
      if (items.length === 2) {
        const connector = type === 'conjunction' ? ' and ' : ' or ';
        return items.join(connector);
      }
      const last = items[items.length - 1];
      const connector = type === 'conjunction' ? 'and' : 'or';
      return `${items.slice(0, -1).join(', ')}, ${connector} ${last}`;
    }
  }

  conjunction(items: string[], locale: Locale = 'en'): string {
    return this.format(items, locale, 'conjunction');
  }

  disjunction(items: string[], locale: Locale = 'en'): string {
    return this.format(items, locale, 'disjunction');
  }
}

// Singleton instances for convenience
export const numberFormatter = new NumberFormatter();
export const compactNumberFormatter = new CompactNumberFormatter();
export const currencyFormatter = new CurrencyFormatter();
export const dateFormatter = new DateFormatter();
export const relativeTimeFormatter = new RelativeTimeFormatter();
export const listFormatter = new ListFormatter();
