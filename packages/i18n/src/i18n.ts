// I18n class - main internationalization engine
import { getCardinalRule, getPluralCategory } from './plural-rules.js';
import { NumberFormatter, DateFormatter, CurrencyFormatter, RelativeTimeFormatter } from './formatters.js';
import type {
  Locale,
  TranslationKey,
  TranslationMap,
  TranslationValue,
  TranslationPluralMap,
  PluralCategory,
  InterpolationParams,
  I18nConfig,
  CurrencyFormatOptions,
  DateFormatOptions,
  NumberFormatOptions,
} from './types.js';

function isPluralMap(v: TranslationValue): v is TranslationPluralMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'other' in v;
}

function isTranslationMap(v: TranslationValue): v is TranslationMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !('other' in v);
}

export class I18n {
  private locale: Locale;
  private fallbackLocale: Locale;
  private translations: Map<Locale, TranslationMap> = new Map();
  private missingKeyHandler?: (key: TranslationKey, locale: Locale) => string;
  private numberFmt = new NumberFormatter();
  private dateFmt = new DateFormatter();
  private currencyFmt = new CurrencyFormatter();
  private relativeFmt = new RelativeTimeFormatter();

  constructor(config: I18nConfig) {
    this.locale = config.locale;
    this.fallbackLocale = config.fallbackLocale ?? 'en';
    this.missingKeyHandler = config.missingKeyHandler;

    if (config.translations) {
      for (const [locale, map] of Object.entries(config.translations)) {
        this.translations.set(locale, map);
      }
    }
  }

  // Load translations for a locale
  load(locale: Locale, map: TranslationMap): void {
    const existing = this.translations.get(locale) ?? {};
    this.translations.set(locale, this.deepMerge(existing, map));
  }

  // Switch current locale
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  getLocale(): Locale {
    return this.locale;
  }

  // Translate a key with optional params
  t(key: TranslationKey, params?: InterpolationParams): string {
    const value = this.lookup(key, this.locale) ?? this.lookup(key, this.fallbackLocale);

    if (value === undefined) {
      if (this.missingKeyHandler) {
        return this.missingKeyHandler(key, this.locale);
      }
      return key; // fallback to key itself
    }

    if (typeof value === 'string') {
      return this.interpolate(value, params);
    }

    // If it's a plural map or nested map without count, return 'other'
    if (isPluralMap(value)) {
      return this.interpolate(value.other, params);
    }

    return key;
  }

  // Translate with pluralization
  tn(key: TranslationKey, count: number, params?: InterpolationParams): string {
    const value = this.lookup(key, this.locale) ?? this.lookup(key, this.fallbackLocale);

    if (value === undefined) {
      if (this.missingKeyHandler) {
        return this.missingKeyHandler(key, this.locale);
      }
      return key;
    }

    const allParams = { ...params, count };

    if (typeof value === 'string') {
      return this.interpolate(value, allParams);
    }

    if (isPluralMap(value)) {
      const category = getPluralCategory(count, this.locale);
      const template = this.selectPlural(value, category);
      return this.interpolate(template, allParams);
    }

    return key;
  }

  // Check if a key exists
  has(key: TranslationKey, locale?: Locale): boolean {
    return this.lookup(key, locale ?? this.locale) !== undefined;
  }

  // Get all keys for a namespace (prefix)
  getKeys(namespace: string, locale?: Locale): string[] {
    const map = this.translations.get(locale ?? this.locale);
    if (!map) return [];
    const value = this.lookupInMap(namespace, map);
    if (isTranslationMap(value)) {
      return Object.keys(value);
    }
    return [];
  }

  // ─── Number formatting ────────────────────────────────────────────────────

  formatNumber(value: number, options?: NumberFormatOptions): string {
    return this.numberFmt.format(value, { locale: this.locale, ...options });
  }

  formatPercent(value: number): string {
    return this.numberFmt.formatPercent(value, this.locale);
  }

  formatCompact(value: number): string {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return this.formatNumber(value);
  }

  // ─── Currency formatting ──────────────────────────────────────────────────

  formatCurrency(value: number, currency: string, options?: Partial<CurrencyFormatOptions>): string {
    return this.currencyFmt.format(value, { currency, locale: this.locale, ...options });
  }

  // ─── Date formatting ──────────────────────────────────────────────────────

  formatDate(value: Date | string, options?: DateFormatOptions): string {
    return this.dateFmt.formatDate(value, options?.locale ?? this.locale);
  }

  formatTime(value: Date | string, options?: DateFormatOptions): string {
    return this.dateFmt.formatTime(value, options?.locale ?? this.locale);
  }

  formatDateTime(value: Date | string, options?: DateFormatOptions): string {
    return this.dateFmt.formatDateTime(value, options?.locale ?? this.locale);
  }

  formatRelative(value: Date | string): string {
    return this.relativeFmt.fromNow(value, this.locale);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private lookup(key: TranslationKey, locale: Locale): TranslationValue | undefined {
    const map = this.translations.get(locale);
    if (!map) return undefined;
    return this.lookupInMap(key, map);
  }

  private lookupInMap(key: string, map: TranslationMap): TranslationValue | undefined {
    // Support dot notation: 'errors.not_found'
    const parts = key.split('.');
    let current: TranslationValue = map;

    for (const part of parts) {
      if (isTranslationMap(current)) {
        const next = current[part];
        if (next === undefined) return undefined;
        current = next;
      } else {
        return undefined;
      }
    }

    return current;
  }

  private interpolate(template: string, params?: InterpolationParams): string {
    if (!params) return template;
    return template.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_match, key: string) => {
      const val = params[key];
      if (val === undefined || val === null) return '';
      return String(val);
    });
  }

  private selectPlural(map: TranslationPluralMap, category: PluralCategory): string {
    switch (category) {
      case 'zero':  return map.zero  ?? map.other;
      case 'one':   return map.one   ?? map.other;
      case 'two':   return map.two   ?? map.other;
      case 'few':   return map.few   ?? map.other;
      case 'many':  return map.many  ?? map.other;
      default:      return map.other;
    }
  }

  private deepMerge(target: TranslationMap, source: TranslationMap): TranslationMap {
    const result: TranslationMap = { ...target };
    for (const [key, value] of Object.entries(source)) {
      const existing = result[key];
      if (isTranslationMap(value) && isTranslationMap(existing)) {
        result[key] = this.deepMerge(existing, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

// Factory function
export function createI18n(config: I18nConfig): I18n {
  return new I18n(config);
}
