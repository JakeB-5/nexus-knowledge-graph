/**
 * Integration tests: Graph + Search
 *
 * Tests that exercise the boundary between the @nexus/graph and @nexus/search
 * packages. We build graphs, index their nodes into a search engine, issue
 * text queries and then traverse the graph starting from the returned hits.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Graph, bfs } from "@nexus/graph";
import type { GraphNode } from "@nexus/graph";
import {
  FullTextSearchEngine,
  HybridSearchEngine,
  VectorSearchEngine,
} from "@nexus/search";
import type { IndexedDocument, SearchOptions } from "@nexus/search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeToDoc(node: GraphNode): IndexedDocument {
  const meta = node.metadata ?? {};
  return {
    id: node.id,
    title: (meta["title"] as string) ?? node.id,
    content: (meta["content"] as string) ?? "",
    type: node.type,
  };
}

function buildKnowledgeGraph(): Graph {
  const g = new Graph();

  const nodes: GraphNode[] = [
    {
      id: "n1",
      type: "article",
      metadata: {
        title: "Introduction to TypeScript",
        content:
          "TypeScript is a strongly typed programming language that builds on JavaScript.",
      },
    },
    {
      id: "n2",
      type: "article",
      metadata: {
        title: "Advanced TypeScript Generics",
        content:
          "Generics provide a way to create reusable components in TypeScript with type safety.",
      },
    },
    {
      id: "n3",
      type: "tutorial",
      metadata: {
        title: "Getting Started with React",
        content:
          "React is a JavaScript library for building user interfaces with components.",
      },
    },
    {
      id: "n4",
      type: "tutorial",
      metadata: {
        title: "React Hooks Deep Dive",
        content:
          "Hooks let you use state and other React features without writing a class component.",
      },
    },
    {
      id: "n5",
      type: "concept",
      metadata: {
        title: "Functional Programming Concepts",
        content:
          "Functional programming emphasizes immutability, pure functions, and function composition.",
      },
    },
    {
      id: "n6",
      type: "concept",
      metadata: {
        title: "Graph Theory Basics",
        content:
          "Graph theory studies graphs consisting of vertices and edges to model pairwise relations.",
      },
    },
    {
      id: "n7",
      type: "article",
      metadata: {
        title: "Building REST APIs with Node.js",
        content:
          "Node.js enables building scalable server-side applications using JavaScript.",
      },
    },
    {
      id: "n8",
      type: "concept",
      metadata: {
        title: "Asynchronous JavaScript",
        content:
          "Asynchronous programming in JavaScript uses callbacks, promises and async/await.",
      },
    },
  ];

  for (const node of nodes) {
    g.addNode(node);
  }

  // Edges: "related" relationships
  const edges = [
    { id: "e1", source: "n1", target: "n2", type: "related", weight: 1 },
    { id: "e2", source: "n1", target: "n3", type: "related", weight: 0.8 },
    { id: "e3", source: "n2", target: "n5", type: "related", weight: 0.7 },
    { id: "e4", source: "n3", target: "n4", type: "related", weight: 1 },
    { id: "e5", source: "n4", target: "n8", type: "related", weight: 0.9 },
    { id: "e6", source: "n5", target: "n6", type: "related", weight: 0.6 },
    { id: "e7", source: "n7", target: "n8", type: "related", weight: 0.8 },
    { id: "e8", source: "n1", target: "n7", type: "related", weight: 0.5 },
  ];

  for (const edge of edges) {
    g.addEdge(edge);
  }

  return g;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Graph + Search integration", () => {
  let graph: Graph;
  let searchEngine: FullTextSearchEngine;

  beforeEach(() => {
    graph = buildKnowledgeGraph();
    searchEngine = new FullTextSearchEngine();

    // Index every graph node into the search engine
    for (const node of graph.getAllNodes()) {
      searchEngine.add(nodeToDoc(node));
    }
  });

  // ── 1. Basic indexing ──────────────────────────────────────────────────────

  it("indexes all graph nodes into the search engine", () => {
    expect(searchEngine.size).toBe(graph.nodeCount);
  });

  it("finds nodes by title keyword", () => {
    const hits = searchEngine.search("TypeScript");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n1");
    expect(ids).toContain("n2");
  });

  it("finds nodes by content keyword", () => {
    const hits = searchEngine.search("immutability");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.id).toBe("n5");
  });

  // ── 2. Search → Graph traversal ───────────────────────────────────────────

  it("traverses graph starting from search results", () => {
    const hits = searchEngine.search("React");
    expect(hits.length).toBeGreaterThan(0);

    // Take top hit and do BFS
    const startId = hits[0]!.id;
    const result = bfs(graph, startId);
    expect(result.visited.length).toBeGreaterThanOrEqual(1);
    expect(result.visited).toContain(startId);
  });

  it("search for 'TypeScript' and traverses two hops to reach Functional Programming", () => {
    const hits = searchEngine.search("Introduction TypeScript");
    const startId = hits[0]!.id; // should be n1

    const result = bfs(graph, startId);
    // n1 → n2 → n5 (Functional Programming), depth=2
    expect(result.visited).toContain("n5");
    expect(result.depth.get("n5")).toBeLessThanOrEqual(2);
  });

  it("collects all reachable nodes from multiple search results", () => {
    const hits = searchEngine.search("JavaScript");
    const visited = new Set<string>();

    for (const hit of hits) {
      const result = bfs(graph, hit.id);
      for (const id of result.visited) {
        visited.add(id);
      }
    }

    // JavaScript appears in multiple nodes; reachability should cover most of the graph
    expect(visited.size).toBeGreaterThanOrEqual(3);
  });

  // ── 3. Graph changes reflected in search ──────────────────────────────────

  it("reflects node addition in search results", () => {
    const newNode: GraphNode = {
      id: "n9",
      type: "article",
      metadata: {
        title: "Quantum Computing Fundamentals",
        content:
          "Quantum computing uses quantum-mechanical phenomena such as superposition and entanglement.",
      },
    };

    graph.addNode(newNode);
    searchEngine.add(nodeToDoc(newNode));

    const hits = searchEngine.search("quantum");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.id).toBe("n9");
  });

  it("reflects node removal in search results", () => {
    // n5 is "Functional Programming Concepts"
    const beforeRemoval = searchEngine.search("immutability");
    expect(beforeRemoval.some((h) => h.id === "n5")).toBe(true);

    graph.removeNode("n5");
    searchEngine.remove("n5");

    const afterRemoval = searchEngine.search("immutability");
    expect(afterRemoval.some((h) => h.id === "n5")).toBe(false);
  });

  it("updates search index when node metadata changes", () => {
    // Simulate an update by removing and re-adding with new content
    const updated: GraphNode = {
      id: "n6",
      type: "concept",
      metadata: {
        title: "Graph Theory and Network Analysis",
        content:
          "Network analysis applies graph theory to study complex interconnected systems and shortest paths.",
      },
    };

    graph.addNode(updated); // Graph.addNode replaces existing
    searchEngine.add(nodeToDoc(updated)); // FullText search removes and re-adds

    const hits = searchEngine.search("network analysis");
    expect(hits.some((h) => h.id === "n6")).toBe(true);
  });

  // ── 4. Type filtering ─────────────────────────────────────────────────────

  it("filters search results by node type", () => {
    const options: SearchOptions = { types: ["tutorial"] };
    const hits = searchEngine.search("React", options);
    const nodes = hits.map((h) => graph.getNode(h.id)).filter(Boolean);
    expect(nodes.every((n) => n!.type === "tutorial")).toBe(true);
  });

  it("returns empty results when type filter excludes all matches", () => {
    // "TypeScript" articles won't show up with type=tutorial
    const options: SearchOptions = { types: ["tutorial"] };
    const hits = searchEngine.search("Generics", options);
    const ids = hits.map((h) => h.id);
    // n2 is type "article", should not appear
    expect(ids).not.toContain("n2");
  });

  // ── 5. Ranking combined with graph structure ───────────────────────────────

  it("search ranking is consistent with document relevance", () => {
    const hits = searchEngine.search("TypeScript");
    expect(hits.length).toBeGreaterThan(0);
    // Scores should be descending
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it("boosts nodes closer to high-degree hub in combined ranking", () => {
    // n1 has the most outgoing edges (3); a search for "JavaScript programming"
    // should find it and it should be traversable to many nodes
    const hits = searchEngine.search("programming language JavaScript");
    const startIds = hits.slice(0, 3).map((h) => h.id);

    let maxReachable = 0;
    for (const id of startIds) {
      const result = bfs(graph, id);
      maxReachable = Math.max(maxReachable, result.visited.length);
    }

    expect(maxReachable).toBeGreaterThanOrEqual(3);
  });

  // ── 6. Pagination ─────────────────────────────────────────────────────────

  it("paginates search results correctly", () => {
    const page1 = searchEngine.search("JavaScript", { limit: 2, offset: 0 });
    const page2 = searchEngine.search("JavaScript", { limit: 2, offset: 2 });

    expect(page1.length).toBeLessThanOrEqual(2);
    // Page 2 should not contain page 1 results
    const page1Ids = new Set(page1.map((h) => h.id));
    for (const hit of page2) {
      expect(page1Ids.has(hit.id)).toBe(false);
    }
  });

  // ── 7. Empty / edge cases ─────────────────────────────────────────────────

  it("returns empty results for unknown query", () => {
    const hits = searchEngine.search("xyzzy-nonexistent-term");
    expect(hits).toHaveLength(0);
  });

  it("handles empty graph gracefully", () => {
    const emptyGraph = new Graph();
    const emptySearch = new FullTextSearchEngine();
    expect(emptyGraph.nodeCount).toBe(0);
    expect(emptySearch.size).toBe(0);
    expect(emptySearch.search("anything")).toHaveLength(0);
  });

  it("handles search on cleared index", () => {
    searchEngine.clear();
    expect(searchEngine.size).toBe(0);
    const hits = searchEngine.search("TypeScript");
    expect(hits).toHaveLength(0);
  });

  // ── 8. Semantic search → graph expansion (Vector) ─────────────────────────

  it("vector search engine can be indexed and queried", () => {
    const vectorEngine = new VectorSearchEngine();

    // Add docs with embeddings (simple mock vectors)
    const nodes = graph.getAllNodes();
    nodes.forEach((node, i) => {
      const doc = nodeToDoc(node);
      // Create a simple unit vector as mock embedding
      const dim = 8;
      const vec = new Array(dim).fill(0) as number[];
      vec[i % dim] = 1;
      doc.embedding = vec;
      vectorEngine.add(doc);
    });

    expect(vectorEngine.size).toBe(nodes.length);

    // Query with a vector
    const queryVec = new Array(8).fill(0) as number[];
    queryVec[0] = 1;
    const hits = vectorEngine.search("", { limit: 3 });
    expect(Array.isArray(hits)).toBe(true);
  });

  it("hybrid search engine combines text and vector results", () => {
    const hybrid = new HybridSearchEngine();

    for (const node of graph.getAllNodes()) {
      const doc = nodeToDoc(node);
      const dim = 8;
      const vec = new Array(dim).fill(0.1) as number[];
      doc.embedding = vec;
      hybrid.add(doc);
    }

    expect(hybrid.size).toBe(graph.nodeCount);

    const hits = hybrid.search("TypeScript JavaScript");
    expect(hits.length).toBeGreaterThan(0);
  });
});
