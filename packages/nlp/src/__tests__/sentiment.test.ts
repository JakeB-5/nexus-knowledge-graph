import { describe, it, expect } from "vitest";
import {
  analyzeSentiment,
  analyzeDocumentSentiment,
  SentimentAnalyzer,
} from "../sentiment.js";

// ---------------------------------------------------------------------------
// analyzeSentiment
// ---------------------------------------------------------------------------

describe("analyzeSentiment", () => {
  it("returns all required fields", () => {
    const result = analyzeSentiment("I love this product");
    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("comparative");
    expect(result).toHaveProperty("tokens");
  });

  it("positive text gets positive label and score", () => {
    const result = analyzeSentiment("This is excellent and wonderful and fantastic");
    expect(result.label).toBe("positive");
    expect(result.score).toBeGreaterThan(0);
  });

  it("negative text gets negative label and score", () => {
    const result = analyzeSentiment("This is terrible and awful and horrible");
    expect(result.label).toBe("negative");
    expect(result.score).toBeLessThan(0);
  });

  it("neutral text gets neutral label", () => {
    const result = analyzeSentiment("the cat sat on the mat");
    expect(result.label).toBe("neutral");
    expect(result.score).toBe(0);
  });

  it("negation inverts sentiment", () => {
    const positive = analyzeSentiment("This is good");
    const negated = analyzeSentiment("This is not good");
    expect(positive.score).toBeGreaterThan(0);
    expect(negated.score).toBeLessThan(0);
  });

  it("intensifiers amplify score", () => {
    const normal = analyzeSentiment("This is good");
    const intensified = analyzeSentiment("This is very good");
    expect(intensified.score).toBeGreaterThan(normal.score);
  });

  it("diminishers reduce absolute score", () => {
    const normal = analyzeSentiment("This is good");
    const diminished = analyzeSentiment("This is slightly good");
    expect(Math.abs(diminished.score)).toBeLessThan(Math.abs(normal.score));
  });

  it("comparative score is score divided by word count", () => {
    const result = analyzeSentiment("good");
    expect(result.comparative).toBeCloseTo(result.score / 1, 3);
  });

  it("tokens array includes scored words", () => {
    const result = analyzeSentiment("I love this amazing product");
    expect(result.tokens.length).toBeGreaterThan(0);
    const words = result.tokens.map((t) => t.word);
    expect(words.some((w) => ["love", "amazing"].includes(w))).toBe(true);
  });

  it("emoji sentiment is detected", () => {
    const result = analyzeSentiment("Great product 😀😀😀");
    expect(result.score).toBeGreaterThan(0);
  });

  it("negative emojis reduce score", () => {
    const withEmoji = analyzeSentiment("😭😭");
    expect(withEmoji.score).toBeLessThan(0);
  });

  it("handles empty string", () => {
    const result = analyzeSentiment("");
    expect(result.score).toBe(0);
    expect(result.label).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// analyzeDocumentSentiment
// ---------------------------------------------------------------------------

describe("analyzeDocumentSentiment", () => {
  it("returns overall and sentences", () => {
    const result = analyzeDocumentSentiment(
      "I love this. It is terrible.",
    );
    expect(result).toHaveProperty("overall");
    expect(result).toHaveProperty("sentences");
  });

  it("individual sentences have their own sentiment", () => {
    const result = analyzeDocumentSentiment(
      "This is excellent. This is horrible.",
    );
    const positiveCount = result.sentences.filter((s) => s.result.label === "positive").length;
    const negativeCount = result.sentences.filter((s) => s.result.label === "negative").length;
    expect(positiveCount).toBeGreaterThan(0);
    expect(negativeCount).toBeGreaterThan(0);
  });

  it("each sentence entry has sentence text and result", () => {
    const result = analyzeDocumentSentiment("I love it.");
    expect(result.sentences[0]).toHaveProperty("sentence");
    expect(result.sentences[0]).toHaveProperty("result");
  });
});

// ---------------------------------------------------------------------------
// SentimentAnalyzer class
// ---------------------------------------------------------------------------

describe("SentimentAnalyzer", () => {
  it("accepts custom word scores", () => {
    const analyzer = new SentimentAnalyzer({ nexus: 5 });
    const result = analyzer.analyze("Nexus is nexus");
    expect(result.score).toBeGreaterThan(0);
  });

  it("setScore updates scores dynamically", () => {
    const analyzer = new SentimentAnalyzer();
    analyzer.setScore("epic", 4);
    const result = analyzer.analyze("This is epic");
    expect(result.score).toBeGreaterThan(0);
  });

  it("analyzeDocument delegates correctly", () => {
    const analyzer = new SentimentAnalyzer();
    const result = analyzer.analyzeDocument("I love it. I hate it.");
    expect(result.sentences.length).toBeGreaterThan(0);
  });

  it("custom scores do not leak between instances", () => {
    const a = new SentimentAnalyzer({ specialword: 5 });
    const b = new SentimentAnalyzer();
    const resA = a.analyze("specialword");
    const resB = b.analyze("specialword");
    // b should not be affected by a's custom scores
    expect(resA.score).toBeGreaterThan(0);
    expect(resB.score).toBe(0); // not in default dictionary
  });
});
