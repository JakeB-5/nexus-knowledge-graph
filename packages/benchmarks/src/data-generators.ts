/** Adjacency list representation of a graph */
export interface GraphData {
  nodeCount: number;
  edgeCount: number;
  /** adjacency list: nodeId → array of neighbor nodeIds */
  adjacency: Map<number, number[]>;
  /** optional node weights */
  nodeWeights?: Map<number, number>;
  /** optional edge weights: "sourceId,targetId" → weight */
  edgeWeights?: Map<string, number>;
}

export interface TextDocument {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: Date;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function addEdge(adj: Map<number, number[]>, u: number, v: number, directed = false): void {
  if (!adj.has(u)) adj.set(u, []);
  adj.get(u)!.push(v);
  if (!directed) {
    if (!adj.has(v)) adj.set(v, []);
    adj.get(v)!.push(u);
  }
}

// ─── Random (Uniform) Graph ───────────────────────────────────────────────────

/**
 * Generate a simple random graph with `n` nodes where each node has
 * approximately `avgDegree` edges.
 */
export function generateRandomGraph(
  n: number,
  avgDegree = 4,
  directed = false,
): GraphData {
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);

  const p = avgDegree / (n - 1);
  let edgeCount = 0;

  for (let u = 0; u < n; u++) {
    for (let v = directed ? 0 : u + 1; v < n; v++) {
      if (u !== v && Math.random() < p) {
        addEdge(adjacency, u, v, directed);
        edgeCount++;
      }
    }
  }

  return { nodeCount: n, edgeCount, adjacency };
}

// ─── Erdős–Rényi ─────────────────────────────────────────────────────────────

/**
 * Erdős–Rényi G(n, p) model: each possible edge exists independently with probability p.
 */
export function generateErdosRenyiGraph(
  n: number,
  p: number,
  directed = false,
): GraphData {
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);
  let edgeCount = 0;

  for (let u = 0; u < n; u++) {
    const start = directed ? 0 : u + 1;
    for (let v = start; v < n; v++) {
      if (u !== v && Math.random() < p) {
        addEdge(adjacency, u, v, directed);
        edgeCount++;
      }
    }
  }

  return { nodeCount: n, edgeCount, adjacency };
}

// ─── Barabási–Albert (Scale-Free) ────────────────────────────────────────────

/**
 * Barabási–Albert preferential attachment model.
 * Produces a scale-free network with power-law degree distribution.
 *
 * @param n     Total number of nodes
 * @param m     Number of edges each new node attaches (m ≥ 1)
 */
export function generateScaleFreeGraph(n: number, m = 2): GraphData {
  if (m < 1) throw new Error("m must be >= 1");
  if (n <= m) throw new Error("n must be > m");

  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);

  // Start with a complete graph of m+1 nodes
  let edgeCount = 0;
  for (let i = 0; i <= m; i++) {
    for (let j = i + 1; j <= m; j++) {
      addEdge(adjacency, i, j);
      edgeCount++;
    }
  }

  // Degree sequence for preferential attachment (repeated-node list)
  const degreeSeq: number[] = [];
  for (let i = 0; i <= m; i++) {
    const deg = adjacency.get(i)!.length;
    for (let d = 0; d < deg; d++) degreeSeq.push(i);
  }

  // Add remaining nodes
  for (let newNode = m + 1; newNode < n; newNode++) {
    const targets = new Set<number>();

    while (targets.size < m) {
      const idx = randomInt(0, degreeSeq.length - 1);
      const candidate = degreeSeq[idx]!;
      if (candidate !== newNode) targets.add(candidate);
    }

    for (const target of targets) {
      addEdge(adjacency, newNode, target);
      edgeCount++;
      degreeSeq.push(newNode);
      degreeSeq.push(target);
    }
  }

  return { nodeCount: n, edgeCount, adjacency };
}

// ─── Watts–Strogatz (Small-World) ────────────────────────────────────────────

/**
 * Watts–Strogatz small-world model.
 *
 * @param n   Number of nodes
 * @param k   Each node is connected to k nearest neighbors (k must be even)
 * @param p   Rewiring probability (0 = ring lattice, 1 = random graph)
 */
export function generateSmallWorldGraph(n: number, k = 4, p = 0.1): GraphData {
  if (k % 2 !== 0) throw new Error("k must be even");
  if (k >= n) throw new Error("k must be less than n");

  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);
  const edgeSet = new Set<string>();
  let edgeCount = 0;

  const hasEdge = (u: number, v: number): boolean =>
    edgeSet.has(`${Math.min(u, v)},${Math.max(u, v)}`);

  const addEdgeSW = (u: number, v: number): void => {
    if (u === v || hasEdge(u, v)) return;
    const key = `${Math.min(u, v)},${Math.max(u, v)}`;
    edgeSet.add(key);
    addEdge(adjacency, u, v);
    edgeCount++;
  };

  // Create ring lattice
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k / 2; j++) {
      const neighbor = (i + j) % n;
      addEdgeSW(i, neighbor);
    }
  }

  // Rewire edges
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k / 2; j++) {
      if (Math.random() < p) {
        const neighbor = (i + j) % n;
        // Remove old edge, add random new one
        const newTarget = randomInt(0, n - 1);
        if (newTarget !== i && !hasEdge(i, newTarget)) {
          // Remove i->neighbor
          const adjI = adjacency.get(i)!;
          const idx = adjI.indexOf(neighbor);
          if (idx !== -1) adjI.splice(idx, 1);
          const adjN = adjacency.get(neighbor)!;
          const nIdx = adjN.indexOf(i);
          if (nIdx !== -1) adjN.splice(nIdx, 1);
          edgeSet.delete(`${Math.min(i, neighbor)},${Math.max(i, neighbor)}`);
          edgeCount--;

          addEdgeSW(i, newTarget);
        }
      }
    }
  }

  return { nodeCount: n, edgeCount, adjacency };
}

// ─── Random Geometric Graph ───────────────────────────────────────────────────

/**
 * Random geometric graph: nodes placed uniformly in unit square,
 * connected if their Euclidean distance is ≤ r.
 */
export function generateRandomGeometricGraph(n: number, r: number): GraphData {
  const positions: Array<[number, number]> = Array.from({ length: n }, () => [
    Math.random(),
    Math.random(),
  ]);

  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);
  let edgeCount = 0;

  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      const [ux, uy] = positions[u]!;
      const [vx, vy] = positions[v]!;
      const dist = Math.sqrt((ux - vx) ** 2 + (uy - vy) ** 2);
      if (dist <= r) {
        addEdge(adjacency, u, v);
        edgeCount++;
      }
    }
  }

  return { nodeCount: n, edgeCount, adjacency };
}

// ─── Text Corpus Generator ────────────────────────────────────────────────────

const WORDS = [
  "knowledge", "graph", "node", "edge", "connection", "data", "network",
  "analysis", "search", "index", "query", "result", "document", "text",
  "semantic", "vector", "embedding", "similarity", "relevance", "ranking",
  "algorithm", "structure", "traversal", "path", "shortest", "breadth",
  "depth", "cluster", "community", "centrality", "pagerank", "weight",
  "directed", "undirected", "cycle", "tree", "root", "leaf", "branch",
  "schema", "type", "relation", "property", "attribute", "value", "key",
  "hash", "cache", "memory", "performance", "benchmark", "latency", "throughput",
  "concurrent", "parallel", "distributed", "replicated", "consistent", "eventual",
  "transaction", "commit", "rollback", "merge", "conflict", "resolution",
  "collaboration", "real-time", "stream", "event", "notification", "webhook",
  "api", "rest", "graphql", "websocket", "protocol", "serialization", "format",
];

const TOPICS = [
  "Graph Theory", "Knowledge Management", "Information Retrieval",
  "Machine Learning", "Natural Language Processing", "Database Systems",
  "Distributed Computing", "Network Analysis", "Data Structures",
  "Algorithm Design", "System Architecture", "API Design",
];

const TAG_POOL = [
  "graph", "search", "nlp", "ml", "database", "api", "performance",
  "architecture", "distributed", "realtime", "crdt", "sync", "export",
  "import", "analytics", "visualization", "embedding", "semantic",
];

function randomWords(n: number): string {
  return Array.from({ length: n }, () => WORDS[randomInt(0, WORDS.length - 1)]!).join(" ");
}

function randomSentence(): string {
  const len = randomInt(6, 18);
  const words = randomWords(len);
  return words.charAt(0).toUpperCase() + words.slice(1) + ".";
}

function randomParagraph(): string {
  const sentences = randomInt(3, 8);
  return Array.from({ length: sentences }, () => randomSentence()).join(" ");
}

function randomTags(): string[] {
  const count = randomInt(1, 5);
  return shuffle(TAG_POOL).slice(0, count);
}

function randomDate(daysBack = 365): Date {
  const now = Date.now();
  const offset = randomInt(0, daysBack) * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

/**
 * Generate a corpus of random text documents for search benchmarking.
 */
export function generateRandomCorpus(count: number): TextDocument[] {
  return Array.from({ length: count }, (_, i) => {
    const topic = TOPICS[randomInt(0, TOPICS.length - 1)]!;
    const paragraphs = randomInt(2, 6);
    const body = Array.from({ length: paragraphs }, () => randomParagraph()).join("\n\n");

    return {
      id: `doc-${String(i).padStart(6, "0")}`,
      title: `${topic}: ${randomWords(randomInt(3, 7))}`,
      body,
      tags: randomTags(),
      createdAt: randomDate(),
    };
  });
}

/**
 * Generate a large graph with configurable size preset.
 */
export function generateGraphBySize(
  size: "small" | "medium" | "large" | "xlarge",
  model: "random" | "scalefree" | "smallworld" = "random",
): GraphData {
  const configs = {
    small:  { n: 1_000,   avgDegree: 4, m: 2, k: 4, p: 0.05 },
    medium: { n: 10_000,  avgDegree: 4, m: 2, k: 4, p: 0.05 },
    large:  { n: 100_000, avgDegree: 4, m: 2, k: 4, p: 0.05 },
    xlarge: { n: 500_000, avgDegree: 3, m: 2, k: 4, p: 0.03 },
  };

  const cfg = configs[size];

  switch (model) {
    case "scalefree":
      return generateScaleFreeGraph(cfg.n, cfg.m);
    case "smallworld":
      return generateSmallWorldGraph(cfg.n, cfg.k, cfg.p);
    default:
      return generateRandomGraph(cfg.n, cfg.avgDegree);
  }
}

/**
 * Compute basic graph statistics for a generated graph.
 */
export function graphStats(graph: GraphData): {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  maxDegree: number;
  minDegree: number;
  density: number;
} {
  let maxDegree = 0;
  let minDegree = Infinity;
  let totalDegree = 0;

  for (const [, neighbors] of graph.adjacency) {
    const deg = neighbors.length;
    totalDegree += deg;
    if (deg > maxDegree) maxDegree = deg;
    if (deg < minDegree) minDegree = deg;
  }

  const n = graph.nodeCount;
  const avgDegree = n > 0 ? totalDegree / n : 0;
  const density = n > 1 ? (2 * graph.edgeCount) / (n * (n - 1)) : 0;

  return {
    nodeCount: n,
    edgeCount: graph.edgeCount,
    avgDegree,
    maxDegree,
    minDegree: minDegree === Infinity ? 0 : minDegree,
    density,
  };
}

/** Generate a sequence of random strings for CRDT benchmarks */
export function generateRandomStrings(count: number, avgLength = 50): string[] {
  return Array.from({ length: count }, () => {
    const len = randomInt(Math.max(1, avgLength - 20), avgLength + 20);
    return Array.from({ length: len }, () => {
      const charCode = randomInt(32, 126); // printable ASCII
      return String.fromCharCode(charCode);
    }).join("");
  });
}

/** Generate a sequence of random edit operations (position, char) */
export function generateEditOps(
  docLength: number,
  count: number,
): Array<{ type: "insert" | "delete"; pos: number; char?: string }> {
  return Array.from({ length: count }, () => {
    const type = Math.random() < 0.7 ? "insert" : "delete";
    const pos = randomInt(0, Math.max(0, docLength - 1));
    const char = type === "insert"
      ? String.fromCharCode(randomInt(65, 122))
      : undefined;
    return { type, pos, char };
  });
}

/** Random float in [min, max) */
export { randomFloat };
