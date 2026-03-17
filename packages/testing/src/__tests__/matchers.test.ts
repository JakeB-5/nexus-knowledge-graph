import { describe, it, expect } from 'vitest';
import '../matchers.js'; // register custom matchers
import {
  createTestNode,
  createTestEdge,
  createConnectedGraph,
  createTestGraph,
} from '../factories.js';

describe('toBeValidNode', () => {
  it('passes for a valid node', () => {
    expect(createTestNode()).toBeValidNode();
  });

  it('fails for an object missing required fields', () => {
    expect({ id: '', type: 'x' }).not.toBeValidNode();
  });

  it('fails for null', () => {
    expect(null).not.toBeValidNode();
  });

  it('fails for a node with non-Date timestamps', () => {
    const node = { ...createTestNode(), createdAt: 'not-a-date' };
    expect(node).not.toBeValidNode();
  });
});

describe('toBeValidEdge', () => {
  it('passes for a valid edge', () => {
    expect(createTestEdge()).toBeValidEdge();
  });

  it('fails for missing sourceId', () => {
    const edge = { ...createTestEdge(), sourceId: '' };
    expect(edge).not.toBeValidEdge();
  });

  it('fails for null', () => {
    expect(null).not.toBeValidEdge();
  });
});

describe('toHaveConnection', () => {
  it('passes when the connection exists', () => {
    const nodeA = createTestNode();
    const nodeB = createTestNode();
    const graph = {
      nodes: [nodeA, nodeB],
      edges: [createTestEdge({ sourceId: nodeA.id, targetId: nodeB.id })],
    };
    expect(graph).toHaveConnection(nodeA.id, nodeB.id);
  });

  it('fails when the connection does not exist', () => {
    const graph = createTestGraph(3, 0);
    expect(graph).not.toHaveConnection('node-a', 'node-b');
  });
});

describe('toBeConnectedGraph', () => {
  it('passes for a chain graph', () => {
    const graph = createConnectedGraph('chain', 5);
    expect(graph).toBeConnectedGraph();
  });

  it('passes for a single node', () => {
    const graph = { nodes: [createTestNode()], edges: [] };
    expect(graph).toBeConnectedGraph();
  });

  it('fails for a disconnected graph', () => {
    const a = createTestNode();
    const b = createTestNode();
    const c = createTestNode();
    const graph = {
      nodes: [a, b, c],
      edges: [createTestEdge({ sourceId: a.id, targetId: b.id })],
      // c is isolated
    };
    expect(graph).not.toBeConnectedGraph();
  });
});

describe('toHaveNoCycles', () => {
  it('passes for a tree (DAG)', () => {
    const graph = createConnectedGraph('tree', 7);
    expect(graph).toHaveNoCycles();
  });

  it('passes for a chain', () => {
    const graph = createConnectedGraph('chain', 5);
    expect(graph).toHaveNoCycles();
  });

  it('fails for a ring (has cycle)', () => {
    const graph = createConnectedGraph('ring', 4);
    expect(graph).not.toHaveNoCycles();
  });

  it('fails for a complete graph (has cycles)', () => {
    const graph = createConnectedGraph('complete', 4);
    expect(graph).not.toHaveNoCycles();
  });
});

describe('toMatchSchema', () => {
  it('passes when value matches schema', () => {
    // Minimal mock schema (Zod-like interface)
    const schema = {
      safeParse: (v: unknown) => ({
        success: typeof (v as Record<string, unknown>)['id'] === 'string',
      }),
    };
    expect({ id: 'abc' }).toMatchSchema(schema);
  });

  it('fails when value does not match schema', () => {
    const schema = {
      safeParse: (v: unknown) => ({
        success: typeof (v as Record<string, unknown>)['id'] === 'number',
        error: 'id must be a number',
      }),
    };
    expect({ id: 'abc' }).not.toMatchSchema(schema);
  });
});

describe('toBeWithinRange', () => {
  it('passes when value is within range', () => {
    expect(5).toBeWithinRange(1, 10);
    expect(1).toBeWithinRange(1, 10);
    expect(10).toBeWithinRange(1, 10);
  });

  it('fails when value is outside range', () => {
    expect(0).not.toBeWithinRange(1, 10);
    expect(11).not.toBeWithinRange(1, 10);
  });
});

describe('toContainAllOf', () => {
  it('passes when all items are present', () => {
    expect([1, 2, 3, 4]).toContainAllOf([1, 3]);
  });

  it('fails when any item is missing', () => {
    expect([1, 2, 3]).not.toContainAllOf([1, 4]);
  });

  it('passes for empty items array', () => {
    expect([1, 2, 3]).toContainAllOf([]);
  });
});
