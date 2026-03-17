/**
 * Lexicon-based sentiment analysis.
 * Uses an AFINN-style built-in dictionary with negation, intensifier,
 * diminisher, and emoji support.
 */

import { tokenizeWords } from "./tokenizer.js";
import type { SentimentResult, SentimentLabel } from "./types.js";

// ---------------------------------------------------------------------------
// AFINN-style sentiment dictionary (subset, ~200 entries)
// ---------------------------------------------------------------------------

const SENTIMENT_SCORES: Record<string, number> = {
  // Strongly positive
  excellent: 5, outstanding: 5, superb: 5, magnificent: 5, wonderful: 5,
  fantastic: 5, extraordinary: 5, phenomenal: 5, exceptional: 5, brilliant: 5,
  // Positive
  good: 3, great: 4, nice: 3, happy: 3, love: 4, lovely: 3, beautiful: 3,
  best: 4, better: 2, positive: 2, pleasant: 2, enjoy: 3, enjoyed: 3,
  enjoying: 3, awesome: 4, amazing: 4, perfect: 4, incredible: 4,
  delightful: 3, charming: 3, impressive: 3, satisfying: 3, satisfied: 2,
  pleased: 2, glad: 2, joyful: 3, cheerful: 3, optimistic: 2, hopeful: 2,
  grateful: 2, thankful: 2, blessed: 3, fortunate: 2, lucky: 2, win: 2,
  winning: 3, success: 3, successful: 3, achievement: 3, achieve: 2,
  progress: 2, improve: 2, improved: 2, improvement: 2, innovative: 2,
  creative: 2, helpful: 2, useful: 2, effective: 2, efficient: 2,
  reliable: 2, trustworthy: 2, honest: 2, fair: 1, clean: 1,
  safe: 1, secure: 2, stable: 1, strong: 2, powerful: 2, smart: 2,
  wise: 2, kind: 2, friendly: 2, generous: 2, caring: 2, supportive: 2,
  fun: 2, entertaining: 2, exciting: 3, thrilling: 3, inspiring: 3,
  motivated: 2, motivated: 2, confident: 2, proud: 2,
  // Mildly positive
  ok: 1, okay: 1, fine: 1, alright: 1, decent: 1, acceptable: 1,
  reasonable: 1, adequate: 1, sufficient: 1,
  // Mildly negative
  bad: -3, poor: -2, boring: -2, mediocre: -2, average: -1, meh: -1,
  dull: -2, bland: -2, weak: -2, slow: -1, limited: -1, lacking: -2,
  // Negative
  terrible: -5, horrible: -5, awful: -5, dreadful: -5, disgusting: -5,
  appalling: -5, atrocious: -5, abysmal: -5, vile: -4, nasty: -4,
  hate: -4, hated: -4, hating: -4, dislike: -3, disliked: -3,
  loathe: -4, despise: -4, angry: -3, furious: -4, outraged: -4,
  frustrated: -3, disappointed: -3, disappointing: -3, disappointment: -3,
  sad: -3, unhappy: -3, miserable: -4, depressed: -4, depressing: -4,
  heartbroken: -4, devastated: -4, grief: -3, sorrow: -3, pain: -3,
  suffer: -3, suffering: -3, fail: -3, failed: -3, failure: -3,
  broken: -3, damaged: -3, corrupt: -3, corrupted: -3,
  wrong: -2, error: -2, mistake: -2, problem: -2, issue: -2, fault: -2,
  ugly: -3, dirty: -2, messy: -2, chaotic: -3, dangerous: -3, harmful: -3,
  toxic: -3, abusive: -4, violent: -4, cruel: -4, selfish: -3, rude: -3,
  dishonest: -3, unfair: -2, unreliable: -2, ineffective: -2, useless: -3,
  waste: -2, wasted: -2, stupid: -3, idiot: -4, fool: -2,
  // Intensifiers
  very: 0, really: 0, extremely: 0, incredibly: 0, absolutely: 0,
  utterly: 0, totally: 0, completely: 0, highly: 0, so: 0,
  // Diminishers
  slightly: 0, somewhat: 0, barely: 0, hardly: 0, almost: 0, nearly: 0,
  // Negators (handled separately)
  not: 0, never: 0, neither: 0, nobody: 0, nothing: 0, nowhere: 0,
  // Contractions handled via word cleaning
  "n't": 0,
};

// ---------------------------------------------------------------------------
// Intensifiers and diminishers (applied to next sentiment word)
// ---------------------------------------------------------------------------

const INTENSIFIERS = new Set([
  "very", "really", "extremely", "incredibly", "absolutely", "utterly",
  "totally", "completely", "highly", "so", "super", "awfully", "terribly",
  "remarkably", "exceptionally", "quite", "rather",
]);

const DIMINISHERS = new Set([
  "slightly", "somewhat", "barely", "hardly", "almost", "nearly",
  "little", "bit", "kind", "sort", "fairly", "moderately",
]);

// ---------------------------------------------------------------------------
// Negators (invert the sign of the next sentiment word)
// ---------------------------------------------------------------------------

const NEGATORS = new Set([
  "not", "never", "neither", "nobody", "nothing", "nowhere",
  "no", "without", "cant", "cannot", "wont", "dont", "doesnt",
  "didnt", "isnt", "wasnt", "arent", "werent", "hasnt", "havent",
  "hadnt", "shouldnt", "wouldnt", "couldnt", "n't",
]);

// ---------------------------------------------------------------------------
// Emoji sentiment
// ---------------------------------------------------------------------------

const EMOJI_SCORES: Record<string, number> = {
  "😀": 3, "😁": 3, "😂": 3, "🤣": 3, "😃": 3, "😄": 3, "😅": 2,
  "😆": 3, "😊": 3, "🙂": 1, "🥰": 4, "😍": 4, "🤩": 4, "😘": 3,
  "😗": 2, "😙": 2, "😚": 2, "😋": 2, "😛": 2, "😜": 2, "🤪": 2,
  "😎": 3, "🤓": 1, "🥳": 4, "🤗": 3, "🤠": 2, "👍": 3, "👌": 2,
  "🙌": 4, "👏": 3, "🎉": 4, "🎊": 4, "❤️": 4, "💕": 4, "💯": 4,
  "✅": 2, "⭐": 2, "🌟": 3, "✨": 2, "🔥": 2,
  // Negative
  "😞": -3, "😢": -3, "😭": -4, "😡": -4, "🤬": -5, "😠": -3,
  "😤": -3, "😒": -2, "😑": -1, "🙁": -2, "☹️": -2, "😣": -3,
  "😖": -3, "😫": -3, "😩": -3, "🤮": -4, "🤢": -3, "💔": -4,
  "👎": -3, "❌": -2, "🚫": -2, "💩": -3,
};

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

function cleanToken(token: string): string {
  return token.toLowerCase().replace(/['",.!?;:()[\]{}<>]/g, "");
}

function extractEmojis(text: string): number {
  let score = 0;
  for (const [emoji, val] of Object.entries(EMOJI_SCORES)) {
    const count = (text.match(new RegExp(emoji, "g")) ?? []).length;
    score += count * val;
  }
  return score;
}

export function analyzeSentiment(text: string): SentimentResult {
  const rawTokens = tokenizeWords(text);
  const scoredTokens: Array<{ word: string; score: number }> = [];

  let totalScore = 0;
  let negationActive = false;
  let intensifierMult = 1.0;

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i]!;
    const token = cleanToken(raw);

    // Handle negators
    if (NEGATORS.has(token)) {
      negationActive = true;
      intensifierMult = 1.0;
      continue;
    }

    // Handle intensifiers
    if (INTENSIFIERS.has(token)) {
      intensifierMult = 1.8;
      continue;
    }

    // Handle diminishers
    if (DIMINISHERS.has(token)) {
      intensifierMult = 0.5;
      continue;
    }

    const baseScore = SENTIMENT_SCORES[token];
    if (baseScore !== undefined && baseScore !== 0) {
      let score = baseScore * intensifierMult;
      if (negationActive) score = -score;
      scoredTokens.push({ word: token, score });
      totalScore += score;
      // Reset modifiers after applying
      negationActive = false;
      intensifierMult = 1.0;
    } else {
      // Non-sentiment word resets negation after a window
      if (negationActive) {
        negationActive = false;
        intensifierMult = 1.0;
      }
    }
  }

  // Add emoji scores
  const emojiScore = extractEmojis(text);
  if (emojiScore !== 0) {
    totalScore += emojiScore;
    scoredTokens.push({ word: "<emoji>", score: emojiScore });
  }

  const wordCount = rawTokens.filter((t) => /[a-zA-Z]/.test(t)).length || 1;
  const comparative = totalScore / wordCount;

  let label: SentimentLabel = "neutral";
  if (totalScore > 0) label = "positive";
  else if (totalScore < 0) label = "negative";

  return { label, score: totalScore, comparative, tokens: scoredTokens };
}

/**
 * Analyze sentiment per sentence and return aggregated result.
 */
export function analyzeDocumentSentiment(text: string): {
  overall: SentimentResult;
  sentences: Array<{ sentence: string; result: SentimentResult }>;
} {
  // Simple sentence split for sentiment
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentenceResults = sentences.map((sentence) => ({
    sentence,
    result: analyzeSentiment(sentence),
  }));

  // Aggregate
  const overall = analyzeSentiment(text);

  return { overall, sentences: sentenceResults };
}

export class SentimentAnalyzer {
  private readonly customScores: Map<string, number>;

  constructor(customScores: Record<string, number> = {}) {
    this.customScores = new Map(Object.entries(customScores));
  }

  /** Add or override a word score. */
  setScore(word: string, score: number): void {
    this.customScores.set(word.toLowerCase(), score);
  }

  analyze(text: string): SentimentResult {
    // Temporarily merge custom scores into the lookup
    const origEntries: Array<[string, number | undefined]> = [];
    for (const [word, score] of this.customScores) {
      origEntries.push([word, SENTIMENT_SCORES[word]]);
      SENTIMENT_SCORES[word] = score;
    }
    const result = analyzeSentiment(text);
    // Restore
    for (const [word, orig] of origEntries) {
      if (orig === undefined) {
        delete SENTIMENT_SCORES[word];
      } else {
        SENTIMENT_SCORES[word] = orig;
      }
    }
    return result;
  }

  analyzeDocument(text: string) {
    return analyzeDocumentSentiment(text);
  }
}
