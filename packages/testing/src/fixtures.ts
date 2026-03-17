// Pre-built test fixtures for common graph shapes and domain objects

import {
  createTestNode,
  createTestEdge,
  createTestUser,
  createTestDocument,
  createConnectedGraph,
  resetSequence,
} from './factories.js';
import type { TestGraph, TestNode, TestEdge, TestUser, TestDocument } from './factories.js';

// ── Basic graph fixtures ───────────────────────────────────────────────────

/** A graph with 0 nodes and 0 edges. */
export function emptyGraph(): TestGraph {
  return { nodes: [], edges: [] };
}

/** A graph containing exactly one node and no edges. */
export function singleNode(): TestGraph {
  return { nodes: [createTestNode({ label: 'solo' })], edges: [] };
}

/** Two disconnected components: [A, B] and [C, D] with no edges between them. */
export function disconnectedGraph(): TestGraph {
  const a = createTestNode({ label: 'A' });
  const b = createTestNode({ label: 'B' });
  const c = createTestNode({ label: 'C' });
  const d = createTestNode({ label: 'D' });
  return {
    nodes: [a, b, c, d],
    edges: [
      createTestEdge({ sourceId: a.id, targetId: b.id }),
      createTestEdge({ sourceId: c.id, targetId: d.id }),
    ],
  };
}

/** Small graph: ~10 nodes, ~15 edges (star + chain hybrid). */
export function smallGraph(): TestGraph {
  const hub = createTestNode({ type: 'hub', label: 'hub' });
  const spokes = Array.from({ length: 5 }, (_, i) =>
    createTestNode({ label: `spoke-${i}` })
  );
  const chain = Array.from({ length: 4 }, (_, i) =>
    createTestNode({ label: `chain-${i}` })
  );

  const nodes = [hub, ...spokes, ...chain];
  const edges: TestEdge[] = [];

  // Hub → spokes
  for (const spoke of spokes) {
    edges.push(createTestEdge({ sourceId: hub.id, targetId: spoke.id }));
  }

  // Chain: chain[0]→chain[1]→chain[2]→chain[3]
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push(createTestEdge({ sourceId: chain[i]!.id, targetId: chain[i + 1]!.id }));
  }

  // Connect hub to chain head
  if (chain[0]) {
    edges.push(createTestEdge({ sourceId: hub.id, targetId: chain[0].id }));
  }

  // Additional cross-edges to reach ~15
  if (spokes[0] && chain[0]) edges.push(createTestEdge({ sourceId: spokes[0].id, targetId: chain[0].id }));
  if (spokes[1] && chain[1]) edges.push(createTestEdge({ sourceId: spokes[1].id, targetId: chain[1].id }));
  if (spokes[2] && chain[2]) edges.push(createTestEdge({ sourceId: spokes[2].id, targetId: chain[2].id }));
  if (spokes[3] && spokes[4]) edges.push(createTestEdge({ sourceId: spokes[3].id, targetId: spokes[4].id }));

  return { nodes, edges };
}

/** Medium graph: 100 nodes, ~200 edges (random-ish with guaranteed connectivity). */
export function mediumGraph(): TestGraph {
  const nodeCount = 100;
  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    createTestNode({ label: `node-${i}` })
  );

  const edges: TestEdge[] = [];

  // Guarantee connectivity via a spanning chain
  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push(createTestEdge({ sourceId: nodes[i]!.id, targetId: nodes[i + 1]!.id }));
  }

  // Add ~100 random extra edges
  for (let i = 0; i < 101; i++) {
    const src = nodes[Math.floor(Math.random() * nodeCount)]!;
    const tgt = nodes[Math.floor(Math.random() * nodeCount)]!;
    if (src.id !== tgt.id) {
      edges.push(createTestEdge({ sourceId: src.id, targetId: tgt.id }));
    }
  }

  return { nodes, edges };
}

// ── Domain fixtures ────────────────────────────────────────────────────────

export interface SocialNetwork {
  users: TestUser[];
  friendships: TestEdge[];    // user ↔ user
  posts: TestDocument[];
}

/** Social network: 10 users, friendships, and posts. */
export function socialNetwork(): SocialNetwork {
  const users = Array.from({ length: 10 }, (_, i) =>
    createTestUser({ role: i === 0 ? 'admin' : 'viewer' })
  );

  const friendships: TestEdge[] = [];
  // Each user is friends with the next two
  for (let i = 0; i < users.length; i++) {
    const a = users[i]!;
    const b = users[(i + 1) % users.length]!;
    const c = users[(i + 2) % users.length]!;
    friendships.push(
      createTestEdge({ sourceId: a.id, targetId: b.id, type: 'friend' }),
      createTestEdge({ sourceId: a.id, targetId: c.id, type: 'friend' })
    );
  }

  const posts = users.map((u) =>
    createTestDocument({ authorId: u.id, tags: ['social', 'post'] })
  );

  return { users, friendships, posts };
}

export interface KnowledgeBase {
  documents: TestDocument[];
  concepts: TestNode[];
  tags: TestNode[];
  relationships: TestEdge[];  // document → concept, concept → concept, document → tag
}

/** Knowledge base: documents, concepts, tags, and relationships. */
export function knowledgeBase(): KnowledgeBase {
  const conceptLabels = ['AI', 'ML', 'Graph', 'Database', 'API', 'Cache'];
  const tagLabels = ['draft', 'published', 'archived', 'featured'];

  const concepts = conceptLabels.map((label) =>
    createTestNode({ type: 'concept', label })
  );
  const tags = tagLabels.map((label) =>
    createTestNode({ type: 'tag', label })
  );
  const documents = Array.from({ length: 8 }, (_, i) =>
    createTestDocument({ tags: [tagLabels[i % tagLabels.length]!] })
  );

  const relationships: TestEdge[] = [];

  // Each document links to 2 concepts
  for (const doc of documents) {
    const c1 = concepts[Math.floor(Math.random() * concepts.length)]!;
    const c2 = concepts[Math.floor(Math.random() * concepts.length)]!;
    relationships.push(
      createTestEdge({ sourceId: doc.id, targetId: c1.id, type: 'about' }),
      createTestEdge({ sourceId: doc.id, targetId: c2.id, type: 'about' })
    );
  }

  // Concept-to-concept relationships
  for (let i = 0; i < concepts.length - 1; i++) {
    relationships.push(
      createTestEdge({ sourceId: concepts[i]!.id, targetId: concepts[i + 1]!.id, type: 'related_to' })
    );
  }

  return { documents, concepts, tags, relationships };
}
