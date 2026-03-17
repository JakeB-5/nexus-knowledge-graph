import { describe, it, expect, beforeEach } from "vitest";
import { TFIDF } from "../tfidf.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCorpus(): TFIDF {
  const tfidf = new TFIDF();
  tfidf.addDocument("doc1", "the cat sat on the mat");
  tfidf.addDocument("doc2", "the dog sat on the log");
  tfidf.addDocument("doc3", "the cat and the dog are friends");
  return tfidf;
}

// ---------------------------------------------------------------------------
// Add / remove documents
// ---------------------------------------------------------------------------

describe("TFIDF – document management", () => {
  it("adds documents and tracks count", () => {
    const tfidf = new TFIDF();
    expect(tfidf.documentCount).toBe(0);
    tfidf.addDocument("a", "hello world");
    expect(tfidf.documentCount).toBe(1);
    tfidf.addDocument("b", "foo bar");
    expect(tfidf.documentCount).toBe(2);
  });

  it("replaces a document with the same id", () => {
    const tfidf = new TFIDF();
    tfidf.addDocument("a", "hello world");
    tfidf.addDocument("a", "different content entirely");
    expect(tfidf.documentCount).toBe(1);
    const kw = tfidf.topKeywords("a", 5);
    const words = kw.map((k) => k.word);
    expect(words.some((w) => ["differ", "content", "entir"].includes(w))).toBe(true);
  });

  it("removes a document", () => {
    const tfidf = new TFIDF();
    tfidf.addDocument("a", "hello world");
    tfidf.addDocument("b", "foo bar");
    const removed = tfidf.removeDocument("a");
    expect(removed).toBe(true);
    expect(tfidf.documentCount).toBe(1);
  });

  it("removeDocument returns false for unknown id", () => {
    const tfidf = new TFIDF();
    expect(tfidf.removeDocument("nonexistent")).toBe(false);
  });

  it("addDocuments batch works", () => {
    const tfidf = new TFIDF();
    tfidf.addDocuments([
      { id: "1", text: "alpha beta" },
      { id: "2", text: "gamma delta" },
    ]);
    expect(tfidf.documentCount).toBe(2);
  });

  it("allDocumentIds returns all ids", () => {
    const tfidf = buildCorpus();
    const ids = tfidf.allDocumentIds();
    expect(ids).toContain("doc1");
    expect(ids).toContain("doc2");
    expect(ids).toContain("doc3");
  });
});

// ---------------------------------------------------------------------------
// IDF
// ---------------------------------------------------------------------------

describe("TFIDF – idf()", () => {
  it("rare terms have higher IDF", () => {
    const tfidf = buildCorpus();
    // "cat" appears in doc1 and doc3 (df=2); "mat" only in doc1 (df=1)
    // lower df → higher IDF
    const idfCat = tfidf.idf("cat");
    const idfMat = tfidf.idf("mat");
    expect(idfMat).toBeGreaterThanOrEqual(idfCat);
  });

  it("unknown terms get a high IDF", () => {
    const tfidf = buildCorpus();
    const idfUnknown = tfidf.idf("xyzzy");
    expect(idfUnknown).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TF-IDF scores
// ---------------------------------------------------------------------------

describe("TFIDF – tfidf()", () => {
  it("returns 0 for terms not in document", () => {
    const tfidf = buildCorpus();
    expect(tfidf.tfidf("xyzzy", "doc1")).toBe(0);
  });

  it("returns 0 for unknown document", () => {
    const tfidf = buildCorpus();
    expect(tfidf.tfidf("cat", "unknown")).toBe(0);
  });

  it("unique term in a document has positive score", () => {
    const tfidf = buildCorpus();
    // "mat" is unique to doc1; normalized form via porter stemmer
    const score = tfidf.tfidf("mat", "doc1");
    expect(score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

describe("TFIDF – vector()", () => {
  it("returns a non-empty map for a known document", () => {
    const tfidf = buildCorpus();
    const vec = tfidf.vector("doc1");
    expect(vec.size).toBeGreaterThan(0);
  });

  it("returns empty map for unknown document", () => {
    const tfidf = buildCorpus();
    expect(tfidf.vector("nope").size).toBe(0);
  });

  it("vectorForText produces a vector for query text", () => {
    const tfidf = buildCorpus();
    const vec = tfidf.vectorForText("cat and dog");
    expect(vec.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

describe("TFIDF – similarity()", () => {
  it("self-similarity is 1", () => {
    const tfidf = buildCorpus();
    expect(tfidf.similarity("doc1", "doc1")).toBeCloseTo(1, 5);
  });

  it("more similar docs have higher score", () => {
    const tfidf = new TFIDF();
    tfidf.addDocument("a", "machine learning neural networks deep learning");
    tfidf.addDocument("b", "machine learning algorithms classification");
    tfidf.addDocument("c", "cooking recipes pasta dinner food");
    // a and b should be more similar than a and c
    const simAB = tfidf.similarity("a", "b");
    const simAC = tfidf.similarity("a", "c");
    expect(simAB).toBeGreaterThan(simAC);
  });

  it("querySimilarity returns number in [0, 1]", () => {
    const tfidf = buildCorpus();
    const sim = tfidf.querySimlarity("doc1", "cat on a mat");
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Top keywords
// ---------------------------------------------------------------------------

describe("TFIDF – topKeywords()", () => {
  it("returns the requested number of keywords", () => {
    const tfidf = buildCorpus();
    const kw = tfidf.topKeywords("doc1", 3);
    expect(kw.length).toBeLessThanOrEqual(3);
  });

  it("keywords are sorted by score descending", () => {
    const tfidf = buildCorpus();
    const kw = tfidf.topKeywords("doc1", 10);
    for (let i = 1; i < kw.length; i++) {
      expect(kw[i - 1]!.score).toBeGreaterThanOrEqual(kw[i]!.score);
    }
  });

  it("topKeywordsAll returns map for all docs", () => {
    const tfidf = buildCorpus();
    const all = tfidf.topKeywordsAll(5);
    expect(all.has("doc1")).toBe(true);
    expect(all.has("doc2")).toBe(true);
    expect(all.has("doc3")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pairwise similarity matrix
// ---------------------------------------------------------------------------

describe("TFIDF – pairwiseSimilarityMatrix()", () => {
  it("diagonal is all 1s", () => {
    const tfidf = buildCorpus();
    const matrix = tfidf.pairwiseSimilarityMatrix();
    const ids = tfidf.allDocumentIds();
    for (const id of ids) {
      expect(matrix.get(id)!.get(id)).toBeCloseTo(1, 5);
    }
  });

  it("matrix is symmetric", () => {
    const tfidf = buildCorpus();
    const matrix = tfidf.pairwiseSimilarityMatrix();
    const ids = tfidf.allDocumentIds();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ab = matrix.get(ids[i]!)!.get(ids[j]!)!;
        const ba = matrix.get(ids[j]!)!.get(ids[i]!)!;
        expect(ab).toBeCloseTo(ba, 10);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe("TFIDF – vocabularySize", () => {
  it("grows as documents are added", () => {
    const tfidf = new TFIDF();
    tfidf.addDocument("a", "unique word alpha");
    const size1 = tfidf.vocabularySize;
    tfidf.addDocument("b", "another unique word beta");
    expect(tfidf.vocabularySize).toBeGreaterThan(size1);
  });
});
