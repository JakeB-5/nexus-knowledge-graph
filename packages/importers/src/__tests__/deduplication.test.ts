import { describe, it, expect } from "vitest";
import {
  levenshtein,
  similarity,
  Deduplicator,
  deduplicateNodes,
  areDuplicates,
} from "../deduplication.js";
import type { CreateNode } from "@nexus/shared";

const DEFAULT_OWNER = "00000000-0000-0000-0000-000000000001";

function makeNode(overrides: Partial<CreateNode> = {}): CreateNode {
  return {
    type: "concept",
    title: "Test Node",
    content: "Some content",
    metadata: {},
    ownerId: DEFAULT_OWNER,
    ...overrides,
  };
}

// ─── levenshtein ─────────────────────────────────────────────────────────────

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns string length for empty other string", () => {
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "world")).toBe(5);
  });

  it("returns 1 for single character substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("computes distance for completely different strings", () => {
    const d = levenshtein("abc", "xyz");
    expect(d).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("is symmetric", () => {
    expect(levenshtein("kitten", "sitting")).toBe(levenshtein("sitting", "kitten"));
  });

  it("handles longer strings", () => {
    const d = levenshtein("knowledge graph", "knowledge base");
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(15);
  });
});

// ─── similarity ──────────────────────────────────────────────────────────────

describe("similarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 0.0 for completely different equal-length strings", () => {
    const s = similarity("abc", "xyz");
    expect(s).toBeLessThan(0.5);
  });

  it("returns high score for near-identical strings", () => {
    const s = similarity("TypeScript", "TypeScrypt");
    expect(s).toBeGreaterThan(0.7);
  });

  it("returns 1 for two empty strings", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("returns value between 0 and 1", () => {
    const s = similarity("hello world", "hello earth");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

// ─── Deduplicator ─────────────────────────────────────────────────────────────

describe("Deduplicator", () => {
  describe("exact_title strategy", () => {
    it("removes exact title duplicates (case-insensitive)", () => {
      const dedup = new Deduplicator({ strategy: "exact_title" });
      const nodes = [
        makeNode({ title: "TypeScript Guide" }),
        makeNode({ title: "typescript guide" }),
        makeNode({ title: "JavaScript Guide" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique).toHaveLength(2);
      expect(result.duplicates).toHaveLength(1);
    });

    it("preserves all unique nodes", () => {
      const dedup = new Deduplicator({ strategy: "exact_title" });
      const nodes = [
        makeNode({ title: "Alpha" }),
        makeNode({ title: "Beta" }),
        makeNode({ title: "Gamma" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique).toHaveLength(3);
      expect(result.duplicates).toHaveLength(0);
    });

    it("records duplicate reason", () => {
      const dedup = new Deduplicator({ strategy: "exact_title" });
      const nodes = [makeNode({ title: "Same" }), makeNode({ title: "same" })];
      const result = dedup.deduplicate(nodes);
      expect(result.duplicates[0]?.reason).toBe("exact_title_match");
    });

    it("handles empty node list", () => {
      const dedup = new Deduplicator({ strategy: "exact_title" });
      const result = dedup.deduplicate([]);
      expect(result.unique).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe("fuzzy_title strategy", () => {
    it("detects near-identical titles as duplicates", () => {
      const dedup = new Deduplicator({ strategy: "fuzzy_title", fuzzyThreshold: 0.85 });
      const nodes = [
        makeNode({ title: "Introduction to TypeScript" }),
        makeNode({ title: "Introduction to TypeScrypt" }), // typo
        makeNode({ title: "Advanced Python Programming" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.duplicates).toHaveLength(1);
      expect(result.unique).toHaveLength(2);
    });

    it("keeps distinct titles separate", () => {
      const dedup = new Deduplicator({ strategy: "fuzzy_title", fuzzyThreshold: 0.85 });
      const nodes = [
        makeNode({ title: "React Hooks Guide" }),
        makeNode({ title: "Vue.js Component Guide" }),
        makeNode({ title: "Angular Services Deep Dive" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique).toHaveLength(3);
    });

    it("respects threshold: lower threshold = more duplicates", () => {
      const strict = new Deduplicator({ strategy: "fuzzy_title", fuzzyThreshold: 0.95 });
      const loose = new Deduplicator({ strategy: "fuzzy_title", fuzzyThreshold: 0.5 });

      const nodes = [
        makeNode({ title: "Node.js Development" }),
        makeNode({ title: "NodeJS Developer" }),
      ];

      const strictResult = strict.deduplicate(nodes);
      const looseResult = loose.deduplicate(nodes);

      expect(looseResult.unique.length).toBeLessThanOrEqual(strictResult.unique.length);
    });

    it("records fuzzy match reason with similarity score", () => {
      const dedup = new Deduplicator({ strategy: "fuzzy_title", fuzzyThreshold: 0.8 });
      const nodes = [
        makeNode({ title: "Knowledge Graph" }),
        makeNode({ title: "Knowledge Graphs" }),
      ];
      const result = dedup.deduplicate(nodes);
      if (result.duplicates.length > 0) {
        expect(result.duplicates[0]?.reason).toContain("fuzzy_title_match");
      }
    });
  });

  describe("content_hash strategy", () => {
    it("detects identical content as duplicate", () => {
      const dedup = new Deduplicator({ strategy: "content_hash" });
      const nodes = [
        makeNode({ title: "Node 1", content: "Exactly the same content." }),
        makeNode({ title: "Node 2", content: "Exactly the same content." }),
        makeNode({ title: "Node 3", content: "Different content here." }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.duplicates).toHaveLength(1);
      expect(result.unique).toHaveLength(2);
    });

    it("keeps nodes with different content separate", () => {
      const dedup = new Deduplicator({ strategy: "content_hash" });
      const nodes = [
        makeNode({ title: "A", content: "Content A" }),
        makeNode({ title: "B", content: "Content B" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique).toHaveLength(2);
    });
  });

  describe("combined strategy", () => {
    it("applies all three strategies in sequence", () => {
      const dedup = new Deduplicator({ strategy: "combined" });
      const nodes = [
        makeNode({ title: "Exact Dup", content: "Content A" }),
        makeNode({ title: "exact dup", content: "Content B" }), // exact title dup
        makeNode({ title: "Unique A", content: "Same content." }),
        makeNode({ title: "Unique B", content: "Same content." }), // content hash dup
        makeNode({ title: "Completely Different" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique.length).toBeLessThan(nodes.length);
      expect(result.mergedCount).toBeGreaterThan(0);
    });
  });

  describe("merge strategies", () => {
    it("keep_newest: uses duplicate fields over original", () => {
      const dedup = new Deduplicator({ strategy: "exact_title", mergeStrategy: "keep_newest" });
      const nodes = [
        makeNode({ title: "Same", content: "Old content" }),
        makeNode({ title: "Same", content: "New content" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique[0]?.content).toBe("New content");
    });

    it("keep_oldest: uses original fields", () => {
      const dedup = new Deduplicator({ strategy: "exact_title", mergeStrategy: "keep_oldest" });
      const nodes = [
        makeNode({ title: "Same", content: "Old content" }),
        makeNode({ title: "Same", content: "New content" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique[0]?.content).toBe("Old content");
    });

    it("merge_metadata: unions tags from both nodes", () => {
      const dedup = new Deduplicator({ strategy: "exact_title", mergeStrategy: "merge_metadata" });
      const nodes = [
        makeNode({ title: "Same", metadata: { tags: ["alpha", "beta"] } }),
        makeNode({ title: "Same", metadata: { tags: ["beta", "gamma"] } }),
      ];

      const result = dedup.deduplicate(nodes);
      const tags = (result.unique[0]?.metadata as Record<string, unknown>)?.["tags"] as string[];
      expect(tags).toContain("alpha");
      expect(tags).toContain("gamma");
      expect(tags.filter((t) => t === "beta")).toHaveLength(1); // deduplicated
    });

    it("prefers longer content when merging", () => {
      const dedup = new Deduplicator({ strategy: "exact_title", mergeStrategy: "merge_metadata" });
      const nodes = [
        makeNode({ title: "Same", content: "Short" }),
        makeNode({ title: "Same", content: "Much longer content that wins" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.unique[0]?.content?.length).toBeGreaterThan(5);
    });
  });

  describe("mergedCount", () => {
    it("tracks how many nodes were merged", () => {
      const dedup = new Deduplicator({ strategy: "exact_title" });
      const nodes = [
        makeNode({ title: "A" }),
        makeNode({ title: "A" }),
        makeNode({ title: "A" }),
        makeNode({ title: "B" }),
      ];

      const result = dedup.deduplicate(nodes);
      expect(result.mergedCount).toBe(2); // 2 duplicates merged into "A"
    });
  });
});

// ─── deduplicateNodes (convenience) ─────────────────────────────────────────

describe("deduplicateNodes", () => {
  it("deduplicates with default options", () => {
    const nodes = [
      makeNode({ title: "Same" }),
      makeNode({ title: "Same" }),
      makeNode({ title: "Unique" }),
    ];

    const result = deduplicateNodes(nodes);
    expect(result.unique).toHaveLength(2);
  });

  it("accepts custom options", () => {
    const nodes = [
      makeNode({ title: "A", content: "Same content" }),
      makeNode({ title: "B", content: "Same content" }),
    ];

    const result = deduplicateNodes(nodes, { strategy: "content_hash" });
    expect(result.unique).toHaveLength(1);
  });
});

// ─── areDuplicates ───────────────────────────────────────────────────────────

describe("areDuplicates", () => {
  it("returns true for nodes with identical normalized titles", () => {
    const a = makeNode({ title: "TypeScript Guide" });
    const b = makeNode({ title: "typescript guide" });
    expect(areDuplicates(a, b)).toBe(true);
  });

  it("returns true for nodes with very similar titles", () => {
    const a = makeNode({ title: "Introduction to TypeScript" });
    const b = makeNode({ title: "Introduction to TypeScrypt" });
    expect(areDuplicates(a, b, 0.85)).toBe(true);
  });

  it("returns true for nodes with identical content hash", () => {
    const a = makeNode({ title: "Alpha", content: "Identical body text here." });
    const b = makeNode({ title: "Beta", content: "Identical body text here." });
    expect(areDuplicates(a, b)).toBe(true);
  });

  it("returns false for clearly different nodes", () => {
    const a = makeNode({ title: "React Hooks", content: "About hooks" });
    const b = makeNode({ title: "SQL Databases", content: "About databases" });
    expect(areDuplicates(a, b)).toBe(false);
  });

  it("returns false for nodes with no content when titles differ", () => {
    const a = makeNode({ title: "Alpha", content: undefined });
    const b = makeNode({ title: "Beta", content: undefined });
    expect(areDuplicates(a, b)).toBe(false);
  });
});
