/**
 * Language detection using Unicode script ranges, character frequency
 * profiles, and common-word matching.
 */

import type { LanguageCode, LanguageDetectionResult } from "./types.js";

// ---------------------------------------------------------------------------
// Common words per language (top ~30 function words)
// ---------------------------------------------------------------------------

const COMMON_WORDS: Record<LanguageCode, string[]> = {
  en: [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "it",
    "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
    "but", "his", "by", "from", "they", "we", "say", "her", "she",
  ],
  ko: [
    "이", "가", "을", "를", "은", "는", "의", "에", "도", "로",
    "에서", "와", "과", "이다", "있다", "하다", "것", "수", "그", "한",
    "우리", "그리고", "그러나", "그래서", "때문에", "하지만",
  ],
  ja: [
    "の", "は", "が", "て", "に", "を", "た", "で", "と", "か",
    "も", "な", "し", "れ", "ば", "ない", "する", "いる", "この", "その",
    "ある", "できる", "こと", "よ", "ね", "です", "ます", "から",
  ],
  zh: [
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
    "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
    "你", "会", "着", "没有", "看", "好", "自己", "这", "来", "他",
  ],
  es: [
    "de", "la", "que", "el", "en", "y", "a", "los", "del", "se",
    "las", "un", "por", "con", "una", "su", "para", "es", "al", "lo",
    "como", "más", "pero", "sus", "le", "ya", "o", "este", "si",
  ],
  fr: [
    "de", "la", "le", "les", "et", "en", "un", "du", "une", "à",
    "il", "est", "que", "dans", "qui", "des", "sur", "au", "par", "se",
    "tout", "comme", "elle", "ne", "pas", "plus", "ou", "si", "leur",
  ],
  de: [
    "der", "die", "und", "in", "den", "von", "zu", "das", "mit", "sich",
    "des", "auf", "für", "ist", "im", "dem", "nicht", "ein", "eine",
    "als", "auch", "es", "an", "werden", "aus", "er", "hat", "daß",
  ],
  unknown: [],
};

// ---------------------------------------------------------------------------
// Unicode script detection helpers
// ---------------------------------------------------------------------------

function hasHangul(text: string): boolean {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

function hasHiraganaKatakana(text: string): boolean {
  return /[\u3040-\u30FF]/.test(text);
}

function hasCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

// ---------------------------------------------------------------------------
// Character n-gram frequency profile (for Latin-script languages)
// ---------------------------------------------------------------------------

function buildCharProfile(text: string): Map<string, number> {
  const profile = new Map<string, number>();
  const normalized = text.toLowerCase().replace(/[^a-z ]/g, "");
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    if (bigram.includes(" ")) continue;
    profile.set(bigram, (profile.get(bigram) ?? 0) + 1);
  }
  return profile;
}

// Typical bigram frequencies for Latin-script languages
const LATIN_PROFILES: Record<string, string[]> = {
  en: ["th", "he", "in", "er", "an", "re", "on", "at", "en", "nd", "st", "or"],
  es: ["de", "en", "la", "el", "os", "as", "es", "ar", "un", "al", "on", "io"],
  fr: ["es", "en", "de", "le", "re", "er", "on", "nt", "ou", "ai", "it", "au"],
  de: ["en", "er", "in", "ch", "de", "ei", "ge", "st", "be", "ie", "te", "an"],
};

function latinScriptScore(text: string, lang: string): number {
  const profile = buildCharProfile(text);
  const expected = LATIN_PROFILES[lang] ?? [];
  let matches = 0;
  let totalExpected = expected.length;
  if (totalExpected === 0) return 0;
  for (const bigram of expected) {
    if ((profile.get(bigram) ?? 0) > 0) matches++;
  }
  return matches / totalExpected;
}

// ---------------------------------------------------------------------------
// Common word matching score
// ---------------------------------------------------------------------------

function commonWordScore(text: string, lang: LanguageCode): number {
  const words = lang === "ko" || lang === "ja" || lang === "zh"
    ? text.split("") // CJK: character-level
    : text.toLowerCase().match(/\b[a-z]{1,15}\b/g) ?? [];

  const wordSet = new Set(words);
  const commonWords = COMMON_WORDS[lang];
  if (commonWords.length === 0) return 0;

  let matches = 0;
  for (const word of commonWords) {
    if (wordSet.has(word)) matches++;
  }
  return matches / commonWords.length;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

export function detectLanguage(text: string): LanguageDetectionResult {
  if (text.trim().length === 0) {
    return {
      language: "unknown",
      confidence: 0,
      candidates: [{ language: "unknown", confidence: 0 }],
    };
  }

  const candidates: Array<{ language: LanguageCode; confidence: number }> = [];

  // --- Script-based fast paths ---
  if (hasHangul(text)) {
    const hangulChars = (text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) ?? []).length;
    const ratio = hangulChars / text.replace(/\s/g, "").length;
    const wordScore = commonWordScore(text, "ko");
    candidates.push({ language: "ko", confidence: ratio * 0.7 + wordScore * 0.3 });
  }

  if (hasHiraganaKatakana(text)) {
    const jaChars = (text.match(/[\u3040-\u30FF]/g) ?? []).length;
    const ratio = jaChars / text.replace(/\s/g, "").length;
    candidates.push({ language: "ja", confidence: ratio * 0.8 + commonWordScore(text, "ja") * 0.2 });
  }

  if (hasCJK(text) && !hasHangul(text) && !hasHiraganaKatakana(text)) {
    const cjkChars = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) ?? []).length;
    const ratio = cjkChars / text.replace(/\s/g, "").length;
    candidates.push({ language: "zh", confidence: ratio * 0.75 + commonWordScore(text, "zh") * 0.25 });
  }

  // --- Latin-script language detection ---
  const latinText = text.replace(/[^a-zA-Z\s]/g, "");
  const latinRatio = latinText.replace(/\s/g, "").length / (text.replace(/\s/g, "").length || 1);

  if (latinRatio > 0.4) {
    const latinLangs: LanguageCode[] = ["en", "es", "fr", "de"];
    for (const lang of latinLangs) {
      const wordScore = commonWordScore(text, lang);
      const bigramScore = latinScriptScore(text, lang);
      const confidence = latinRatio * (wordScore * 0.6 + bigramScore * 0.4);
      if (confidence > 0) {
        candidates.push({ language: lang, confidence });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      language: "unknown",
      confidence: 0,
      candidates: [{ language: "unknown", confidence: 0 }],
    };
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  // Normalize confidences so the top candidate is <= 1.0
  const maxConf = candidates[0]!.confidence;
  const normalized = candidates.map((c) => ({
    language: c.language,
    confidence: Math.min(1, maxConf > 0 ? c.confidence / maxConf : 0),
  }));

  // Re-sort after normalization (order preserved since we only scaled)
  const top = normalized[0]!;

  return {
    language: top.language,
    confidence: top.confidence,
    candidates: normalized,
  };
}

export class LanguageDetector {
  detect(text: string): LanguageDetectionResult {
    return detectLanguage(text);
  }

  isLanguage(text: string, lang: LanguageCode, threshold = 0.5): boolean {
    const result = detectLanguage(text);
    return result.language === lang && result.confidence >= threshold;
  }
}
