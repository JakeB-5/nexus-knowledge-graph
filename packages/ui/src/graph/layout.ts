// Graph layout algorithms for the Nexus graph visualization

import type {
  VisualNode,
  VisualEdge,
  LayoutOptions,
  LayoutResult,
  Point,
} from './types.js';
import { PhysicsEngine, createPhysicsBody } from './physics.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface LayoutAlgorithm {
  readonly name: string;
  compute(
    nodes: VisualNode[],
    edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult;
  /** Incremental: place only newNodes without moving existing ones. */
  addNodes?(
    existing: LayoutResult,
    newNodes: VisualNode[],
    allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAdjacency(
  nodes: VisualNode[],
  edges: VisualEdge[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

function computeBoundingBox(positions: Map<string, Point>): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function centerPositions(
  positions: Map<string, Point>,
  cx: number,
  cy: number,
): void {
  const { minX, minY, maxX, maxY } = computeBoundingBox(positions);
  const ox = cx - (minX + maxX) / 2;
  const oy = cy - (minY + maxY) / 2;
  for (const p of positions.values()) {
    p.x += ox;
    p.y += oy;
  }
}

// ─── Force-Directed Layout ────────────────────────────────────────────────────

export class ForceDirectedLayout implements LayoutAlgorithm {
  readonly name = 'force';

  compute(
    nodes: VisualNode[],
    edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const engine = new PhysicsEngine({
      springLength: options.springLength ?? 120,
      springStrength: options.springStrength ?? 0.04,
      repulsionStrength: options.repulsionStrength ?? 8000,
      gravity: options.gravity ?? 0.05,
      damping: 0.85,
      maxVelocity: 400,
      minEnergy: 0.001,
      theta: 0.8,
      timeStep: 0.016,
    });

    const cx = options.width / 2;
    const cy = options.height / 2;

    // Initialize bodies with random positions in a circle
    for (let i = 0; i < nodes.length; i++) {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(options.width, options.height) * 0.3;
      const x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 10;
      const y = cy + Math.sin(angle) * r + (Math.random() - 0.5) * 10;
      engine.addBody(
        createPhysicsBody(
          nodes[i].id,
          x - cx,
          y - cy,
          nodes[i].mass ?? 1,
          nodes[i].radius,
          nodes[i].pinned ?? false,
        ),
      );
    }

    for (const edge of edges) {
      engine.addEdge({ source: edge.source, target: edge.target });
    }

    engine.start();
    engine.runToSettled(options.iterations ?? 300);

    const positions = new Map<string, Point>();
    for (const [id, pos] of engine.getPositions()) {
      positions.set(id, { x: pos.x + cx, y: pos.y + cy });
    }

    return { nodes: positions };
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const engine = new PhysicsEngine({
      springLength: options.springLength ?? 120,
      springStrength: options.springStrength ?? 0.04,
      repulsionStrength: options.repulsionStrength ?? 8000,
      gravity: options.gravity ?? 0.05,
      damping: 0.85,
      maxVelocity: 200,
      minEnergy: 0.005,
      theta: 0.8,
      timeStep: 0.016,
    });

    const cx = options.width / 2;
    const cy = options.height / 2;

    // Add existing nodes as pinned bodies
    for (const [id, pos] of existing.nodes) {
      engine.addBody(createPhysicsBody(id, pos.x - cx, pos.y - cy, 1, 20, true));
    }

    // Add new nodes around center of existing neighbors
    for (const node of newNodes) {
      const neighbors = allEdges
        .filter(e => e.source === node.id || e.target === node.id)
        .map(e => (e.source === node.id ? e.target : e.source))
        .filter(id => existing.nodes.has(id));

      let nx = (Math.random() - 0.5) * 200;
      let ny = (Math.random() - 0.5) * 200;

      if (neighbors.length > 0) {
        let sumX = 0, sumY = 0;
        for (const nid of neighbors) {
          const p = existing.nodes.get(nid)!;
          sumX += p.x - cx;
          sumY += p.y - cy;
        }
        nx = sumX / neighbors.length + (Math.random() - 0.5) * 60;
        ny = sumY / neighbors.length + (Math.random() - 0.5) * 60;
      }

      engine.addBody(
        createPhysicsBody(node.id, nx, ny, node.mass ?? 1, node.radius, false),
      );
    }

    for (const edge of allEdges) {
      engine.addEdge({ source: edge.source, target: edge.target });
    }

    engine.start();
    engine.runToSettled(150);

    const result = new Map<string, Point>(existing.nodes);
    for (const node of newNodes) {
      const pos = engine.bodies.get(node.id);
      if (pos) result.set(node.id, { x: pos.x + cx, y: pos.y + cy });
    }

    return { nodes: result };
  }
}

// ─── Circular Layout ──────────────────────────────────────────────────────────

export class CircularLayout implements LayoutAlgorithm {
  readonly name = 'circular';

  compute(
    nodes: VisualNode[],
    _edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const positions = new Map<string, Point>();
    if (nodes.length === 0) return { nodes: positions };

    const cx = options.width / 2;
    const cy = options.height / 2;
    const padding = options.padding ?? 60;
    const r = Math.min(options.width, options.height) / 2 - padding;
    const startAngle = options.startAngle ?? -Math.PI / 2;
    const n = nodes.length;

    for (let i = 0; i < n; i++) {
      const angle = startAngle + (2 * Math.PI * i) / n;
      positions.set(nodes[i].id, {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    }

    return { nodes: positions };
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    _allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    // Re-run full circular layout with all nodes
    const allIds = Array.from(existing.nodes.keys());
    const allNodes: VisualNode[] = [
      ...allIds.map(id => ({ id } as VisualNode)),
      ...newNodes,
    ];
    return this.compute(allNodes, [], options);
  }
}

// ─── Hierarchical Layout (Sugiyama-style) ─────────────────────────────────────

export class HierarchicalLayout implements LayoutAlgorithm {
  readonly name = 'hierarchical';

  compute(
    nodes: VisualNode[],
    edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const positions = new Map<string, Point>();
    if (nodes.length === 0) return { nodes: positions };

    const direction = options.direction ?? 'TB';
    const rankSep = options.rankSeparation ?? 120;
    const nodeSep = options.nodeSeparation ?? 80;

    // Step 1: Assign ranks using BFS/DFS from roots
    const ranks = this._assignRanks(nodes, edges);

    // Step 2: Group nodes by rank
    const rankGroups = new Map<number, string[]>();
    for (const [id, rank] of ranks) {
      if (!rankGroups.has(rank)) rankGroups.set(rank, []);
      rankGroups.get(rank)!.push(id);
    }

    // Step 3: Order nodes within ranks to minimize crossings (barycenter heuristic)
    this._minimizeCrossings(rankGroups, edges, 3);

    // Step 4: Assign coordinates
    const maxRank = Math.max(...ranks.values());
    const cx = options.width / 2;
    const cy = options.height / 2;

    for (const [rank, nodeIds] of rankGroups) {
      const count = nodeIds.length;
      const spanPerp = (count - 1) * nodeSep;

      for (let i = 0; i < count; i++) {
        const perpOffset = -spanPerp / 2 + i * nodeSep;
        const mainOffset = (rank / Math.max(1, maxRank)) * (maxRank * rankSep) - (maxRank * rankSep) / 2;

        let x: number, y: number;
        switch (direction) {
          case 'TB':
            x = cx + perpOffset;
            y = cy + mainOffset;
            break;
          case 'BT':
            x = cx + perpOffset;
            y = cy - mainOffset;
            break;
          case 'LR':
            x = cx + mainOffset;
            y = cy + perpOffset;
            break;
          case 'RL':
            x = cx - mainOffset;
            y = cy + perpOffset;
            break;
          default:
            x = cx + perpOffset;
            y = cy + mainOffset;
        }

        positions.set(nodeIds[i], { x, y });
      }
    }

    return { nodes: positions };
  }

  private _assignRanks(
    nodes: VisualNode[],
    edges: VisualEdge[],
  ): Map<string, number> {
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n.id, 0);
      outEdges.set(n.id, []);
    }

    for (const e of edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      outEdges.get(e.source)?.push(e.target);
    }

    // Kahn's topological sort with rank assignment
    const ranks = new Map<string, number>();
    const queue: string[] = [];

    for (const [id, deg] of inDegree) {
      if (deg === 0) { queue.push(id); ranks.set(id, 0); }
    }

    // Handle cycles: assign remaining nodes rank 0
    for (const n of nodes) {
      if (!ranks.has(n.id)) { queue.push(n.id); ranks.set(n.id, 0); }
    }

    const visited = new Set<string>();
    let qi = 0;
    while (qi < queue.length) {
      const id = queue[qi++];
      if (visited.has(id)) continue;
      visited.add(id);
      const rank = ranks.get(id) ?? 0;
      for (const neighbor of (outEdges.get(id) ?? [])) {
        const newRank = rank + 1;
        if (newRank > (ranks.get(neighbor) ?? 0)) {
          ranks.set(neighbor, newRank);
        }
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    return ranks;
  }

  private _minimizeCrossings(
    rankGroups: Map<number, string[]>,
    edges: VisualEdge[],
    passes: number,
  ): void {
    const edgeIndex = new Map<string, string[]>();
    for (const e of edges) {
      if (!edgeIndex.has(e.source)) edgeIndex.set(e.source, []);
      edgeIndex.get(e.source)!.push(e.target);
    }

    for (let pass = 0; pass < passes; pass++) {
      const ranks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
      for (const rank of ranks) {
        const nodes = rankGroups.get(rank)!;
        const posMap = new Map<string, number>();
        for (let i = 0; i < nodes.length; i++) posMap.set(nodes[i], i);

        // Barycenter sort
        const barycenters = nodes.map(id => {
          const neighbors = edgeIndex.get(id) ?? [];
          if (neighbors.length === 0) return { id, bc: posMap.get(id) ?? 0 };
          let sum = 0;
          let count = 0;
          for (const nb of neighbors) {
            if (posMap.has(nb)) { sum += posMap.get(nb)!; count++; }
          }
          return { id, bc: count > 0 ? sum / count : posMap.get(id) ?? 0 };
        });

        barycenters.sort((a, b) => a.bc - b.bc);
        rankGroups.set(rank, barycenters.map(b => b.id));
      }
    }
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const allNodes: VisualNode[] = [
      ...Array.from(existing.nodes.keys()).map(id => ({ id } as VisualNode)),
      ...newNodes,
    ];
    return this.compute(allNodes, allEdges, options);
  }
}

// ─── Grid Layout ─────────────────────────────────────────────────────────────

export class GridLayout implements LayoutAlgorithm {
  readonly name = 'grid';

  compute(
    nodes: VisualNode[],
    _edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const positions = new Map<string, Point>();
    if (nodes.length === 0) return { nodes: positions };

    const n = nodes.length;
    const cols = options.columns ?? Math.ceil(Math.sqrt(n));
    const cellW = options.cellWidth ?? 100;
    const cellH = options.cellHeight ?? 100;

    const totalWidth = cols * cellW;
    const totalHeight = Math.ceil(n / cols) * cellH;
    const startX = options.width / 2 - totalWidth / 2 + cellW / 2;
    const startY = options.height / 2 - totalHeight / 2 + cellH / 2;

    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(nodes[i].id, {
        x: startX + col * cellW,
        y: startY + row * cellH,
      });
    }

    return { nodes: positions };
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    _allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const allNodes: VisualNode[] = [
      ...Array.from(existing.nodes.keys()).map(id => ({ id } as VisualNode)),
      ...newNodes,
    ];
    return this.compute(allNodes, [], options);
  }
}

// ─── Radial Layout ────────────────────────────────────────────────────────────

export class RadialLayout implements LayoutAlgorithm {
  readonly name = 'radial';

  compute(
    nodes: VisualNode[],
    edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const positions = new Map<string, Point>();
    if (nodes.length === 0) return { nodes: positions };

    const cx = options.width / 2;
    const cy = options.height / 2;
    const levelSpacing = options.levelSpacing ?? 100;

    // Determine center node
    let centerNodeId = options.centerNodeId ?? nodes[0].id;
    if (!nodes.find(n => n.id === centerNodeId)) {
      centerNodeId = nodes[0].id;
    }

    // BFS from center to assign levels
    const adj = buildAdjacency(nodes, edges);
    const levels = new Map<string, number>();
    const queue: string[] = [centerNodeId];
    levels.set(centerNodeId, 0);

    let qi = 0;
    while (qi < queue.length) {
      const id = queue[qi++];
      const level = levels.get(id)!;
      for (const neighbor of (adj.get(id) ?? [])) {
        if (!levels.has(neighbor)) {
          levels.set(neighbor, level + 1);
          queue.push(neighbor);
        }
      }
    }

    // Assign disconnected nodes to outermost ring
    const maxLevel = Math.max(0, ...levels.values());
    for (const n of nodes) {
      if (!levels.has(n.id)) levels.set(n.id, maxLevel + 1);
    }

    // Group by level
    const levelGroups = new Map<number, string[]>();
    for (const [id, level] of levels) {
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(id);
    }

    // Place center
    positions.set(centerNodeId, { x: cx, y: cy });

    // Place other levels on concentric circles
    for (const [level, nodeIds] of levelGroups) {
      if (level === 0) continue;
      const r = level * levelSpacing;
      const n = nodeIds.length;
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        positions.set(nodeIds[i], {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }
    }

    return { nodes: positions };
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const allNodes: VisualNode[] = [
      ...Array.from(existing.nodes.keys()).map(id => ({ id } as VisualNode)),
      ...newNodes,
    ];
    return this.compute(allNodes, allEdges, options);
  }
}

// ─── Layout Registry ──────────────────────────────────────────────────────────

export class LayoutEngine {
  private _algorithms: Map<string, LayoutAlgorithm> = new Map();

  constructor() {
    this.register(new ForceDirectedLayout());
    this.register(new CircularLayout());
    this.register(new HierarchicalLayout());
    this.register(new GridLayout());
    this.register(new RadialLayout());
  }

  register(algo: LayoutAlgorithm): void {
    this._algorithms.set(algo.name, algo);
  }

  get(name: string): LayoutAlgorithm | undefined {
    return this._algorithms.get(name);
  }

  compute(
    nodes: VisualNode[],
    edges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const algo = this._algorithms.get(options.type);
    if (!algo) throw new Error(`Unknown layout: ${options.type}`);
    return algo.compute(nodes, edges, options);
  }

  addNodes(
    existing: LayoutResult,
    newNodes: VisualNode[],
    allEdges: VisualEdge[],
    options: LayoutOptions,
  ): LayoutResult {
    const algo = this._algorithms.get(options.type);
    if (!algo) throw new Error(`Unknown layout: ${options.type}`);
    if (algo.addNodes) {
      return algo.addNodes(existing, newNodes, allEdges, options);
    }
    // Fallback: full recompute
    const all: VisualNode[] = [
      ...Array.from(existing.nodes.keys()).map(id => ({ id } as VisualNode)),
      ...newNodes,
    ];
    return algo.compute(all, allEdges, options);
  }

  get algorithmNames(): string[] {
    return Array.from(this._algorithms.keys());
  }
}
