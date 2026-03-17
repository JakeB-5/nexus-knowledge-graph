// Plural rules for different languages
import type { PluralCategory, PluralRule } from './types.js';

// ─── Cardinal plural rules ────────────────────────────────────────────────────

// English: one, other
// 1 → one, all else → other
const en: PluralRule = (n) => (n === 1 ? 'one' : 'other');

// German, Dutch, Swedish, Norwegian, Danish — same as English
const de: PluralRule = en;
const nl: PluralRule = en;
const sv: PluralRule = en;
const nb: PluralRule = en;
const da: PluralRule = en;

// Korean, Japanese, Chinese, Thai — no plural distinction
const ko: PluralRule = (_n) => 'other';
const ja: PluralRule = (_n) => 'other';
const zh: PluralRule = (_n) => 'other';
const th: PluralRule = (_n) => 'other';

// French: one for 0 and 1, other for rest
const fr: PluralRule = (n) => (n === 0 || n === 1 ? 'one' : 'other');

// Portuguese (same as French)
const pt: PluralRule = fr;

// Italian — same as English
const it: PluralRule = en;

// Spanish — same as English
const es: PluralRule = en;

// Russian: complex rules
// 1, 21, 31... → one
// 2-4, 22-24... → few
// 5-20, 25-30... → many
// 0 and decimals → other
const ru: PluralRule = (n): PluralCategory => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'few';
  if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) return 'many';
  return 'other';
};

// Ukrainian — same pattern as Russian
const uk: PluralRule = ru;

// Polish: similar to Russian but different
const pl: PluralRule = (n): PluralCategory => {
  if (n === 1) return 'one';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'few';
  return 'other';
};

// Czech, Slovak
const cs: PluralRule = (n): PluralCategory => {
  if (n === 1) return 'one';
  if (n >= 2 && n <= 4) return 'few';
  return 'other';
};
const sk: PluralRule = cs;

// Arabic: zero, one, two, few, many, other
const ar: PluralRule = (n): PluralCategory => {
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
};

// Slovenian
const sl: PluralRule = (n): PluralCategory => {
  const mod100 = n % 100;
  if (mod100 === 1) return 'one';
  if (mod100 === 2) return 'two';
  if (mod100 === 3 || mod100 === 4) return 'few';
  return 'other';
};

// Lithuanian
const lt: PluralRule = (n): PluralCategory => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && !(mod100 >= 11 && mod100 <= 19)) return 'one';
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return 'few';
  return 'other';
};

// Latvian
const lv: PluralRule = (n): PluralCategory => {
  if (n % 10 === 1 && n % 100 !== 11) return 'one';
  if (n === 0) return 'zero';
  return 'other';
};

// ─── Ordinal plural rules ─────────────────────────────────────────────────────

// English ordinals: 1st, 2nd, 3rd, 4th...
const enOrdinal: PluralRule = (n): PluralCategory => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';   // 1st, 21st
  if (mod10 === 2 && mod100 !== 12) return 'two';   // 2nd, 22nd
  if (mod10 === 3 && mod100 !== 13) return 'few';   // 3rd, 23rd
  return 'other';                                     // 4th+
};

// ─── Rule registry ────────────────────────────────────────────────────────────

export const cardinalRules: Record<string, PluralRule> = {
  en, de, nl, sv, nb, da,
  ko, ja, zh, th,
  fr, pt,
  it, es,
  ru, uk,
  pl,
  cs, sk,
  ar,
  sl,
  lt,
  lv,
  // aliases
  'en-US': en,
  'en-GB': en,
  'fr-FR': fr,
  'fr-CA': fr,
  'pt-BR': fr,
  'pt-PT': en,
  'zh-CN': zh,
  'zh-TW': zh,
  'ko-KR': ko,
  'ja-JP': ja,
  'ar-SA': ar,
};

export const ordinalRules: Record<string, PluralRule> = {
  en: enOrdinal,
  'en-US': enOrdinal,
  'en-GB': enOrdinal,
  // Most languages don't have distinct ordinal forms
};

export function getCardinalRule(locale: string): PluralRule {
  // Try exact match first
  const exact = cardinalRules[locale];
  if (exact) return exact;
  // Try language prefix (e.g., 'en' from 'en-US')
  const lang = locale.split('-')[0] ?? locale;
  return cardinalRules[lang] ?? ((_n) => 'other');
}

export function getOrdinalRule(locale: string): PluralRule {
  const exact = ordinalRules[locale];
  if (exact) return exact;
  const lang = locale.split('-')[0] ?? locale;
  return ordinalRules[lang] ?? ((_n) => 'other');
}

export function getPluralCategory(n: number, locale: string, ordinal = false): PluralCategory {
  const rule = ordinal ? getOrdinalRule(locale) : getCardinalRule(locale);
  return rule(n);
}

export function getOrdinalSuffix(n: number, locale: string): string {
  const category = getPluralCategory(n, locale, true);
  const lang = locale.split('-')[0] ?? locale;
  if (lang === 'en') {
    switch (category) {
      case 'one': return 'st';
      case 'two': return 'nd';
      case 'few': return 'rd';
      default:    return 'th';
    }
  }
  return '';
}
