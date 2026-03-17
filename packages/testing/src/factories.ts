// Factory functions for generating test data

let _idCounter = 0;

/** Reset the sequence counter (call between test suites if needed). */
export function resetSequence(): void {
  _idCounter = 0;
}

/** Generate a unique sequential integer ID. */
export function nextId(): number {
  return ++_idCounter;
}

/** Generate a unique string ID with optional prefix. */
export function nextStringId(prefix = 'id'): string {
  return `${prefix}_${nextId()}`;
}

// ── Random data generators ─────────────────────────────────────────────────

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank'];
const LAST_NAMES = ['Smith', 'Jones', 'Lee', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore'];
const DOMAINS = ['example.com', 'test.org', 'nexus.io', 'demo.net', 'sample.dev'];
const WORDS = [
  'graph', 'node', 'edge', 'concept', 'document', 'knowledge', 'semantic',
  'relation', 'entity', 'attribute', 'cluster', 'hub', 'link', 'path', 'query',
];

export function randomElement<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] as T;
}

export function randomName(): string {
  return `${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`;
}

export function randomEmail(name?: string): string {
  const local = (name ?? randomName()).toLowerCase().replace(/\s+/g, '.');
  return `${local}@${randomElement(DOMAINS)}`;
}

export function randomText(wordCount = 10): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(randomElement(WORDS));
  }
  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function randomDate(
  start = new Date('2020-01-01'),
  end = new Date()
): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function randomInt(min = 0, max = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomSlug(): string {
  return WORDS.slice(0, 3)
    .map(() => randomElement(WORDS))
    .join('-');
}

// ── Node factory ───────────────────────────────────────────────────────────

export interface TestNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestNode(overrides: Partial<TestNode> = {}): TestNode {
  return {
    id: nextStringId('node'),
    type: 'concept',
    label: randomElement(WORDS),
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Edge factory ───────────────────────────────────────────────────────────

export interface TestEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: Date;
}

export function createTestEdge(overrides: Partial<TestEdge> = {}): TestEdge {
  return {
    id: nextStringId('edge'),
    sourceId: nextStringId('node'),
    targetId: nextStringId('node'),
    type: 'relates_to',
    weight: Math.random(),
    properties: {},
    createdAt: new Date(),
    ...overrides,
  };
}

// ── User factory ───────────────────────────────────────────────────────────

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const name = overrides.name ?? randomName();
  return {
    id: nextStringId('user'),
    name,
    email: randomEmail(name),
    role: 'viewer',
    createdAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

// ── Document factory ───────────────────────────────────────────────────────

export interface TestDocument {
  id: string;
  title: string;
  content: string;
  tags: string[];
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export function createTestDocument(overrides: Partial<TestDocument> = {}): TestDocument {
  return {
    id: nextStringId('doc'),
    title: randomText(4),
    content: randomText(50),
    tags: [randomElement(WORDS), randomElement(WORDS)],
    authorId: nextStringId('user'),
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

// ── Graph factory ──────────────────────────────────────────────────────────

export interface TestGraph {
  nodes: TestNode[];
  edges: TestEdge[];
}

export function createTestGraph(nodeCount: number, edgeCount: number): TestGraph {
  const nodes = Array.from({ length: nodeCount }, () => createTestNode());
  const nodeIds = nodes.map((n) => n.id);

  const edges: TestEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const sourceId = randomElement(nodeIds)!;
    let targetId = randomElement(nodeIds)!;
    // Avoid self-loops
    while (targetId === sourceId && nodeIds.length > 1) {
      targetId = randomElement(nodeIds)!;
    }
    edges.push(createTestEdge({ sourceId, targetId }));
  }

  return { nodes, edges };
}

export type GraphTopology = 'chain' | 'star' | 'ring' | 'complete' | 'tree';

/**
 * Create a graph with a specific topology.
 *  - chain: 0→1→2→…→n-1
 *  - star:  0 is hub, all others connect to 0
 *  - ring:  0→1→…→n-1→0
 *  - complete: every node connects to every other
 *  - tree:  balanced binary tree
 */
export function createConnectedGraph(
  topology: GraphTopology,
  nodeCount = 6
): TestGraph {
  const nodes = Array.from({ length: nodeCount }, () => createTestNode());
  const edges: TestEdge[] = [];

  const addEdge = (sourceIdx: number, targetIdx: number) => {
    const source = nodes[sourceIdx];
    const target = nodes[targetIdx];
    if (source && target) {
      edges.push(createTestEdge({ sourceId: source.id, targetId: target.id }));
    }
  };

  switch (topology) {
    case 'chain':
      for (let i = 0; i < nodeCount - 1; i++) addEdge(i, i + 1);
      break;

    case 'star':
      for (let i = 1; i < nodeCount; i++) addEdge(0, i);
      break;

    case 'ring':
      for (let i = 0; i < nodeCount; i++) addEdge(i, (i + 1) % nodeCount);
      break;

    case 'complete':
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          addEdge(i, j);
        }
      }
      break;

    case 'tree': {
      // Binary tree: parent of node i is Math.floor((i-1)/2)
      for (let i = 1; i < nodeCount; i++) {
        addEdge(Math.floor((i - 1) / 2), i);
      }
      break;
    }
  }

  return { nodes, edges };
}
