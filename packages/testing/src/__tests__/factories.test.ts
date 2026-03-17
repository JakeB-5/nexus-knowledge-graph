import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetSequence,
  nextId,
  nextStringId,
  createTestNode,
  createTestEdge,
  createTestUser,
  createTestDocument,
  createTestGraph,
  createConnectedGraph,
  randomName,
  randomEmail,
  randomText,
  randomDate,
} from '../factories.js';

describe('sequence generators', () => {
  beforeEach(() => resetSequence());

  it('nextId returns incrementing integers', () => {
    expect(nextId()).toBe(1);
    expect(nextId()).toBe(2);
    expect(nextId()).toBe(3);
  });

  it('nextStringId returns prefixed strings', () => {
    expect(nextStringId('node')).toMatch(/^node_\d+$/);
  });

  it('nextStringId uses custom prefix', () => {
    expect(nextStringId('edge')).toMatch(/^edge_\d+$/);
  });

  it('resetSequence restarts counter', () => {
    nextId(); nextId();
    resetSequence();
    expect(nextId()).toBe(1);
  });
});

describe('random data generators', () => {
  it('randomName returns non-empty string with two parts', () => {
    const name = randomName();
    expect(name).toBeTruthy();
    expect(name.split(' ')).toHaveLength(2);
  });

  it('randomEmail is a valid-looking email', () => {
    const email = randomEmail();
    expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });

  it('randomEmail uses provided name', () => {
    const email = randomEmail('Jane Doe');
    expect(email).toMatch(/jane\.doe@/);
  });

  it('randomText returns a string with words', () => {
    const text = randomText(5);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('randomDate returns a Date between start and end', () => {
    const start = new Date('2023-01-01');
    const end = new Date('2023-12-31');
    const date = randomDate(start, end);
    expect(date.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(date.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});

describe('createTestNode', () => {
  beforeEach(() => resetSequence());

  it('creates a node with required fields', () => {
    const node = createTestNode();
    expect(node.id).toBeTruthy();
    expect(node.type).toBeTruthy();
    expect(node.label).toBeTruthy();
    expect(node.createdAt).toBeInstanceOf(Date);
    expect(node.updatedAt).toBeInstanceOf(Date);
  });

  it('applies overrides', () => {
    const node = createTestNode({ type: 'entity', label: 'AI' });
    expect(node.type).toBe('entity');
    expect(node.label).toBe('AI');
  });

  it('generates unique IDs', () => {
    const ids = Array.from({ length: 10 }, () => createTestNode().id);
    expect(new Set(ids).size).toBe(10);
  });
});

describe('createTestEdge', () => {
  it('creates an edge with required fields', () => {
    const edge = createTestEdge();
    expect(edge.id).toBeTruthy();
    expect(edge.sourceId).toBeTruthy();
    expect(edge.targetId).toBeTruthy();
    expect(edge.type).toBeTruthy();
    expect(typeof edge.weight).toBe('number');
    expect(edge.createdAt).toBeInstanceOf(Date);
  });

  it('applies overrides', () => {
    const edge = createTestEdge({ type: 'depends_on', weight: 0.9 });
    expect(edge.type).toBe('depends_on');
    expect(edge.weight).toBe(0.9);
  });
});

describe('createTestUser', () => {
  it('creates a user with required fields', () => {
    const user = createTestUser();
    expect(user.id).toBeTruthy();
    expect(user.name).toBeTruthy();
    expect(user.email).toMatch(/@/);
    expect(['admin', 'editor', 'viewer']).toContain(user.role);
  });

  it('uses provided name in email generation', () => {
    const user = createTestUser({ name: 'Test Person' });
    expect(user.email).toContain('test.person');
  });
});

describe('createTestDocument', () => {
  it('creates a document with required fields', () => {
    const doc = createTestDocument();
    expect(doc.id).toBeTruthy();
    expect(doc.title).toBeTruthy();
    expect(doc.content).toBeTruthy();
    expect(Array.isArray(doc.tags)).toBe(true);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });
});

describe('createTestGraph', () => {
  it('creates specified number of nodes', () => {
    const graph = createTestGraph(5, 4);
    expect(graph.nodes).toHaveLength(5);
  });

  it('creates specified number of edges', () => {
    const graph = createTestGraph(5, 4);
    expect(graph.edges).toHaveLength(4);
  });

  it('edges reference existing node IDs', () => {
    const graph = createTestGraph(5, 8);
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.sourceId)).toBe(true);
      expect(nodeIds.has(edge.targetId)).toBe(true);
    }
  });
});

describe('createConnectedGraph', () => {
  it('creates a chain topology', () => {
    const graph = createConnectedGraph('chain', 5);
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4);
  });

  it('creates a star topology', () => {
    const graph = createConnectedGraph('star', 5);
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4); // hub → 4 spokes
  });

  it('creates a ring topology', () => {
    const graph = createConnectedGraph('ring', 4);
    expect(graph.edges).toHaveLength(4); // each node connects to next, wraps around
  });

  it('creates a complete topology', () => {
    const graph = createConnectedGraph('complete', 4);
    // n*(n-1)/2 = 6 edges
    expect(graph.edges).toHaveLength(6);
  });

  it('creates a tree topology', () => {
    const graph = createConnectedGraph('tree', 7);
    expect(graph.edges).toHaveLength(6); // n-1 edges for a tree
  });
});
