import { describe, it, expect } from "vitest";
import {
  Tokenizer,
  porterStem,
  segmentSentences,
  tokenizeWords,
  generateNgrams,
  generateCharNgrams,
  normalizeTokens,
  ENGLISH_STOP_WORDS,
} from "../tokenizer.js";

// ---------------------------------------------------------------------------
// Porter stemmer
// ---------------------------------------------------------------------------

describe("porterStem", () => {
  it("stems common English words", () => {
    expect(porterStem("running")).toBe("run");
    expect(porterStem("flies")).toBe("fli");
    expect(porterStem("connection")).toBe("connect");
    expect(porterStem("electrical")).toBe("electr");
  });

  it("returns short words unchanged", () => {
    expect(porterStem("a")).toBe("a");
    expect(porterStem("be")).toBe("be");
  });

  it("lowercases input", () => {
    expect(porterStem("RUNNING")).toBe("run");
  });

  it("handles words ending in 'ed'", () => {
    expect(porterStem("agreed")).toBe("agre");
    expect(porterStem("disabled")).toBe("disabl");
  });

  it("handles words ending in 'ing'", () => {
    expect(porterStem("computing")).toBe("comput");
    expect(porterStem("hopping")).toBe("hop");
  });
});

// ---------------------------------------------------------------------------
// Sentence segmentation
// ---------------------------------------------------------------------------

describe("segmentSentences", () => {
  it("splits on period followed by capital", () => {
    const text = "Hello world. This is a test. Another sentence.";
    const sentences = segmentSentences(text);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences[0]).toContain("Hello");
  });

  it("splits on question marks", () => {
    const text = "How are you? I am fine. Great!";
    const sentences = segmentSentences(text);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
  });

  it("does not split on decimal numbers", () => {
    const text = "The price is 3.14 dollars. That is cheap.";
    const sentences = segmentSentences(text);
    // Should not split at "3.14"
    expect(sentences.some((s) => s.includes("3.14"))).toBe(true);
  });

  it("handles single sentence", () => {
    const text = "Just one sentence here";
    const sentences = segmentSentences(text);
    expect(sentences.length).toBe(1);
    expect(sentences[0]).toBe(text);
  });

  it("handles empty string", () => {
    expect(segmentSentences("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Word tokenizer
// ---------------------------------------------------------------------------

describe("tokenizeWords", () => {
  it("tokenizes a simple sentence", () => {
    const tokens = tokenizeWords("Hello, world!");
    expect(tokens).toContain("Hello");
    expect(tokens).toContain("world");
  });

  it("separates punctuation", () => {
    const tokens = tokenizeWords("end.");
    expect(tokens).toContain("end");
  });

  it("keeps contractions together", () => {
    const tokens = tokenizeWords("it's a test");
    expect(tokens.some((t) => t.includes("'"))).toBe(true);
  });

  it("handles multiple spaces", () => {
    const tokens = tokenizeWords("hello   world");
    expect(tokens.filter((t) => /[a-z]/i.test(t)).length).toBe(2);
  });

  it("handles empty string", () => {
    expect(tokenizeWords("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// N-gram generation
// ---------------------------------------------------------------------------

describe("generateNgrams", () => {
  it("generates unigrams", () => {
    const tokens = ["a", "b", "c"];
    expect(generateNgrams(tokens, 1)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("generates bigrams", () => {
    const tokens = ["a", "b", "c"];
    const bigrams = generateNgrams(tokens, 2);
    expect(bigrams).toEqual([["a", "b"], ["b", "c"]]);
  });

  it("generates trigrams", () => {
    const tokens = ["a", "b", "c", "d"];
    const trigrams = generateNgrams(tokens, 3);
    expect(trigrams).toEqual([["a", "b", "c"], ["b", "c", "d"]]);
  });

  it("returns empty for insufficient tokens", () => {
    expect(generateNgrams(["a"], 3)).toEqual([]);
  });
});

describe("generateCharNgrams", () => {
  it("generates character trigrams", () => {
    const ngrams = generateCharNgrams("hello", 3);
    expect(ngrams).toContain("hel");
    expect(ngrams).toContain("ell");
    expect(ngrams).toContain("llo");
  });

  it("returns empty for short string", () => {
    expect(generateCharNgrams("ab", 3)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeTokens", () => {
  it("lowercases tokens", () => {
    const result = normalizeTokens(["Hello", "World"], { stem: false, removeStopWords: false });
    expect(result).toEqual(["hello", "world"]);
  });

  it("removes stop words", () => {
    const tokens = ["the", "quick", "brown", "fox"];
    const result = normalizeTokens(tokens, { stem: false });
    expect(result).not.toContain("the");
    expect(result).toContain("quick");
  });

  it("applies stemming", () => {
    const result = normalizeTokens(["running", "computers"], { removeStopWords: false });
    expect(result).toContain("run");
  });

  it("filters by minimum length", () => {
    const result = normalizeTokens(["a", "bb", "ccc"], {
      stem: false,
      removeStopWords: false,
      minLength: 3,
    });
    expect(result).not.toContain("a");
    expect(result).not.toContain("bb");
    expect(result).toContain("ccc");
  });
});

// ---------------------------------------------------------------------------
// Tokenizer class
// ---------------------------------------------------------------------------

describe("Tokenizer", () => {
  const tokenizer = new Tokenizer();

  it("returns all expected fields", () => {
    const result = tokenizer.tokenize("The quick brown fox jumps over the lazy dog.");
    expect(result).toHaveProperty("tokens");
    expect(result).toHaveProperty("normalizedTokens");
    expect(result).toHaveProperty("sentences");
    expect(result).toHaveProperty("unigrams");
    expect(result).toHaveProperty("bigrams");
    expect(result).toHaveProperty("trigrams");
  });

  it("produces non-empty tokens for non-empty input", () => {
    const result = tokenizer.tokenize("Natural language processing is fascinating.");
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.normalizedTokens.length).toBeGreaterThan(0);
  });

  it("bigrams are pairs", () => {
    const result = tokenizer.tokenize("one two three");
    for (const bigram of result.bigrams) {
      expect(bigram.length).toBe(2);
    }
  });

  it("trigrams are triples", () => {
    const result = tokenizer.tokenize("one two three four");
    for (const trigram of result.trigrams) {
      expect(trigram.length).toBe(3);
    }
  });

  it("charNgrams returns character-level grams", () => {
    const ngrams = tokenizer.charNgrams("hello");
    expect(ngrams.length).toBeGreaterThan(0);
    expect(ngrams[0]!.length).toBe(3); // default size
  });

  it("stopWords getter returns the set", () => {
    expect(ENGLISH_STOP_WORDS.has("the")).toBe(true);
  });

  it("handles empty string gracefully", () => {
    const result = tokenizer.tokenize("");
    expect(result.tokens).toEqual([]);
    expect(result.normalizedTokens).toEqual([]);
  });

  it("extra stop words are filtered", () => {
    const t = new Tokenizer({ extraStopWords: new Set(["fox"]), stem: false });
    const result = t.tokenize("the quick brown fox");
    expect(result.normalizedTokens).not.toContain("fox");
  });
});
