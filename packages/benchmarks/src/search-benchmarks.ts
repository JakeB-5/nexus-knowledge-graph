import { BenchmarkRunner, type BenchmarkResult } from "./runner.js";
import { generateRandomCorpus, type TextDocument } from "./data-generators.js";

// ─── In-Memory Search Index ───────────────────────────────────────────────────

interface IndexedDoc {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** Term frequency map */
  termFreq: Map<string, number>;
  /** Norm for cosine similarity */
  norm: number;
}

interface SearchResult {
  id: string;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

class InvertedIndex {
  private docs: Map<string, IndexedDoc> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map(); // term -> docIds
  private idfCache: Map<string, number> = new Map();
  private docCount = 0;

  index(doc: TextDocument): void {
    const allText = `${doc.title} ${doc.title} ${doc.body} ${doc.tags.join(" ")}`;
    const tokens = tokenize(allText);

    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }

    // Normalize term frequencies
    const maxFreq = Math.max(...termFreq.values(), 1);
    for (const [term, freq] of termFreq) {
      termFreq.set(term, freq / maxFreq);
    }

    // Compute L2 norm
    let norm = 0;
    for (const freq of termFreq.values()) norm += freq * freq;
    norm = Math.sqrt(norm);

    const indexed: IndexedDoc = {
      id: doc.id,
      title: doc.title,
      body: doc.body,
      tags: doc.tags,
      termFreq,
      norm,
    };

    this.docs.set(doc.id, indexed);

    // Update inverted index
    for (const term of termFreq.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(doc.id);
    }

    this.docCount++;
    this.idfCache.clear(); // Invalidate IDF cache
  }

  private idf(term: string): number {
    if (this.idfCache.has(term)) return this.idfCache.get(term)!;
    const docsWithTerm = this.invertedIndex.get(term)?.size ?? 0;
    const idfVal = docsWithTerm > 0
      ? Math.log((this.docCount + 1) / (docsWithTerm + 1)) + 1
      : 0;
    this.idfCache.set(term, idfVal);
    return idfVal;
  }

  search(query: string, limit = 10): SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Gather candidate docs from inverted index
    const candidateIds = new Set<string>();
    for (const term of queryTokens) {
      const docs = this.invertedIndex.get(term);
      if (docs) {
        for (const id of docs) candidateIds.add(id);
      }
    }

    // Score each candidate using TF-IDF cosine similarity
    const scores: Array<[string, number]> = [];
    for (const docId of candidateIds) {
      const doc = this.docs.get(docId);
      if (!doc) continue;

      let score = 0;
      for (const term of queryTokens) {
        const tf = doc.termFreq.get(term) ?? 0;
        const idfVal = this.idf(term);
        score += tf * idfVal;
      }

      if (doc.norm > 0) score /= doc.norm;
      scores.push([docId, score]);
    }

    scores.sort((a, b) => b[1] - a[1]);
    return scores
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }));
  }

  /** Text-only search without IDF (BM25-like simplified) */
  searchTextOnly(query: string, limit = 10): SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const candidateIds = new Set<string>();
    for (const term of queryTokens) {
      const docs = this.invertedIndex.get(term);
      if (docs) {
        for (const id of docs) candidateIds.add(id);
      }
    }

    const scores: Array<[string, number]> = [];
    for (const docId of candidateIds) {
      const doc = this.docs.get(docId);
      if (!doc) continue;
      let score = 0;
      for (const term of queryTokens) {
        score += doc.termFreq.get(term) ?? 0;
      }
      scores.push([docId, score]);
    }

    scores.sort((a, b) => b[1] - a[1]);
    return scores.slice(0, limit).map(([id, score]) => ({ id, score }));
  }

  get size(): number {
    return this.docCount;
  }
}

// ─── Query Generator ──────────────────────────────────────────────────────────

const SAMPLE_QUERIES = [
  "knowledge graph",
  "search index query",
  "network analysis algorithm",
  "data structure traversal",
  "semantic similarity",
  "distributed system",
  "real-time collaboration",
  "machine learning embedding",
  "api design rest",
  "performance benchmark latency",
  "community detection pagerank",
  "vector search relevance ranking",
];

function randomQuery(): string {
  return SAMPLE_QUERIES[Math.floor(Math.random() * SAMPLE_QUERIES.length)]!;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

export async function runSearchBenchmarks(): Promise<BenchmarkResult[]> {
  const runner = new BenchmarkRunner({
    warmupIterations: 2,
    iterations: 5,
    trackMemory: true,
  });

  const corpusSizes = [100, 1_000, 10_000];

  console.log("Generating test corpora...");
  const corpora: Record<number, TextDocument[]> = {};
  for (const size of corpusSizes) {
    corpora[size] = generateRandomCorpus(size);
    console.log(`  Generated ${size} documents`);
  }

  // ── Indexing Speed Benchmarks ──
  console.log("\nBenchmarking indexing speed...");
  for (const size of corpusSizes) {
    const docs = corpora[size]!;

    runner.run(`Index ${size} docs`, () => {
      const idx = new InvertedIndex();
      for (const doc of docs) idx.index(doc);
    }, { iterations: 3, warmupIterations: 1 });
  }

  // ── Search Latency Benchmarks ──
  console.log("\nBenchmarking search latency...");
  for (const size of corpusSizes) {
    const docs = corpora[size]!;
    const idx = new InvertedIndex();
    for (const doc of docs) idx.index(doc);

    runner.run(`Search (TF-IDF) corpus=${size}`, () => {
      idx.search(randomQuery(), 10);
    }, { iterations: 50, warmupIterations: 5 });

    runner.run(`Search (text-only) corpus=${size}`, () => {
      idx.searchTextOnly(randomQuery(), 10);
    }, { iterations: 50, warmupIterations: 5 });
  }

  // ── Query Complexity Benchmarks ──
  console.log("\nBenchmarking query complexity...");
  const largeIdx = new InvertedIndex();
  for (const doc of corpora[10_000]!) largeIdx.index(doc);

  const queriesByComplexity = {
    simple: "graph",
    medium: "knowledge graph search",
    complex: "semantic knowledge graph network analysis distributed system real-time",
  };

  for (const [complexity, query] of Object.entries(queriesByComplexity)) {
    runner.run(`Query complexity=${complexity} corpus=10k`, () => {
      largeIdx.search(query, 10);
    }, { iterations: 100, warmupIterations: 10 });
  }

  // ── Hybrid vs Text-Only Comparison ──
  console.log("\nComparing hybrid vs text-only search...");
  const hybridResult = runner.run(`HybridSearch corpus=10k (100 queries)`, () => {
    for (let i = 0; i < 100; i++) largeIdx.search(randomQuery(), 10);
  }, { iterations: 5 });

  const textOnlyResult = runner.run(`TextOnlySearch corpus=10k (100 queries)`, () => {
    for (let i = 0; i < 100; i++) largeIdx.searchTextOnly(randomQuery(), 10);
  }, { iterations: 5 });

  const comparison = runner.compare(textOnlyResult, hybridResult);
  runner.printComparison(comparison);

  // ── Batch Search Benchmark ──
  console.log("\nBenchmarking batch search...");
  const batchSizes = [10, 100, 1_000];
  for (const batchSize of batchSizes) {
    runner.run(`BatchSearch size=${batchSize} corpus=10k`, () => {
      for (let i = 0; i < batchSize; i++) {
        largeIdx.search(randomQuery(), 5);
      }
    }, { iterations: 3, warmupIterations: 1 });
  }

  // ── Memory Usage ──
  console.log("\nMemory usage per corpus size:");
  for (const size of corpusSizes) {
    const before = process.memoryUsage().heapUsed;
    const idx = new InvertedIndex();
    for (const doc of corpora[size]!) idx.index(doc);
    const after = process.memoryUsage().heapUsed;
    const deltaKB = ((after - before) / 1024).toFixed(1);
    console.log(`  corpus=${size}: ~${deltaKB} KB heap delta (${idx.size} docs indexed)`);
  }

  runner.printResults();
  return runner.getResults();
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runSearchBenchmarks().catch(console.error);
}
