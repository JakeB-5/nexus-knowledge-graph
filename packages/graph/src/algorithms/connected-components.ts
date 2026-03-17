/**
 * Connected component algorithms:
 * - Strongly Connected Components (Tarjan's algorithm)
 * - Weakly Connected Components (Union-Find based)
 */
import type { Graph } from "../graph.js";
import { UnionFind } from "../data-structures/union-find.js";

export interface SCCResult {
  components: string[][];
  componentMap: Map<string, number>; // node -> component index
  count: number;
}

export interface WCCResult {
  components: string[][];
  componentMap: Map<string, number>;
  count: number;
  largestComponent: string[];
  sizeDistribution: Map<number, number>; // size -> frequency
}

/**
 * Tarjan's algorithm for Strongly Connected Components.
 * O(V + E) time complexity.
 */
export function stronglyConnectedComponents(graph: Graph): SCCResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.set(v, true);

    // Explore outgoing neighbors
    for (const w of graph.getNeighbors(v, "outgoing")) {
      if (!index.has(w)) {
        // w not yet visited
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.get(w)) {
        // w is on stack and hence in current SCC
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    // If v is a root node, pop the stack to get the SCC
    if (lowlink.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.set(w, false);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  }

  // Use iterative approach to avoid stack overflow on large graphs
  for (const v of nodes) {
    if (!index.has(v)) {
      strongConnectIterative(v, graph, index, lowlink, onStack, stack, components);
    }
  }

  const componentMap = new Map<string, number>();
  for (let i = 0; i < components.length; i++) {
    for (const v of components[i]!) {
      componentMap.set(v, i);
    }
  }

  return { components, componentMap, count: components.length };
}

/**
 * Iterative version of Tarjan's to avoid call stack overflow.
 */
function strongConnectIterative(
  start: string,
  graph: Graph,
  index: Map<string, number>,
  lowlink: Map<string, number>,
  onStack: Map<string, boolean>,
  stack: string[],
  components: string[][],
): void {
  let counter = index.size;
  // Each frame: { node, neighborIterator, parentNode }
  const callStack: Array<{
    v: string;
    neighbors: string[];
    neighborIdx: number;
  }> = [];

  const push = (v: string) => {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.set(v, true);
    callStack.push({
      v,
      neighbors: graph.getNeighbors(v, "outgoing"),
      neighborIdx: 0,
    });
  };

  push(start);

  while (callStack.length > 0) {
    const frame = callStack[callStack.length - 1]!;
    const { v, neighbors } = frame;

    if (frame.neighborIdx < neighbors.length) {
      const w = neighbors[frame.neighborIdx++]!;
      if (!index.has(w)) {
        push(w);
      } else if (onStack.get(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    } else {
      // All neighbors processed
      callStack.pop();
      if (callStack.length > 0) {
        const parent = callStack[callStack.length - 1]!;
        lowlink.set(
          parent.v,
          Math.min(lowlink.get(parent.v)!, lowlink.get(v)!),
        );
      }

      // Check if v is root of an SCC
      if (lowlink.get(v) === index.get(v)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.set(w, false);
          component.push(w);
        } while (w !== v);
        components.push(component);
      }
    }
  }
}

/**
 * Weakly Connected Components using Union-Find.
 * Treats the graph as undirected for connectivity.
 * O((V + E) * alpha(V)) time complexity.
 */
export function weaklyConnectedComponents(graph: Graph): WCCResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const uf = new UnionFind(nodes);

  // Union nodes connected by any edge (ignoring direction)
  for (const edge of graph.getAllNodes().flatMap((n) =>
    graph.getEdgesForNode(n.id).filter((e) => e.source === n.id),
  )) {
    uf.union(edge.source, edge.target);
  }

  const rawComponents = uf.getAllComponents();
  const components = rawComponents;

  const componentMap = new Map<string, number>();
  for (let i = 0; i < components.length; i++) {
    for (const v of components[i]!) {
      componentMap.set(v, i);
    }
  }

  const largestComponent = components.reduce(
    (best, c) => (c.length > best.length ? c : best),
    [] as string[],
  );

  const sizeDistribution = new Map<number, number>();
  for (const c of components) {
    sizeDistribution.set(c.length, (sizeDistribution.get(c.length) ?? 0) + 1);
  }

  return {
    components,
    componentMap,
    count: components.length,
    largestComponent,
    sizeDistribution,
  };
}

/**
 * Extract the largest strongly connected component.
 */
export function largestSCC(graph: Graph): string[] {
  const { components } = stronglyConnectedComponents(graph);
  if (components.length === 0) return [];
  return components.reduce((best, c) => (c.length > best.length ? c : best), [] as string[]);
}

/**
 * Extract the largest weakly connected component.
 */
export function largestWCC(graph: Graph): string[] {
  const { largestComponent } = weaklyConnectedComponents(graph);
  return largestComponent;
}

/**
 * Component size distribution for weakly connected components.
 */
export function componentSizeDistribution(graph: Graph): Map<number, number> {
  const { sizeDistribution } = weaklyConnectedComponents(graph);
  return sizeDistribution;
}

/**
 * Check if the directed graph is strongly connected (single SCC).
 */
export function isStronglyConnected(graph: Graph): boolean {
  const { count } = stronglyConnectedComponents(graph);
  return count <= 1;
}

/**
 * Check if the graph is weakly connected (single WCC).
 */
export function isWeaklyConnected(graph: Graph): boolean {
  const { count } = weaklyConnectedComponents(graph);
  return count <= 1;
}
