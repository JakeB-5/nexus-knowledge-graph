// Custom Vitest matchers for graph and schema assertions

import { expect } from 'vitest';
import type { TestNode, TestEdge, TestGraph } from './factories.js';

// ── Type guards ────────────────────────────────────────────────────────────

function isValidNode(node: unknown): node is TestNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  return (
    typeof n['id'] === 'string' &&
    n['id'].length > 0 &&
    typeof n['type'] === 'string' &&
    typeof n['label'] === 'string' &&
    typeof n['properties'] === 'object' &&
    n['properties'] !== null &&
    n['createdAt'] instanceof Date &&
    n['updatedAt'] instanceof Date
  );
}

function isValidEdge(edge: unknown): edge is TestEdge {
  if (!edge || typeof edge !== 'object') return false;
  const e = edge as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    e['id'].length > 0 &&
    typeof e['sourceId'] === 'string' &&
    e['sourceId'].length > 0 &&
    typeof e['targetId'] === 'string' &&
    e['targetId'].length > 0 &&
    typeof e['type'] === 'string' &&
    typeof e['weight'] === 'number' &&
    e['createdAt'] instanceof Date
  );
}

// ── Graph utilities ────────────────────────────────────────────────────────

function buildAdjacency(graph: TestGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const node of graph.nodes) adj.set(node.id, new Set());
  for (const edge of graph.edges) {
    if (!adj.has(edge.sourceId)) adj.set(edge.sourceId, new Set());
    adj.get(edge.sourceId)!.add(edge.targetId);
  }
  return adj;
}

function isConnected(graph: TestGraph): boolean {
  if (graph.nodes.length === 0) return true;
  const adj = new Map<string, Set<string>>();
  for (const node of graph.nodes) adj.set(node.id, new Set());
  for (const edge of graph.edges) {
    // Treat as undirected for connectivity check
    if (!adj.has(edge.sourceId)) adj.set(edge.sourceId, new Set());
    if (!adj.has(edge.targetId)) adj.set(edge.targetId, new Set());
    adj.get(edge.sourceId)!.add(edge.targetId);
    adj.get(edge.targetId)!.add(edge.sourceId);
  }

  const start = graph.nodes[0]!.id;
  const visited = new Set<string>([start]);
  const queue = [start];

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
}

function hasCycle(graph: TestGraph): boolean {
  const adj = buildAdjacency(graph);
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);

    for (const neighbor of adj.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

// ── Matcher implementations ────────────────────────────────────────────────

interface CustomMatchers<R = unknown> {
  toBeValidNode(): R;
  toBeValidEdge(): R;
  toHaveConnection(sourceId: string, targetId: string): R;
  toBeConnectedGraph(): R;
  toHaveNoCycles(): R;
  toMatchSchema(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }): R;
  toBeWithinRange(min: number, max: number): R;
  toContainAllOf<T>(items: T[]): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toBeValidNode(received: unknown) {
    const pass = isValidNode(received);
    return {
      pass,
      message: () =>
        pass
          ? 'Expected value NOT to be a valid node'
          : `Expected value to be a valid node, got: ${JSON.stringify(received)}`,
    };
  },

  toBeValidEdge(received: unknown) {
    const pass = isValidEdge(received);
    return {
      pass,
      message: () =>
        pass
          ? 'Expected value NOT to be a valid edge'
          : `Expected value to be a valid edge, got: ${JSON.stringify(received)}`,
    };
  },

  toHaveConnection(received: TestGraph, sourceId: string, targetId: string) {
    const pass = received.edges.some(
      (e) => e.sourceId === sourceId && e.targetId === targetId
    );
    return {
      pass,
      message: () =>
        pass
          ? `Expected graph NOT to have connection ${sourceId} → ${targetId}`
          : `Expected graph to have connection ${sourceId} → ${targetId}`,
    };
  },

  toBeConnectedGraph(received: TestGraph) {
    const pass = isConnected(received);
    return {
      pass,
      message: () =>
        pass
          ? 'Expected graph NOT to be connected'
          : 'Expected graph to be connected (all nodes reachable from any node)',
    };
  },

  toHaveNoCycles(received: TestGraph) {
    const pass = !hasCycle(received);
    return {
      pass,
      message: () =>
        pass ? 'Expected graph to have cycles' : 'Expected graph to have no cycles (be a DAG)',
    };
  },

  toMatchSchema(
    received: unknown,
    schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }
  ) {
    const result = schema.safeParse(received);
    const pass = result.success;
    return {
      pass,
      message: () =>
        pass
          ? 'Expected value NOT to match schema'
          : `Expected value to match schema. Errors: ${JSON.stringify(result.error)}`,
    };
  },

  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} NOT to be within [${min}, ${max}]`
          : `Expected ${received} to be within [${min}, ${max}]`,
    };
  },

  toContainAllOf<T>(received: T[], items: T[]) {
    const missing = items.filter((item) => !received.includes(item));
    const pass = missing.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected array NOT to contain all of: ${JSON.stringify(items)}`
          : `Expected array to contain all of: ${JSON.stringify(items)}. Missing: ${JSON.stringify(missing)}`,
    };
  },
});

export {
  isValidNode,
  isValidEdge,
  isConnected,
  hasCycle,
};
