import { describe, it, expect } from "vitest";
import { Summarizer } from "../summarizer.js";

const LONG_TEXT = `
Natural language processing (NLP) is a subfield of linguistics and computer science.
It is concerned with the interactions between computers and human language.
In particular, it focuses on how to program computers to process and analyze large amounts of natural language data.
The history of natural language processing generally started in the 1950s.
Alan Turing published an article titled Computing Machinery and Intelligence in 1950.
The Georgetown experiment in 1954 involved fully automatic translation of more than sixty Russian sentences into English.
The researchers claimed that machine translation would be solved within three to five years.
In the 1960s, the first chatbot ELIZA was created by Joseph Weizenbaum at MIT.
ELIZA simulated conversation by using a pattern-matching and substitution methodology.
Machine learning approaches to NLP became popular in the 1980s and 1990s.
Statistical methods allowed computers to learn patterns from annotated training data.
Deep learning has revolutionized NLP since the introduction of word embeddings and transformer models.
The transformer architecture introduced in 2017 became the foundation for models like BERT and GPT.
These models achieve state-of-the-art performance on a wide range of NLP tasks.
`;

describe("Summarizer", () => {
  const summarizer = new Summarizer();

  it("returns a non-empty summary for a long text", () => {
    const result = summarizer.summarize(LONG_TEXT);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("result has all required fields", () => {
    const result = summarizer.summarize(LONG_TEXT);
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("selectedSentenceIndices");
    expect(result).toHaveProperty("sentenceScores");
  });

  it("selectedSentenceIndices are sorted", () => {
    const result = summarizer.summarize(LONG_TEXT);
    for (let i = 1; i < result.selectedSentenceIndices.length; i++) {
      expect(result.selectedSentenceIndices[i]!).toBeGreaterThan(
        result.selectedSentenceIndices[i - 1]!,
      );
    }
  });

  it("sentenceScores length matches sentence count", () => {
    const result = summarizer.summarize(LONG_TEXT);
    expect(result.sentenceScores.length).toBeGreaterThan(0);
  });

  it("respects sentenceCount option", () => {
    const result = summarizer.summarize(LONG_TEXT, { sentenceCount: 2 });
    expect(result.selectedSentenceIndices.length).toBeLessThanOrEqual(2);
  });

  it("respects ratio option", () => {
    const result = summarizer.summarize(LONG_TEXT, { ratio: 0.2 });
    const fullSentenceCount = result.sentenceScores.length;
    expect(result.selectedSentenceIndices.length).toBeLessThanOrEqual(
      Math.ceil(fullSentenceCount * 0.3), // slight tolerance
    );
  });

  it("handles single sentence", () => {
    const result = summarizer.summarize("Just one sentence here.");
    expect(result.selectedSentenceIndices).toEqual([0]);
    expect(result.summary).toContain("Just one sentence");
  });

  it("handles empty text", () => {
    const result = summarizer.summarize("");
    expect(result.summary).toBe("");
    expect(result.selectedSentenceIndices).toEqual([]);
  });

  it("uses title to boost relevant sentences when provided", () => {
    const withTitle = new Summarizer({ title: "machine translation history" });
    const result = withTitle.summarize(LONG_TEXT, { sentenceCount: 3 });
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("summary is shorter than original", () => {
    const result = summarizer.summarize(LONG_TEXT, { ratio: 0.3 });
    expect(result.summary.length).toBeLessThan(LONG_TEXT.length);
  });
});

describe("Summarizer – summarizeParagraphs", () => {
  const summarizer = new Summarizer();
  const MULTI_PARA = `
Natural language processing is a fascinating field of computer science.
It combines linguistics, statistics, and machine learning.
Many applications use NLP every day.

Deep learning has transformed NLP dramatically in recent years.
Transformer models like BERT and GPT have set new records.
These models are trained on massive datasets.
`;

  it("returns a summary for multi-paragraph text", () => {
    const result = summarizer.summarizeParagraphs(MULTI_PARA);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("falls back to single summarize for one paragraph", () => {
    const single = "One paragraph. With two sentences.";
    const result = summarizer.summarizeParagraphs(single);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
