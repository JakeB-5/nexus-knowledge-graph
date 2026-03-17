import { describe, it, expect } from "vitest";
import {
  KeywordExtractor,
  RakeExtractor,
  TextRankKeywordExtractor,
} from "../keyword-extractor.js";

const SAMPLE_TEXT = `
Natural language processing is a subfield of linguistics, computer science, and artificial intelligence.
It is concerned with the interactions between computers and human language, in particular how to program computers
to process and analyze large amounts of natural language data.
The goal is to enable computers to understand documents, including the contextual nuances of the language within them.
Machine learning has become central to natural language processing.
`;

// ---------------------------------------------------------------------------
// RAKE
// ---------------------------------------------------------------------------

describe("RakeExtractor", () => {
  const rake = new RakeExtractor({ maxKeywords: 10 });

  it("returns an array of keywords", () => {
    const keywords = rake.extract(SAMPLE_TEXT);
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("returns at most maxKeywords results", () => {
    const keywords = rake.extract(SAMPLE_TEXT);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it("keywords are sorted by score descending", () => {
    const keywords = rake.extract(SAMPLE_TEXT);
    for (let i = 1; i < keywords.length; i++) {
      expect(keywords[i - 1]!.score).toBeGreaterThanOrEqual(keywords[i]!.score);
    }
  });

  it("scores are positive numbers", () => {
    const keywords = rake.extract(SAMPLE_TEXT);
    for (const kw of keywords) {
      expect(kw.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("extracts relevant keywords from NLP text", () => {
    const keywords = rake.extract(SAMPLE_TEXT);
    const words = keywords.map((k) => k.word.toLowerCase());
    // At least one NLP-related phrase should appear
    const nlpRelated = words.some(
      (w) =>
        w.includes("language") ||
        w.includes("processing") ||
        w.includes("computer") ||
        w.includes("machine"),
    );
    expect(nlpRelated).toBe(true);
  });

  it("handles empty text gracefully", () => {
    const keywords = rake.extract("");
    expect(keywords).toEqual([]);
  });

  it("respects minFrequency option", () => {
    const rareRake = new RakeExtractor({ minFrequency: 100 });
    const keywords = rareRake.extract(SAMPLE_TEXT);
    // Very high min frequency – expect empty or very few results
    expect(keywords.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TextRank
// ---------------------------------------------------------------------------

describe("TextRankKeywordExtractor", () => {
  const textrank = new TextRankKeywordExtractor({ maxKeywords: 10 });

  it("returns keywords", () => {
    const keywords = textrank.extract(SAMPLE_TEXT);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("returns at most maxKeywords", () => {
    const keywords = textrank.extract(SAMPLE_TEXT);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it("keywords have positive scores", () => {
    const keywords = textrank.extract(SAMPLE_TEXT);
    for (const kw of keywords) {
      expect(kw.score).toBeGreaterThan(0);
    }
  });

  it("handles empty text", () => {
    expect(textrank.extract("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KeywordExtractor facade
// ---------------------------------------------------------------------------

describe("KeywordExtractor", () => {
  const extractor = new KeywordExtractor({ maxKeywords: 8 });

  it("defaults to rake algorithm", () => {
    const rake = extractor.extract(SAMPLE_TEXT, "rake");
    const def = extractor.extract(SAMPLE_TEXT);
    expect(rake.length).toBe(def.length);
  });

  it("can switch to textrank", () => {
    const keywords = extractor.extract(SAMPLE_TEXT, "textrank");
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("extractCombined merges both algorithms", () => {
    const combined = extractor.extractCombined(SAMPLE_TEXT);
    expect(combined.length).toBeGreaterThan(0);
    // Combined scores should be in [0, 1] (normalised)
    for (const kw of combined) {
      expect(kw.score).toBeGreaterThanOrEqual(0);
      expect(kw.score).toBeLessThanOrEqual(1);
    }
  });

  it("combined results are sorted descending", () => {
    const combined = extractor.extractCombined(SAMPLE_TEXT);
    for (let i = 1; i < combined.length; i++) {
      expect(combined[i - 1]!.score).toBeGreaterThanOrEqual(combined[i]!.score);
    }
  });
});
