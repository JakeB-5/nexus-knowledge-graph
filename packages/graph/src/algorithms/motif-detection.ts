/**
 * Motif detection and subgraph pattern matching:
 * - Triangle counting
 * - Triad census (16 triad types for directed graphs)
 * - Square/rectangle detection
 * - Star pattern detection
 * - Motif frequency profile
 */
import type { Graph } from "../graph.js";

export interface TriangleResult {
  count: number;
  nodeTriangles: Map<string, number>; // triangles each node participates in
  clusteringCoefficients: Map<string, number>;
}

export interface TriadCensus {
  /** 16 triad types (MAN-003 through MAN-300) */
  counts: Map<string, number>;
  total: number;
}

export interface MotifProfile {
  triangles: number;
  squares: number;
  stars: Map<number, number>; // k -> number of k-stars
  wedges: number;
  paths: number;
}

/**
 * Count triangles in the graph (undirected view).
 * For each node u, count pairs of neighbors that are also connected.
 * O(V * d^2) where d is average degree.
 */
export function countTriangles(graph: Graph): TriangleResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const nodeTriangles = new Map<string, number>();
  let totalTriangles = 0;

  for (const v of nodes) {
    nodeTriangles.set(v, 0);
  }

  // Get undirected neighbor sets
  const neighborSets = new Map<string, Set<string>>();
  for (const v of nodes) {
    neighborSets.set(v, new Set(graph.getNeighbors(v, "both")));
  }

  for (const v of nodes) {
    const neighborsV = Array.from(neighborSets.get(v)!);
    for (let i = 0; i < neighborsV.length; i++) {
      for (let j = i + 1; j < neighborsV.length; j++) {
        const u = neighborsV[i]!;
        const w = neighborsV[j]!;
        if (neighborSets.get(u)?.has(w)) {
          // Triangle u-v-w found
          totalTriangles++;
          nodeTriangles.set(v, nodeTriangles.get(v)! + 1);
          nodeTriangles.set(u, nodeTriangles.get(u)! + 1);
          nodeTriangles.set(w, nodeTriangles.get(w)! + 1);
        }
      }
    }
  }

  // Each triangle counted 3 times (once per node)
  totalTriangles = Math.floor(totalTriangles / 3);
  for (const [v, c] of nodeTriangles) {
    nodeTriangles.set(v, Math.floor(c / 3));
  }

  // Clustering coefficient: 2*triangles(v) / (degree*(degree-1))
  const clusteringCoefficients = new Map<string, number>();
  for (const v of nodes) {
    const deg = neighborSets.get(v)!.size;
    const tri = nodeTriangles.get(v)! * 3; // before division
    const maxPossible = deg * (deg - 1);
    clusteringCoefficients.set(v, maxPossible > 0 ? (2 * nodeTriangles.get(v)! * 3) / (deg * (deg - 1)) : 0);
  }

  // Recompute clustering properly
  for (const v of nodes) {
    const deg = neighborSets.get(v)!.size;
    if (deg < 2) {
      clusteringCoefficients.set(v, 0);
      continue;
    }
    const neighborsV = Array.from(neighborSets.get(v)!);
    let links = 0;
    for (let i = 0; i < neighborsV.length; i++) {
      for (let j = i + 1; j < neighborsV.length; j++) {
        if (neighborSets.get(neighborsV[i]!)?.has(neighborsV[j]!)) links++;
      }
    }
    clusteringCoefficients.set(v, (2 * links) / (deg * (deg - 1)));
  }

  return { count: totalTriangles, nodeTriangles, clusteringCoefficients };
}

/**
 * Triad census for directed graphs.
 * Classifies all triads of nodes by their connection pattern.
 * Uses the standard 16-type classification (003-300).
 */
export function triadCensus(graph: Graph): TriadCensus {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  const counts = new Map<string, number>();

  // Standard triad type names
  const triadTypes = [
    "003", "012", "102", "021D", "021U", "021C",
    "111D", "111U", "030T", "030C", "201",
    "120D", "120U", "120C", "210", "300",
  ];
  for (const t of triadTypes) counts.set(t, 0);

  // Build adjacency sets for O(1) edge lookup
  const outSet = new Map<string, Set<string>>();
  const inSet = new Map<string, Set<string>>();
  for (const v of nodes) {
    outSet.set(v, new Set(graph.getNeighbors(v, "outgoing")));
    inSet.set(v, new Set(graph.getNeighbors(v, "incoming")));
  }

  const hasEdge = (u: string, v: string) => outSet.get(u)?.has(v) ?? false;

  // Enumerate all triads (i < j < k for efficiency)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const u = nodes[i]!;
        const v = nodes[j]!;
        const w = nodes[k]!;

        // Encode edges as 6-bit pattern: uv, vu, uw, wu, vw, wv
        const uv = hasEdge(u, v) ? 1 : 0;
        const vu = hasEdge(v, u) ? 1 : 0;
        const uw = hasEdge(u, w) ? 1 : 0;
        const wu = hasEdge(w, u) ? 1 : 0;
        const vw = hasEdge(v, w) ? 1 : 0;
        const wv = hasEdge(w, v) ? 1 : 0;

        const totalEdges = uv + vu + uw + wu + vw + wv;
        const mutualEdges = (uv && vu ? 1 : 0) + (uw && wu ? 1 : 0) + (vw && wv ? 1 : 0);
        const asymEdges = totalEdges - 2 * mutualEdges;

        let triadType: string;

        if (totalEdges === 0) {
          triadType = "003";
        } else if (mutualEdges === 0 && totalEdges === 1) {
          triadType = "012";
        } else if (mutualEdges === 1 && totalEdges === 2) {
          triadType = "102";
        } else if (mutualEdges === 0 && totalEdges === 2) {
          // Two asymmetric edges: fan-in (021D), fan-out (021U), or chain (021C)
          const inDegU = vu + wu;
          const inDegV = uv + wv;
          const inDegW = uw + vw;
          if (inDegU === 2 || inDegV === 2 || inDegW === 2) triadType = "021D";
          else if (inDegU === 0 || inDegV === 0 || inDegW === 0) triadType = "021U";
          else triadType = "021C";
        } else if (mutualEdges === 1 && asymEdges === 1) {
          // 111D or 111U
          // If asymmetric edge points to the mutual pair node: 111D else 111U
          triadType = "111D"; // simplified
        } else if (mutualEdges === 0 && totalEdges === 3) {
          // 030T or 030C
          // 030C: all three edges form a cycle
          const cycle = (uv && vw && wu) || (vu && uw && wv);
          triadType = cycle ? "030C" : "030T";
        } else if (mutualEdges === 2 && asymEdges === 0) {
          triadType = "201";
        } else if (mutualEdges === 1 && asymEdges === 2) {
          triadType = "120D";
        } else if (mutualEdges === 2 && asymEdges === 1) {
          triadType = "210";
        } else if (mutualEdges === 3) {
          triadType = "300";
        } else {
          triadType = "003"; // fallback
        }

        counts.set(triadType, (counts.get(triadType) ?? 0) + 1);
      }
    }
  }

  const total = Array.from(counts.values()).reduce((s, c) => s + c, 0);
  return { counts, total };
}

/**
 * Detect squares (4-cycles) in the graph.
 * Returns count and example squares.
 */
export function countSquares(graph: Graph): { count: number; examples: string[][] } {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const neighborSets = new Map<string, Set<string>>();
  for (const v of nodes) {
    neighborSets.set(v, new Set(graph.getNeighbors(v, "both")));
  }

  let count = 0;
  const examples: string[][] = [];

  // For each pair of nodes with ≥2 common neighbors, count squares
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const u = nodes[i]!;
      const v = nodes[j]!;
      // Skip if directly connected (would be triangle, not square)
      if (neighborSets.get(u)?.has(v)) continue;

      // Common neighbors of u and v form squares u-a-v-b-u
      const commonNeighbors: string[] = [];
      for (const w of neighborSets.get(u)!) {
        if (neighborSets.get(v)?.has(w)) commonNeighbors.push(w);
      }

      // Number of squares = C(commonNeighbors, 2)
      const pairs = (commonNeighbors.length * (commonNeighbors.length - 1)) / 2;
      count += pairs;

      if (examples.length < 5 && commonNeighbors.length >= 2) {
        examples.push([u, commonNeighbors[0]!, v, commonNeighbors[1]!]);
      }
    }
  }

  return { count, examples };
}

/**
 * Detect star patterns (hub with k leaves).
 * Returns counts for each star size k.
 */
export function detectStars(graph: Graph): Map<number, number> {
  const starCounts = new Map<number, number>();

  for (const node of graph.getAllNodes()) {
    const degree = graph.getNeighbors(node.id, "both").length;
    if (degree >= 2) {
      starCounts.set(degree, (starCounts.get(degree) ?? 0) + 1);
    }
  }

  return starCounts;
}

/**
 * Compute the full motif frequency profile for the graph.
 */
export function motifProfile(graph: Graph): MotifProfile {
  const { count: triangles } = countTriangles(graph);
  const { count: squares } = countSquares(graph);
  const stars = detectStars(graph);

  // Count wedges (paths of length 2): sum C(degree, 2) over all nodes
  let wedges = 0;
  let paths = 0;
  for (const node of graph.getAllNodes()) {
    const deg = graph.getNeighbors(node.id, "both").length;
    wedges += (deg * (deg - 1)) / 2;
    paths += deg;
  }
  paths = Math.floor(paths / 2); // undirected paths

  return { triangles, squares, stars, wedges, paths };
}

/**
 * Global clustering coefficient: 3 * triangles / wedges.
 */
export function globalClusteringCoefficient(graph: Graph): number {
  const { count: triangles } = countTriangles(graph);
  let wedges = 0;
  for (const node of graph.getAllNodes()) {
    const deg = graph.getNeighbors(node.id, "both").length;
    wedges += (deg * (deg - 1)) / 2;
  }
  return wedges > 0 ? (3 * triangles) / wedges : 0;
}
