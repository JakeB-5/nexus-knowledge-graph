export interface GraphNode {
  id: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
}

export type AdjacencyList = Map<string, Set<string>>;

export interface TraversalResult {
  visited: string[];
  paths: Map<string, string[]>;
  depth: Map<string, number>;
}

export interface PageRankResult {
  scores: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export interface Community {
  id: number;
  members: string[];
  modularity: number;
}
