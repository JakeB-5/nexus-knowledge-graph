import { BenchmarkRunner, type BenchmarkResult } from "./runner.js";
import {
  generateRandomGraph,
  generateScaleFreeGraph,
  generateSmallWorldGraph,
  type GraphData,
  graphStats,
} from "./data-generators.js";

// ─── Graph Algorithms ─────────────────────────────────────────────────────────

function bfs(graph: GraphData, startNode: number): number[] {
  const visited = new Set<number>();
  const queue: number[] = [startNode];
  const order: number[] = [];

  visited.add(startNode);

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    const neighbors = graph.adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return order;
}

function dfs(graph: GraphData, startNode: number): number[] {
  const visited = new Set<number>();
  const order: number[] = [];

  function visit(node: number): void {
    visited.add(node);
    order.push(node);
    const neighbors = graph.adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visit(neighbor);
      }
    }
  }

  visit(startNode);
  return order;
}

function dfsIterative(graph: GraphData, startNode: number): number[] {
  const visited = new Set<number>();
  const stack: number[] = [startNode];
  const order: number[] = [];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    order.push(node);

    const neighbors = graph.adjacency.get(node) ?? [];
    for (let i = neighbors.length - 1; i >= 0; i--) {
      const n = neighbors[i]!;
      if (!visited.has(n)) stack.push(n);
    }
  }

  return order;
}

/**
 * Simplified PageRank computation (power iteration).
 */
function pageRank(
  graph: GraphData,
  iterations = 20,
  dampingFactor = 0.85,
): Map<number, number> {
  const n = graph.nodeCount;
  const ranks = new Map<number, number>();
  const initial = 1 / n;

  for (let i = 0; i < n; i++) ranks.set(i, initial);

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<number, number>();

    for (let i = 0; i < n; i++) {
      newRanks.set(i, (1 - dampingFactor) / n);
    }

    for (const [node, neighbors] of graph.adjacency) {
      const outDegree = neighbors.length;
      if (outDegree === 0) continue;
      const contribution = (ranks.get(node) ?? 0) * dampingFactor / outDegree;
      for (const neighbor of neighbors) {
        newRanks.set(neighbor, (newRanks.get(neighbor) ?? 0) + contribution);
      }
    }

    for (const [node, rank] of newRanks) {
      ranks.set(node, rank);
    }
  }

  return ranks;
}

/**
 * Dijkstra's shortest path algorithm.
 */
function dijkstra(
  graph: GraphData,
  source: number,
): Map<number, number> {
  const dist = new Map<number, number>();
  const visited = new Set<number>();

  for (let i = 0; i < graph.nodeCount; i++) dist.set(i, Infinity);
  dist.set(source, 0);

  // Simple priority queue via sorted array (good enough for benchmarking)
  const pq: Array<[number, number]> = [[0, source]]; // [dist, node]

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const entry = pq.shift();
    if (!entry) break;
    const [d, u] = entry;

    if (visited.has(u)) continue;
    visited.add(u);

    const neighbors = graph.adjacency.get(u) ?? [];
    for (const v of neighbors) {
      const newDist = d + 1; // unweighted: all edges weight 1
      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist);
        pq.push([newDist, v]);
      }
    }
  }

  return dist;
}

/**
 * Simple community detection via label propagation.
 */
function labelPropagation(
  graph: GraphData,
  maxIterations = 10,
): Map<number, number> {
  const labels = new Map<number, number>();

  // Initialize: each node is its own community
  for (let i = 0; i < graph.nodeCount; i++) labels.set(i, i);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (const [node, neighbors] of graph.adjacency) {
      if (neighbors.length === 0) continue;

      // Count neighbor labels
      const labelCount = new Map<number, number>();
      for (const n of neighbors) {
        const lbl = labels.get(n) ?? n;
        labelCount.set(lbl, (labelCount.get(lbl) ?? 0) + 1);
      }

      // Find most frequent label
      let maxCount = 0;
      let bestLabel = labels.get(node) ?? node;
      for (const [lbl, count] of labelCount) {
        if (count > maxCount) {
          maxCount = count;
          bestLabel = lbl;
        }
      }

      if (bestLabel !== labels.get(node)) {
        labels.set(node, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return labels;
}

// ─── Graph Construction Benchmark ─────────────────────────────────────────────

function benchmarkGraphConstruction(n: number): number {
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adjacency.set(i, []);
  const edges = Math.floor(n * 2);
  for (let e = 0; e < edges; e++) {
    const u = Math.floor(Math.random() * n);
    const v = Math.floor(Math.random() * n);
    if (u !== v) {
      adjacency.get(u)!.push(v);
      adjacency.get(v)!.push(u);
    }
  }
  return adjacency.size;
}

// ─── Neighbor Query Benchmark ─────────────────────────────────────────────────

function benchmarkNeighborQueries(graph: GraphData, queryCount: number): number {
  let total = 0;
  const n = graph.nodeCount;
  for (let i = 0; i < queryCount; i++) {
    const node = Math.floor(Math.random() * n);
    total += (graph.adjacency.get(node) ?? []).length;
  }
  return total;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

export async function runGraphBenchmarks(): Promise<BenchmarkResult[]> {
  const runner = new BenchmarkRunner({
    warmupIterations: 2,
    iterations: 5,
    trackMemory: true,
  });

  const sizes: Array<{ label: string; n: number }> = [
    { label: "1k", n: 1_000 },
    { label: "10k", n: 10_000 },
    { label: "100k", n: 100_000 },
  ];

  console.log("Generating graphs...");
  const graphs: Record<string, GraphData> = {
    random_1k: generateRandomGraph(1_000, 4),
    random_10k: generateRandomGraph(10_000, 4),
    scalefree_1k: generateScaleFreeGraph(1_000, 2),
    scalefree_10k: generateScaleFreeGraph(10_000, 2),
    smallworld_1k: generateSmallWorldGraph(1_000, 4, 0.1),
    smallworld_10k: generateSmallWorldGraph(10_000, 4, 0.1),
  };

  // Print graph stats
  console.log("\nGraph Statistics:");
  for (const [name, graph] of Object.entries(graphs)) {
    const stats = graphStats(graph);
    console.log(
      `  ${name.padEnd(20)} nodes=${stats.nodeCount} edges=${stats.edgeCount} avgDeg=${stats.avgDegree.toFixed(2)} maxDeg=${stats.maxDegree}`,
    );
  }
  console.log();

  // ── BFS Benchmarks ──
  for (const { label } of sizes) {
    const key = `random_${label}`;
    const graph = graphs[key];
    if (!graph) continue;

    runner.run(`BFS random-${label}`, () => {
      bfs(graph, 0);
    });

    runner.run(`DFS (recursive) random-${label}`, () => {
      try { dfs(graph, 0); } catch { /* stack overflow on large graphs */ }
    });

    runner.run(`DFS (iterative) random-${label}`, () => {
      dfsIterative(graph, 0);
    });
  }

  // ── PageRank Benchmarks ──
  for (const key of ["random_1k", "random_10k", "scalefree_1k", "scalefree_10k"]) {
    const graph = graphs[key];
    if (!graph) continue;
    runner.run(`PageRank ${key} (20 iter)`, () => {
      pageRank(graph, 20);
    });
  }

  // ── Shortest Path Benchmarks ──
  for (const key of ["random_1k", "scalefree_1k", "smallworld_1k"]) {
    const graph = graphs[key];
    if (!graph) continue;
    runner.run(`Dijkstra ${key}`, () => {
      dijkstra(graph, 0);
    });
  }

  // ── Community Detection ──
  for (const key of ["random_1k", "scalefree_1k"]) {
    const graph = graphs[key];
    if (!graph) continue;
    runner.run(`LabelPropagation ${key}`, () => {
      labelPropagation(graph, 10);
    });
  }

  // ── Graph Construction ──
  for (const { label, n } of sizes) {
    runner.run(`GraphConstruction ${label}`, () => {
      benchmarkGraphConstruction(n);
    });
  }

  // ── Neighbor Queries ──
  for (const key of ["random_1k", "random_10k"]) {
    const graph = graphs[key];
    if (!graph) continue;
    runner.run(`NeighborQuery ${key} (10k queries)`, () => {
      benchmarkNeighborQueries(graph, 10_000);
    });
  }

  // ── Memory per graph size ──
  console.log("\nMemory usage per graph size (approximate):");
  for (const { label, n } of sizes) {
    const before = process.memoryUsage().heapUsed;
    const g = generateRandomGraph(n, 4);
    const after = process.memoryUsage().heapUsed;
    const deltaKB = ((after - before) / 1024).toFixed(1);
    console.log(`  random-${label} (${n} nodes): ~${deltaKB} KB heap delta`);
    void g; // prevent optimization
  }

  runner.printResults();
  return runner.getResults();
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runGraphBenchmarks().catch(console.error);
}
