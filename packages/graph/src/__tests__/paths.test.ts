import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import {
  floydWarshall,
  reconstructFWPath,
  dijkstra,
  aStar,
  bidirectionalBFS,
  kShortestPaths,
  enumeratePaths,
} from "../algorithms/path-algorithms.js";

function addEdge(g: Graph, src: string, tgt: string, weight = 1): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

function makeWeightedGraph(): Graph {
  const g = new Graph();
  for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
  addEdge(g, "A", "B", 4);
  addEdge(g, "A", "C", 2);
  addEdge(g, "C", "B", 1);
  addEdge(g, "B", "D", 5);
  addEdge(g, "C", "D", 8);
  addEdge(g, "C", "E", 10);
  addEdge(g, "D", "E", 2);
  return g;
}

describe("Floyd-Warshall (All-Pairs Shortest Paths)", () => {
  it("distance from node to itself is 0", () => {
    const g = makeWeightedGraph();
    const { distances } = floydWarshall(g);
    for (const node of g.getAllNodes()) {
      expect(distances.get(node.id)?.get(node.id)).toBe(0);
    }
  });

  it("finds shortest path A->E = 9 (A->C->B->D->E)", () => {
    const g = makeWeightedGraph();
    const { distances } = floydWarshall(g);
    // A->C=2, C->B=1, B->D=5, D->E=2 = 10; or A->C=2,C->B=1=3,B->D=5=8,D->E=2=10
    // Actually A->C=2, C->B=1 (total 3), B->D=5 (total 8), D->E=2 (total 10)
    // Or A->B=4, B->D=5, D->E=2 = 11
    expect(distances.get("A")?.get("E")).toBe(10);
  });

  it("unreachable nodes have Infinity distance", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B", 1);
    // C is isolated
    const { distances } = floydWarshall(g);
    expect(distances.get("A")?.get("C")).toBe(Infinity);
    expect(distances.get("C")?.get("A")).toBe(Infinity);
  });

  it("path reconstruction returns correct path", () => {
    const g = makeWeightedGraph();
    const { distances, next } = floydWarshall(g);
    const path = reconstructFWPath(next, "A", "E");
    expect(path).not.toBeNull();
    expect(path![0]).toBe("A");
    expect(path![path!.length - 1]).toBe("E");
    // Verify path is valid
    for (let i = 0; i < path!.length - 1; i++) {
      const edges = g.getEdgesBetween(path![i]!, path![i + 1]!);
      expect(edges.length).toBeGreaterThan(0);
    }
  });

  it("path reconstruction returns null for unreachable", () => {
    const g = new Graph();
    for (const id of ["A","B"]) g.addNode({ id, type: "node" });
    const { next } = floydWarshall(g);
    const path = reconstructFWPath(next, "A", "B");
    expect(path).toBeNull();
  });

  it("satisfies triangle inequality", () => {
    const g = makeWeightedGraph();
    const { distances } = floydWarshall(g);
    const nodes = g.getAllNodes().map(n => n.id);
    for (const u of nodes) {
      for (const v of nodes) {
        for (const w of nodes) {
          const duv = distances.get(u)?.get(v) ?? Infinity;
          const dvw = distances.get(v)?.get(w) ?? Infinity;
          const duw = distances.get(u)?.get(w) ?? Infinity;
          if (isFinite(duv) && isFinite(dvw)) {
            expect(duw).toBeLessThanOrEqual(duv + dvw + 1e-9);
          }
        }
      }
    }
  });
});

describe("Dijkstra's Algorithm", () => {
  it("finds shortest distances from source", () => {
    const g = makeWeightedGraph();
    const results = dijkstra(g, "A");
    expect(results.get("A")?.distance).toBe(0);
    expect(results.get("C")?.distance).toBe(2);
    expect(results.get("B")?.distance).toBe(3); // A->C->B
    expect(results.get("D")?.distance).toBe(8); // A->C->B->D
    expect(results.get("E")?.distance).toBe(10); // A->C->B->D->E
  });

  it("reconstructed path is valid", () => {
    const g = makeWeightedGraph();
    const results = dijkstra(g, "A");
    const pathToE = results.get("E")?.path ?? [];
    expect(pathToE[0]).toBe("A");
    expect(pathToE[pathToE.length - 1]).toBe("E");
    for (let i = 0; i < pathToE.length - 1; i++) {
      expect(g.getEdgesBetween(pathToE[i]!, pathToE[i + 1]!).length).toBeGreaterThan(0);
    }
  });

  it("unreachable node has Infinity distance", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B", 1);
    const results = dijkstra(g, "A");
    expect(results.get("C")?.distance).toBe(Infinity);
  });

  it("single node source has distance 0", () => {
    const g = makeWeightedGraph();
    const results = dijkstra(g, "A");
    expect(results.get("A")?.distance).toBe(0);
    expect(results.get("A")?.path).toEqual(["A"]);
  });

  it("handles early termination with target", () => {
    const g = makeWeightedGraph();
    const results = dijkstra(g, "A", "D");
    expect(results.get("D")?.distance).toBe(8);
  });

  it("agrees with Floyd-Warshall", () => {
    const g = makeWeightedGraph();
    const fw = floydWarshall(g);
    for (const source of g.getAllNodes().map(n => n.id)) {
      const dijk = dijkstra(g, source);
      for (const target of g.getAllNodes().map(n => n.id)) {
        const fwDist = fw.distances.get(source)?.get(target) ?? Infinity;
        const dijkDist = dijk.get(target)?.distance ?? Infinity;
        expect(dijkDist).toBeCloseTo(fwDist, 9);
      }
    }
  });
});

describe("A* Search", () => {
  it("finds shortest path with zero heuristic (equivalent to Dijkstra)", () => {
    const g = makeWeightedGraph();
    const result = aStar(g, "A", "E", () => 0);
    expect(result).not.toBeNull();
    expect(result!.distance).toBe(10);
    expect(result!.path[0]).toBe("A");
    expect(result!.path[result!.path.length - 1]).toBe("E");
  });

  it("returns null for unreachable target", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B", 1);
    const result = aStar(g, "A", "C", () => 0);
    expect(result).toBeNull();
  });

  it("path is valid (every step has an edge)", () => {
    const g = makeWeightedGraph();
    const result = aStar(g, "A", "D", () => 0);
    expect(result).not.toBeNull();
    for (let i = 0; i < result!.path.length - 1; i++) {
      expect(g.getEdgesBetween(result!.path[i]!, result!.path[i + 1]!).length).toBeGreaterThan(0);
    }
  });

  it("finds same cost as Dijkstra", () => {
    const g = makeWeightedGraph();
    const aStarResult = aStar(g, "A", "E", () => 0);
    const dijkResult = dijkstra(g, "A");
    expect(aStarResult?.distance).toBeCloseTo(dijkResult.get("E")!.distance, 9);
  });
});

describe("Bidirectional BFS", () => {
  it("finds path between connected nodes", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
    const result = bidirectionalBFS(g, "A", "E");
    expect(result).not.toBeNull();
    expect(result!.path[0]).toBe("A");
    expect(result!.path[result!.path.length - 1]).toBe("E");
    expect(result!.distance).toBe(4);
  });

  it("source equals target returns single-node path", () => {
    const g = new Graph();
    g.addNode({ id: "A", type: "node" });
    const result = bidirectionalBFS(g, "A", "A");
    expect(result?.path).toEqual(["A"]);
    expect(result?.distance).toBe(0);
  });

  it("returns null for disconnected nodes", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "C", "D");
    const result = bidirectionalBFS(g, "A", "D");
    expect(result).toBeNull();
  });
});

describe("K Shortest Paths (Yen's)", () => {
  it("first path equals Dijkstra shortest path distance", () => {
    const g = makeWeightedGraph();
    const paths = kShortestPaths(g, "A", "E", 3);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0]!.distance).toBe(10);
    expect(paths[0]!.path[0]).toBe("A");
    expect(paths[0]!.path[paths[0]!.path.length - 1]).toBe("E");
  });

  it("paths are sorted by distance ascending", () => {
    const g = makeWeightedGraph();
    const paths = kShortestPaths(g, "A", "E", 3);
    for (let i = 0; i < paths.length - 1; i++) {
      expect(paths[i]!.distance).toBeLessThanOrEqual(paths[i + 1]!.distance);
    }
  });

  it("all returned paths start and end correctly", () => {
    const g = makeWeightedGraph();
    const paths = kShortestPaths(g, "A", "D", 3);
    for (const p of paths) {
      expect(p.path[0]).toBe("A");
      expect(p.path[p.path.length - 1]).toBe("D");
    }
  });

  it("returns fewer paths if graph has fewer than K distinct paths", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B", 1); addEdge(g, "B", "C", 1);
    const paths = kShortestPaths(g, "A", "C", 5);
    expect(paths.length).toBeLessThanOrEqual(5);
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe("Path Enumeration", () => {
  it("finds all simple paths in small graph", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "A", "C");
    addEdge(g, "B", "D"); addEdge(g, "C", "D");
    const paths = enumeratePaths(g, "A", "D", { maxLength: 5 });
    expect(paths.length).toBe(2);
    for (const p of paths) {
      expect(p[0]).toBe("A");
      expect(p[p.length - 1]).toBe("D");
    }
  });

  it("respects maxLength constraint", () => {
    const g = makeWeightedGraph();
    const paths = enumeratePaths(g, "A", "E", { maxLength: 2 });
    for (const p of paths) {
      expect(p.length - 1).toBeLessThanOrEqual(2);
    }
  });

  it("respects maxResults constraint", () => {
    const g = makeWeightedGraph();
    const paths = enumeratePaths(g, "A", "E", { maxResults: 1 });
    expect(paths.length).toBeLessThanOrEqual(1);
  });

  it("no paths if source is disconnected from target", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "C", "D");
    const paths = enumeratePaths(g, "A", "D");
    expect(paths.length).toBe(0);
  });
});
