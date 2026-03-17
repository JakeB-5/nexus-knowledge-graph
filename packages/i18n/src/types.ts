// i18n type definitions

export type Locale = string; // e.g. 'en', 'ko', 'fr', 'ru'

export type TranslationKey = string; // e.g. 'errors.not_found'

export type TranslationValue = string | TranslationPluralMap | TranslationMap;

export type TranslationMap = {
  [key: string]: TranslationValue;
};

export type TranslationPluralMap = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type PluralRule = (n: number) => PluralCategory;

export type FormatOptions = {
  // Number formatting
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
  style?: 'decimal' | 'percent' | 'currency';
  currency?: string;
  // Date formatting
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  // Relative time
  numeric?: 'always' | 'auto';
};

export type InterpolationParams = Record<string, string | number | boolean | null | undefined>;

export type I18nConfig = {
  locale: Locale;
  fallbackLocale?: Locale;
  translations?: Record<Locale, TranslationMap>;
  missingKeyHandler?: (key: TranslationKey, locale: Locale) => string;
  pluralRules?: Record<Locale, PluralRule>;
};

export type RelativeTimeUnit =
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

export type CurrencyFormatOptions = {
  currency: string;
  locale?: Locale;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export type NumberFormatOptions = {
  locale?: Locale;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
};

export type DateFormatOptions = {
  locale?: Locale;
  format?: string; // custom format string
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
};
