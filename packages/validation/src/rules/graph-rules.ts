// Graph-specific validation rules for the Nexus knowledge graph

import type { ValidationRule } from "../types.js";

export interface GraphNode {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  [key: string]: unknown;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Rule: no self-loops (edge source === target)
export function noSelfLoops(message?: string): ValidationRule<Graph> {
  return {
    name: "noSelfLoops",
    message: message ?? "Graph must not contain self-loops",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges)) return false;
      return !graph.edges.some((e) => e.source === e.target);
    },
  };
}

// Rule: no duplicate edges (same source, target, type)
export function noDuplicateEdges(message?: string): ValidationRule<Graph> {
  return {
    name: "noDuplicateEdges",
    message: message ?? "Graph must not contain duplicate edges",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges)) return false;
      const seen = new Set<string>();
      for (const e of graph.edges) {
        const key = `${e.source}|${e.target}|${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
  };
}

// Rule: max edges per node (counting both in and out)
export function maxEdgesPerNode(
  max: number,
  message?: string
): ValidationRule<Graph> {
  return {
    name: "maxEdgesPerNode",
    message: message ?? "Node must not exceed {max} edges",
    params: { max },
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges)) return false;
      const counts = new Map<string, number>();
      for (const e of graph.edges) {
        counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
        counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        if (count > max) return false;
      }
      return true;
    },
  };
}

// Rule: all node types must be in the allowed set
export function validNodeTypes(
  allowedTypes: string[],
  message?: string
): ValidationRule<Graph> {
  const allowed = new Set(allowedTypes);
  return {
    name: "validNodeTypes",
    message: message ?? "All nodes must have valid types",
    params: { allowedTypes: allowedTypes.join(", ") },
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.nodes)) return false;
      return graph.nodes.every((n) => allowed.has(n.type));
    },
  };
}

// Rule: valid edge source/target type combinations
export interface EdgeTypeConstraint {
  edgeType: string;
  sourceTypes: string[];
  targetTypes: string[];
}

export function validEdgeTypeCombinations(
  constraints: EdgeTypeConstraint[],
  message?: string
): ValidationRule<Graph> {
  return {
    name: "validEdgeTypeCombinations",
    message: message ?? "Edge type combinations must be valid",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges) || !Array.isArray(graph.nodes)) {
        return false;
      }
      const nodeTypeById = new Map<string, string>();
      for (const n of graph.nodes) {
        nodeTypeById.set(n.id, n.type);
      }

      const constraintMap = new Map<string, EdgeTypeConstraint>();
      for (const c of constraints) {
        constraintMap.set(c.edgeType, c);
      }

      for (const edge of graph.edges) {
        const constraint = constraintMap.get(edge.type);
        if (!constraint) continue; // unconstrained edge type is allowed

        const sourceType = nodeTypeById.get(edge.source);
        const targetType = nodeTypeById.get(edge.target);

        if (!sourceType || !targetType) return false;

        if (
          !constraint.sourceTypes.includes(sourceType) ||
          !constraint.targetTypes.includes(targetType)
        ) {
          return false;
        }
      }
      return true;
    },
  };
}

// Cycle detection using DFS for directed graphs
function hasCycle(
  nodeIds: string[],
  adjacency: Map<string, string[]>
): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) return true; // back edge → cycle
      if (c === WHITE && dfs(neighbor)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const id of nodeIds) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      if (dfs(id)) return true;
    }
  }
  return false;
}

// Rule: specific edge types must form an acyclic subgraph
export function acyclicEdgeTypes(
  edgeTypes: string[],
  message?: string
): ValidationRule<Graph> {
  const targetTypes = new Set(edgeTypes);
  return {
    name: "acyclicEdgeTypes",
    message: message ?? "The specified edge types must not form cycles",
    params: { edgeTypes: edgeTypes.join(", ") },
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges) || !Array.isArray(graph.nodes)) {
        return false;
      }

      const nodeIds = graph.nodes.map((n) => n.id);
      const adjacency = new Map<string, string[]>();
      for (const id of nodeIds) adjacency.set(id, []);

      for (const edge of graph.edges) {
        if (!targetTypes.has(edge.type)) continue;
        const neighbors = adjacency.get(edge.source);
        if (neighbors) neighbors.push(edge.target);
      }

      return !hasCycle(nodeIds, adjacency);
    },
  };
}

// Rule: all edge endpoints must reference existing nodes
export function validEdgeEndpoints(message?: string): ValidationRule<Graph> {
  return {
    name: "validEdgeEndpoints",
    message: message ?? "All edge endpoints must reference existing nodes",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges) || !Array.isArray(graph.nodes)) {
        return false;
      }
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      return graph.edges.every(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
      );
    },
  };
}

// Rule: graph is connected (every node reachable from every other)
export function isConnected(message?: string): ValidationRule<Graph> {
  return {
    name: "isConnected",
    message: message ?? "Graph must be connected",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        return false;
      }
      if (graph.nodes.length === 0) return true;

      // Build undirected adjacency
      const adj = new Map<string, Set<string>>();
      for (const n of graph.nodes) adj.set(n.id, new Set());
      for (const e of graph.edges) {
        adj.get(e.source)?.add(e.target);
        adj.get(e.target)?.add(e.source);
      }

      // BFS from first node
      const startId = graph.nodes[0]?.id;
      if (!startId) return true;

      const visited = new Set<string>();
      const queue: string[] = [startId];
      visited.add(startId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      return visited.size === graph.nodes.length;
    },
  };
}

// Rule: node IDs must be unique within the graph
export function uniqueNodeIds(message?: string): ValidationRule<Graph> {
  return {
    name: "uniqueNodeIds",
    message: message ?? "All node IDs must be unique",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.nodes)) return false;
      const ids = graph.nodes.map((n) => n.id);
      return new Set(ids).size === ids.length;
    },
  };
}

// Rule: edge IDs must be unique within the graph
export function uniqueEdgeIds(message?: string): ValidationRule<Graph> {
  return {
    name: "uniqueEdgeIds",
    message: message ?? "All edge IDs must be unique",
    params: {},
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges)) return false;
      const ids = graph.edges.map((e) => e.id);
      return new Set(ids).size === ids.length;
    },
  };
}

// Rule: max out-degree per node (edges going out from a node)
export function maxOutDegree(max: number, message?: string): ValidationRule<Graph> {
  return {
    name: "maxOutDegree",
    message: message ?? "Node out-degree must not exceed {max}",
    params: { max },
    validate: (graph) => {
      if (!graph || !Array.isArray(graph.edges)) return false;
      const outDegrees = new Map<string, number>();
      for (const e of graph.edges) {
        outDegrees.set(e.source, (outDegrees.get(e.source) ?? 0) + 1);
      }
      for (const degree of outDegrees.values()) {
        if (degree > max) return false;
      }
      return true;
    },
  };
}
