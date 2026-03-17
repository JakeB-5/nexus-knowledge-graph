import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  cosineTextSimilarity,
  jaccardSimilarity,
  jaccardTextSimilarity,
  diceCoefficient,
  diceTextSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
  longestCommonSubsequence,
  lcsSimilarity,
  ngramSimilarity,
  documentSimilarity,
  pairwiseSimilarityMatrix,
} from "../similarity.js";

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("identical non-zero vectors → 1", () => {
    const v = new Map([["a", 1], ["b", 2]]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("orthogonal vectors → 0", () => {
    const a = new Map([["x", 1]]);
    const b = new Map([["y", 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("zero vector → 0", () => {
    const a = new Map<string, number>();
    const b = new Map([["x", 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("partial overlap gives value between 0 and 1", () => {
    const a = new Map([["x", 1], ["y", 1]]);
    const b = new Map([["x", 1], ["z", 1]]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("cosineTextSimilarity", () => {
  it("identical texts → score close to 1", () => {
    const result = cosineTextSimilarity("hello world", "hello world");
    expect(result.score).toBeCloseTo(1, 5);
    expect(result.method).toBe("cosine");
  });

  it("completely different texts → low score", () => {
    const result = cosineTextSimilarity("apple orange banana", "dog cat fish");
    expect(result.score).toBeLessThan(0.3);
  });

  it("similar texts → higher score than dissimilar", () => {
    const simSame = cosineTextSimilarity(
      "machine learning is great",
      "machine learning algorithms",
    ).score;
    const simDiff = cosineTextSimilarity(
      "machine learning is great",
      "cooking pasta for dinner",
    ).score;
    expect(simSame).toBeGreaterThan(simDiff);
  });
});

// ---------------------------------------------------------------------------
// Jaccard
// ---------------------------------------------------------------------------

describe("jaccardSimilarity", () => {
  it("identical sets → 1", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(s, s)).toBe(1);
  });

  it("disjoint sets → 0", () => {
    const a = new Set(["a"]);
    const b = new Set(["b"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("partial overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // intersection = {b,c}, union = {a,b,c,d} → 2/4 = 0.5
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  it("empty sets → 1", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });
});

describe("jaccardTextSimilarity", () => {
  it("method is jaccard", () => {
    expect(jaccardTextSimilarity("a", "a").method).toBe("jaccard");
  });

  it("same text → 1", () => {
    expect(jaccardTextSimilarity("hello world", "hello world").score).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Dice coefficient
// ---------------------------------------------------------------------------

describe("diceCoefficient", () => {
  it("identical sets → 1", () => {
    const s = new Set(["a", "b"]);
    expect(diceCoefficient(s, s)).toBeCloseTo(1, 5);
  });

  it("disjoint sets → 0", () => {
    const a = new Set(["a"]);
    const b = new Set(["b"]);
    expect(diceCoefficient(a, b)).toBe(0);
  });

  it("partial overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    // 2*2 / (3+3) = 4/6 ≈ 0.667
    expect(diceCoefficient(a, b)).toBeCloseTo(2 / 3, 3);
  });
});

describe("diceTextSimilarity", () => {
  it("method is dice", () => {
    expect(diceTextSimilarity("hello", "hello").method).toBe("dice");
  });

  it("identical texts → score close to 1", () => {
    expect(diceTextSimilarity("testing", "testing").score).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// Levenshtein
// ---------------------------------------------------------------------------

describe("levenshteinDistance", () => {
  it("identical strings → 0", () => {
    expect(levenshteinDistance("kitten", "kitten")).toBe(0);
  });

  it("empty string → length of other", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("classic kitten/sitting example", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("single substitution", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("single insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("single deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });
});

describe("levenshteinSimilarity", () => {
  it("identical → score 1", () => {
    expect(levenshteinSimilarity("hello", "hello").score).toBeCloseTo(1, 5);
  });

  it("completely different → lower score", () => {
    const result = levenshteinSimilarity("abc", "xyz");
    expect(result.score).toBeLessThan(1);
  });

  it("method is levenshtein", () => {
    expect(levenshteinSimilarity("a", "b").method).toBe("levenshtein");
  });
});

// ---------------------------------------------------------------------------
// Jaro / Jaro-Winkler
// ---------------------------------------------------------------------------

describe("jaroSimilarity", () => {
  it("identical strings → 1", () => {
    expect(jaroSimilarity("hello", "hello")).toBeCloseTo(1, 5);
  });

  it("empty strings → 0", () => {
    expect(jaroSimilarity("", "abc")).toBe(0);
  });

  it("MARTHA / MARHTA example", () => {
    // Classic Jaro example: should be ~0.944
    expect(jaroSimilarity("MARTHA", "MARHTA")).toBeGreaterThan(0.9);
  });
});

describe("jaroWinklerSimilarity", () => {
  it("identical strings → 1", () => {
    expect(jaroWinklerSimilarity("hello", "hello").score).toBeCloseTo(1, 5);
  });

  it("method is jaro-winkler", () => {
    expect(jaroWinklerSimilarity("abc", "abc").method).toBe("jaro-winkler");
  });

  it("scores are in [0, 1]", () => {
    const result = jaroWinklerSimilarity("foo", "bar").score;
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// LCS
// ---------------------------------------------------------------------------

describe("longestCommonSubsequence", () => {
  it("identical strings → full length", () => {
    expect(longestCommonSubsequence("abcde", "abcde")).toBe(5);
  });

  it("no common chars → 0", () => {
    expect(longestCommonSubsequence("abc", "xyz")).toBe(0);
  });

  it("classic ABCBDAB / BDCAB example → 4", () => {
    expect(longestCommonSubsequence("ABCBDAB", "BDCAB")).toBe(4);
  });
});

describe("lcsSimilarity", () => {
  it("identical → 1", () => {
    expect(lcsSimilarity("hello", "hello").score).toBeCloseTo(1, 5);
  });

  it("method is lcs", () => {
    expect(lcsSimilarity("a", "b").method).toBe("lcs");
  });
});

// ---------------------------------------------------------------------------
// N-gram similarity
// ---------------------------------------------------------------------------

describe("ngramSimilarity", () => {
  it("identical strings → 1", () => {
    expect(ngramSimilarity("hello", "hello").score).toBeCloseTo(1, 5);
  });

  it("method includes n", () => {
    expect(ngramSimilarity("test", "test", 2).method).toBe("ngram-2");
  });

  it("similar strings score higher than dissimilar", () => {
    const simSame = ngramSimilarity("testing", "testing123").score;
    const simDiff = ngramSimilarity("testing", "xyzmno").score;
    expect(simSame).toBeGreaterThan(simDiff);
  });
});

// ---------------------------------------------------------------------------
// Document similarity
// ---------------------------------------------------------------------------

describe("documentSimilarity", () => {
  it("identical vectors → 1", () => {
    const v = new Map([["a", 1.0], ["b", 0.5]]);
    expect(documentSimilarity(v, v).score).toBeCloseTo(1, 5);
  });

  it("method is tfidf-cosine", () => {
    expect(documentSimilarity(new Map(), new Map()).method).toBe("tfidf-cosine");
  });
});

// ---------------------------------------------------------------------------
// Pairwise similarity matrix
// ---------------------------------------------------------------------------

describe("pairwiseSimilarityMatrix", () => {
  const texts = ["hello world", "hello there", "completely different"];

  it("diagonal is all 1s", () => {
    const matrix = pairwiseSimilarityMatrix(texts);
    for (let i = 0; i < texts.length; i++) {
      expect(matrix[i]![i]).toBeCloseTo(1, 5);
    }
  });

  it("matrix is symmetric", () => {
    const matrix = pairwiseSimilarityMatrix(texts);
    for (let i = 0; i < texts.length; i++) {
      for (let j = 0; j < texts.length; j++) {
        expect(matrix[i]![j]).toBeCloseTo(matrix[j]![i]!, 10);
      }
    }
  });

  it("all values in [0, 1]", () => {
    const matrix = pairwiseSimilarityMatrix(texts);
    for (const row of matrix) {
      for (const val of row) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("works with levenshtein method", () => {
    const matrix = pairwiseSimilarityMatrix(["cat", "bat", "xyz"], {
      method: "levenshtein",
    });
    expect(matrix[0]![0]).toBeCloseTo(1, 5);
  });

  it("works with jaccard method", () => {
    const matrix = pairwiseSimilarityMatrix(texts, { method: "jaccard" });
    expect(matrix[0]![0]).toBeCloseTo(1, 5);
  });

  it("more similar texts score higher", () => {
    const matrix = pairwiseSimilarityMatrix(texts);
    // texts[0] and texts[1] share "hello" → should be more similar than texts[0] and texts[2]
    expect(matrix[0]![1]).toBeGreaterThan(matrix[0]![2]!);
  });
});
