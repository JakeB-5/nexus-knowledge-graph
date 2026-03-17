// @nexus/i18n - Internationalization for Nexus platform
export { I18n, createI18n } from './i18n.js';
export {
  NumberFormatter,
  CompactNumberFormatter,
  CurrencyFormatter,
  DateFormatter,
  RelativeTimeFormatter,
  ListFormatter,
  numberFormatter,
  compactNumberFormatter,
  currencyFormatter,
  dateFormatter,
  relativeTimeFormatter,
  listFormatter,
} from './formatters.js';
export {
  getCardinalRule,
  getOrdinalRule,
  getPluralCategory,
  getOrdinalSuffix,
  cardinalRules,
  ordinalRules,
} from './plural-rules.js';
export { en } from './translations/en.js';
export { ko } from './translations/ko.js';
export type {
  Locale,
  TranslationKey,
  TranslationMap,
  TranslationValue,
  TranslationPluralMap,
  PluralCategory,
  PluralRule,
  FormatOptions,
  InterpolationParams,
  I18nConfig,
  RelativeTimeUnit,
  CurrencyFormatOptions,
  NumberFormatOptions,
  DateFormatOptions,
} from './types.js';
