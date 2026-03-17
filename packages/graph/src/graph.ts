import type { GraphNode, GraphEdge, AdjacencyList } from "./types.js";

export class Graph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private outgoing: AdjacencyList = new Map();
  private incoming: AdjacencyList = new Map();
  private edgeIndex: Map<string, string[]> = new Map();

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoing.has(node.id)) {
      this.outgoing.set(node.id, new Set());
    }
    if (!this.incoming.has(node.id)) {
      this.incoming.set(node.id, new Set());
    }
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;

    // Remove all edges connected to this node
    const edgesToRemove = this.getEdgesForNode(id);
    for (const edge of edgesToRemove) {
      this.removeEdge(edge.id);
    }

    this.nodes.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    return true;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source node ${edge.source} not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target node ${edge.target} not found`);
    }

    this.edges.set(edge.id, edge);
    this.outgoing.get(edge.source)!.add(edge.target);
    this.incoming.get(edge.target)!.add(edge.source);

    // Index edges by source-target pair
    const key = `${edge.source}:${edge.target}`;
    const existing = this.edgeIndex.get(key) ?? [];
    existing.push(edge.id);
    this.edgeIndex.set(key, existing);
  }

  removeEdge(id: string): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;

    this.edges.delete(id);

    const key = `${edge.source}:${edge.target}`;
    const indexed = this.edgeIndex.get(key);
    if (indexed) {
      const filtered = indexed.filter((eid) => eid !== id);
      if (filtered.length === 0) {
        this.edgeIndex.delete(key);
        this.outgoing.get(edge.source)?.delete(edge.target);
        this.incoming.get(edge.target)?.delete(edge.source);
      } else {
        this.edgeIndex.set(key, filtered);
      }
    }

    return true;
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  getEdgesBetween(sourceId: string, targetId: string): GraphEdge[] {
    const key = `${sourceId}:${targetId}`;
    const edgeIds = this.edgeIndex.get(key) ?? [];
    return edgeIds
      .map((id) => this.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  getEdgesForNode(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(
      (e) => e.source === nodeId || e.target === nodeId,
    );
  }

  getNeighbors(
    nodeId: string,
    direction: "outgoing" | "incoming" | "both" = "both",
  ): string[] {
    const neighbors = new Set<string>();

    if (direction === "outgoing" || direction === "both") {
      const out = this.outgoing.get(nodeId);
      if (out) out.forEach((n) => neighbors.add(n));
    }

    if (direction === "incoming" || direction === "both") {
      const inc = this.incoming.get(nodeId);
      if (inc) inc.forEach((n) => neighbors.add(n));
    }

    return Array.from(neighbors);
  }

  getOutgoingAdjacencyList(): AdjacencyList {
    return new Map(
      Array.from(this.outgoing.entries()).map(([k, v]) => [k, new Set(v)]),
    );
  }

  getIncomingAdjacencyList(): AdjacencyList {
    return new Map(
      Array.from(this.incoming.entries()).map(([k, v]) => [k, new Set(v)]),
    );
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.edgeIndex.clear();
  }

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: this.getAllNodes(),
      edges: Array.from(this.edges.values()),
    };
  }

  static fromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): Graph {
    const graph = new Graph();
    for (const node of data.nodes) {
      graph.addNode(node);
    }
    for (const edge of data.edges) {
      graph.addEdge(edge);
    }
    return graph;
  }
}
