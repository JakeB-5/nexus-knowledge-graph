import { describe, it, expect, beforeEach } from "vitest";
import { FullTextSearchEngine } from "../full-text.js";
import { VectorSearchEngine, cosineSimilarity } from "../vector.js";
import { tokenize, normalize } from "../tokenizer.js";

describe("Tokenizer", () => {
  it("should normalize text", () => {
    expect(normalize("Hello, World! 123")).toBe("hello world 123");
  });

  it("should tokenize and remove stop words", () => {
    const tokens = tokenize("The quick brown fox is a fast animal");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("should keep stop words when requested", () => {
    const tokens = tokenize("the cat is here", false);
    expect(tokens).toContain("the");
    expect(tokens).toContain("is");
  });
});

describe("FullTextSearchEngine", () => {
  let engine: FullTextSearchEngine;

  beforeEach(() => {
    engine = new FullTextSearchEngine();
    engine.add({
      id: "1",
      title: "Introduction to Graph Theory",
      content: "Graph theory is the study of graphs and mathematical structures.",
      type: "document",
    });
    engine.add({
      id: "2",
      title: "Machine Learning Basics",
      content: "Machine learning is a subset of artificial intelligence focused on data.",
      type: "document",
    });
    engine.add({
      id: "3",
      title: "Graph Algorithms",
      content: "Algorithms for traversing and searching graphs efficiently.",
      type: "concept",
    });
  });

  it("should find relevant documents", () => {
    const results = engine.search("graph");
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.id)).toContain("1");
    expect(results.map((r) => r.id)).toContain("3");
  });

  it("should rank title matches higher", () => {
    const results = engine.search("graph");
    // Both docs 1 and 3 have "graph" in title, so they should score high
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("should filter by type", () => {
    const results = engine.search("graph", { types: ["concept"] });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("3");
  });

  it("should remove documents", () => {
    engine.remove("1");
    expect(engine.size).toBe(2);
    const results = engine.search("graph theory");
    expect(results.map((r) => r.id)).not.toContain("1");
  });

  it("should handle empty queries", () => {
    const results = engine.search("");
    expect(results).toHaveLength(0);
  });
});

describe("VectorSearch", () => {
  it("should compute cosine similarity correctly", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it("should return 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("should return 0 for mismatched dimensions", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("should search by vector", () => {
    const engine = new VectorSearchEngine();
    engine.add({ id: "1", title: "A", content: "a", type: "doc", embedding: [1, 0, 0] });
    engine.add({ id: "2", title: "B", content: "b", type: "doc", embedding: [0, 1, 0] });
    engine.add({ id: "3", title: "C", content: "c", type: "doc", embedding: [0.9, 0.1, 0] });

    const results = engine.searchByVector([1, 0, 0]);
    expect(results[0]!.id).toBe("1");
    expect(results[1]!.id).toBe("3");
  });
});
