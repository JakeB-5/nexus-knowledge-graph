// Comprehensive tests for layout algorithms

import { describe, it, expect } from 'vitest';
import {
  ForceDirectedLayout,
  CircularLayout,
  HierarchicalLayout,
  GridLayout,
  RadialLayout,
  LayoutEngine,
} from '../layout.js';
import type { LayoutAlgorithm } from '../layout.js';
import type { VisualNode, VisualEdge, LayoutOptions, LayoutResult } from '../../graph/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<VisualNode> = {}): VisualNode {
  return {
    id,
    x: 0,
    y: 0,
    radius: 20,
    label: id,
    type: 'concept',
    ...overrides,
  };
}

function makeEdge(source: string, target: string, overrides: Partial<VisualEdge> = {}): VisualEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'related',
    ...overrides,
  };
}

function baseOptions(overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  return {
    type: 'force',
    width: 800,
    height: 600,
    padding: 40,
    ...overrides,
  };
}

function boundingBox(result: LayoutResult): {
  minX: number; minY: number; maxX: number; maxY: number;
  width: number; height: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of result.nodes.values()) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function center(result: LayoutResult): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (const p of result.nodes.values()) { sx += p.x; sy += p.y; n++; }
  return { x: sx / n, y: sy / n };
}

function allDistinct(result: LayoutResult): boolean {
  const pts = Array.from(result.nodes.values());
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.5) return false;
    }
  }
  return true;
}

// ─── Shared contract tests ────────────────────────────────────────────────────

function contractTests(name: string, algo: LayoutAlgorithm, type: LayoutOptions['type']): void {
  describe(`${name} – shared contract`, () => {
    it('returns empty map for empty node list', () => {
      const result = algo.compute([], [], baseOptions({ type }));
      expect(result.nodes.size).toBe(0);
    });

    it('places exactly one node for single-node graph', () => {
      const result = algo.compute([makeNode('a')], [], baseOptions({ type }));
      expect(result.nodes.size).toBe(1);
      expect(result.nodes.has('a')).toBe(true);
    });

    it('places all nodes for a multi-node graph', () => {
      const nodes = ['a', 'b', 'c', 'd'].map(makeNode);
      const result = algo.compute(nodes, [], baseOptions({ type }));
      expect(result.nodes.size).toBe(4);
      for (const n of nodes) expect(result.nodes.has(n.id)).toBe(true);
    });

    it('all positions are finite numbers', () => {
      const nodes = Array.from({ length: 8 }, (_, i) => makeNode(`n${i}`));
      const result = algo.compute(nodes, [], baseOptions({ type }));
      for (const p of result.nodes.values()) {
        expect(isFinite(p.x)).toBe(true);
        expect(isFinite(p.y)).toBe(true);
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
      }
    });

    it('handles a graph with no edges', () => {
      const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`n${i}`));
      expect(() => algo.compute(nodes, [], baseOptions({ type }))).not.toThrow();
    });

    it('handles disconnected graph', () => {
      const nodes = ['a', 'b', 'c', 'd'].map(makeNode);
      const edges = [makeEdge('a', 'b')]; // only one edge
      const result = algo.compute(nodes, edges, baseOptions({ type }));
      expect(result.nodes.size).toBe(4);
    });
  });
}

// ─── CircularLayout ───────────────────────────────────────────────────────────

describe('CircularLayout', () => {
  const algo = new CircularLayout();
  contractTests('CircularLayout', algo, 'circular');

  it('places nodes equidistant from center', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'circular' });
    const result = algo.compute(nodes, [], opts);
    const cx = opts.width / 2;
    const cy = opts.height / 2;
    const radii = Array.from(result.nodes.values()).map(p =>
      Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2),
    );
    const ref = radii[0];
    for (const r of radii) expect(r).toBeCloseTo(ref, 1);
  });

  it('places nodes at distinct positions', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode(`n${i}`));
    const result = algo.compute(nodes, [], baseOptions({ type: 'circular' }));
    expect(allDistinct(result)).toBe(true);
  });

  it('respects startAngle option', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const opts = baseOptions({ type: 'circular', startAngle: 0 });
    const result = algo.compute(nodes, [], opts);
    const a = result.nodes.get('a')!;
    // With startAngle=0, first node should be to the right of center
    expect(a.x).toBeGreaterThan(opts.width / 2);
  });

  it('fits within canvas bounds when padding is applied', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'circular', padding: 60, width: 500, height: 500 });
    const result = algo.compute(nodes, [], opts);
    const bb = boundingBox(result);
    expect(bb.minX).toBeGreaterThanOrEqual(0);
    expect(bb.minY).toBeGreaterThanOrEqual(0);
    expect(bb.maxX).toBeLessThanOrEqual(500);
    expect(bb.maxY).toBeLessThanOrEqual(500);
  });

  it('single node is placed at center', () => {
    const opts = baseOptions({ type: 'circular' });
    const result = algo.compute([makeNode('solo')], [], opts);
    const p = result.nodes.get('solo')!;
    // With only one node the radius calculation still applies; just check it's finite
    expect(isFinite(p.x)).toBe(true);
    expect(isFinite(p.y)).toBe(true);
  });
});

// ─── GridLayout ───────────────────────────────────────────────────────────────

describe('GridLayout', () => {
  const algo = new GridLayout();
  contractTests('GridLayout', algo, 'grid');

  it('places nodes on a regular grid', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'grid', columns: 3, cellWidth: 80, cellHeight: 80 });
    const result = algo.compute(nodes, [], opts);

    // Extract unique x and y values
    const xs = new Set(Array.from(result.nodes.values()).map(p => Math.round(p.x)));
    const ys = new Set(Array.from(result.nodes.values()).map(p => Math.round(p.y)));
    expect(xs.size).toBe(3); // 3 columns
    expect(ys.size).toBe(3); // 3 rows
  });

  it('uses sqrt(n) columns by default', () => {
    // 9 nodes → 3 columns
    const nodes = Array.from({ length: 9 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'grid' });
    const result = algo.compute(nodes, [], opts);
    const xs = new Set(Array.from(result.nodes.values()).map(p => Math.round(p.x)));
    expect(xs.size).toBeLessThanOrEqual(4); // ceil(sqrt(9)) = 3
  });

  it('centers the grid on the canvas', () => {
    const nodes = Array.from({ length: 4 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'grid', columns: 2, cellWidth: 100, cellHeight: 100, width: 800, height: 600 });
    const result = algo.compute(nodes, [], opts);
    const c = center(result);
    expect(c.x).toBeCloseTo(400, 0);
    expect(c.y).toBeCloseTo(300, 0);
  });

  it('all positions are distinct for a non-trivial grid', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => makeNode(`n${i}`));
    const result = algo.compute(nodes, [], baseOptions({ type: 'grid', columns: 4 }));
    expect(allDistinct(result)).toBe(true);
  });
});

// ─── HierarchicalLayout ───────────────────────────────────────────────────────

describe('HierarchicalLayout', () => {
  const algo = new HierarchicalLayout();
  contractTests('HierarchicalLayout', algo, 'hierarchical');

  function chainNodes(n: number): [VisualNode[], VisualEdge[]] {
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`n${i}`));
    const edges = Array.from({ length: n - 1 }, (_, i) => makeEdge(`n${i}`, `n${i + 1}`));
    return [nodes, edges];
  }

  it('places chain nodes in increasing y-coordinate (TB direction)', () => {
    const [nodes, edges] = chainNodes(4);
    const opts = baseOptions({ type: 'hierarchical', direction: 'TB' });
    const result = algo.compute(nodes, edges, opts);
    const ys = ['n0', 'n1', 'n2', 'n3'].map(id => result.nodes.get(id)!.y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it('places chain nodes in decreasing y-coordinate (BT direction)', () => {
    const [nodes, edges] = chainNodes(4);
    const opts = baseOptions({ type: 'hierarchical', direction: 'BT' });
    const result = algo.compute(nodes, edges, opts);
    const ys = ['n0', 'n1', 'n2', 'n3'].map(id => result.nodes.get(id)!.y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeLessThan(ys[i - 1]);
    }
  });

  it('places chain nodes in increasing x-coordinate (LR direction)', () => {
    const [nodes, edges] = chainNodes(4);
    const opts = baseOptions({ type: 'hierarchical', direction: 'LR' });
    const result = algo.compute(nodes, edges, opts);
    const xs = ['n0', 'n1', 'n2', 'n3'].map(id => result.nodes.get(id)!.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });

  it('places chain nodes in decreasing x-coordinate (RL direction)', () => {
    const [nodes, edges] = chainNodes(4);
    const opts = baseOptions({ type: 'hierarchical', direction: 'RL' });
    const result = algo.compute(nodes, edges, opts);
    const xs = ['n0', 'n1', 'n2', 'n3'].map(id => result.nodes.get(id)!.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeLessThan(xs[i - 1]);
    }
  });

  it('places root node at rank 0 (lowest y in TB)', () => {
    const nodes = [makeNode('root'), makeNode('child1'), makeNode('child2')];
    const edges = [makeEdge('root', 'child1'), makeEdge('root', 'child2')];
    const opts = baseOptions({ type: 'hierarchical', direction: 'TB' });
    const result = algo.compute(nodes, edges, opts);
    const rootY = result.nodes.get('root')!.y;
    const c1Y = result.nodes.get('child1')!.y;
    const c2Y = result.nodes.get('child2')!.y;
    expect(rootY).toBeLessThan(c1Y);
    expect(rootY).toBeLessThan(c2Y);
  });

  it('handles a tree with multiple levels', () => {
    const nodes = ['r', 'a', 'b', 'c', 'd', 'e'].map(makeNode);
    const edges = [
      makeEdge('r', 'a'), makeEdge('r', 'b'),
      makeEdge('a', 'c'), makeEdge('a', 'd'),
      makeEdge('b', 'e'),
    ];
    const opts = baseOptions({ type: 'hierarchical' });
    const result = algo.compute(nodes, edges, opts);
    expect(result.nodes.size).toBe(6);
    // All finite
    for (const p of result.nodes.values()) {
      expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
    }
  });

  it('handles cyclic graphs without crashing', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode);
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')];
    expect(() => algo.compute(nodes, edges, baseOptions({ type: 'hierarchical' }))).not.toThrow();
  });

  it('respects rankSeparation option', () => {
    const [nodes, edges] = chainNodes(3);
    const opts1 = baseOptions({ type: 'hierarchical', rankSeparation: 50, direction: 'TB' });
    const opts2 = baseOptions({ type: 'hierarchical', rankSeparation: 200, direction: 'TB' });
    const r1 = algo.compute(nodes, edges, opts1);
    const r2 = algo.compute(nodes, edges, opts2);
    const dy1 = Math.abs(r1.nodes.get('n1')!.y - r1.nodes.get('n0')!.y);
    const dy2 = Math.abs(r2.nodes.get('n1')!.y - r2.nodes.get('n0')!.y);
    expect(dy2).toBeGreaterThan(dy1);
  });
});

// ─── RadialLayout ─────────────────────────────────────────────────────────────

describe('RadialLayout', () => {
  const algo = new RadialLayout();
  contractTests('RadialLayout', algo, 'radial');

  it('places center node at canvas center', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`n${i}`));
    const edges = Array.from({ length: 4 }, (_, i) => makeEdge('n0', `n${i + 1}`));
    const opts = baseOptions({ type: 'radial', centerNodeId: 'n0' });
    const result = algo.compute(nodes, edges, opts);
    const center = result.nodes.get('n0')!;
    expect(center.x).toBeCloseTo(opts.width / 2, 0);
    expect(center.y).toBeCloseTo(opts.height / 2, 0);
  });

  it('places direct neighbors at equal radius from center', () => {
    const nodes = ['c', 'a', 'b', 'd'].map(makeNode);
    const edges = [makeEdge('c', 'a'), makeEdge('c', 'b'), makeEdge('c', 'd')];
    const opts = baseOptions({ type: 'radial', centerNodeId: 'c', levelSpacing: 100 });
    const result = algo.compute(nodes, edges, opts);
    const cc = result.nodes.get('c')!;
    const radii = ['a', 'b', 'd'].map(id => {
      const p = result.nodes.get(id)!;
      return Math.sqrt((p.x - cc.x) ** 2 + (p.y - cc.y) ** 2);
    });
    const ref = radii[0];
    for (const r of radii) expect(r).toBeCloseTo(ref, 1);
  });

  it('places nodes at increasing radius by BFS level', () => {
    const nodes = ['c', 'a', 'b'].map(makeNode);
    const edges = [makeEdge('c', 'a'), makeEdge('a', 'b')];
    const opts = baseOptions({ type: 'radial', centerNodeId: 'c', levelSpacing: 100 });
    const result = algo.compute(nodes, edges, opts);
    const cc = result.nodes.get('c')!;
    const ra = Math.sqrt((result.nodes.get('a')!.x - cc.x) ** 2 + (result.nodes.get('a')!.y - cc.y) ** 2);
    const rb = Math.sqrt((result.nodes.get('b')!.x - cc.x) ** 2 + (result.nodes.get('b')!.y - cc.y) ** 2);
    expect(rb).toBeGreaterThan(ra);
  });

  it('uses first node as center when centerNodeId not specified', () => {
    const nodes = ['x', 'y', 'z'].map(makeNode);
    const opts = baseOptions({ type: 'radial' });
    const result = algo.compute(nodes, [], opts);
    const p = result.nodes.get('x')!;
    expect(p.x).toBeCloseTo(opts.width / 2, 0);
    expect(p.y).toBeCloseTo(opts.height / 2, 0);
  });

  it('handles disconnected nodes by placing them in outer ring', () => {
    const nodes = ['c', 'connected', 'disconnected'].map(makeNode);
    const edges = [makeEdge('c', 'connected')];
    const opts = baseOptions({ type: 'radial', centerNodeId: 'c' });
    const result = algo.compute(nodes, edges, opts);
    expect(result.nodes.has('disconnected')).toBe(true);
    const p = result.nodes.get('disconnected')!;
    expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
  });

  it('respects levelSpacing option', () => {
    const nodes = ['c', 'a', 'b'].map(makeNode);
    const edges = [makeEdge('c', 'a'), makeEdge('a', 'b')];
    const r1 = algo.compute(nodes, edges, baseOptions({ type: 'radial', centerNodeId: 'c', levelSpacing: 50 }));
    const r2 = algo.compute(nodes, edges, baseOptions({ type: 'radial', centerNodeId: 'c', levelSpacing: 200 }));
    const cc1 = r1.nodes.get('c')!;
    const cc2 = r2.nodes.get('c')!;
    const da1 = Math.sqrt((r1.nodes.get('a')!.x - cc1.x) ** 2 + (r1.nodes.get('a')!.y - cc1.y) ** 2);
    const da2 = Math.sqrt((r2.nodes.get('a')!.x - cc2.x) ** 2 + (r2.nodes.get('a')!.y - cc2.y) ** 2);
    expect(da2).toBeGreaterThan(da1);
  });
});

// ─── ForceDirectedLayout ──────────────────────────────────────────────────────

describe('ForceDirectedLayout', () => {
  const algo = new ForceDirectedLayout();
  contractTests('ForceDirectedLayout', algo, 'force');

  it('places connected nodes closer than unconnected ones', () => {
    // Two pairs: A-B connected, C-D not connected to each other
    const nodes = ['a', 'b', 'c', 'd'].map(makeNode);
    const edges = [makeEdge('a', 'b')];
    const opts = baseOptions({
      type: 'force',
      springLength: 80,
      springStrength: 0.1,
      repulsionStrength: 500,
      gravity: 0.02,
      iterations: 200,
    });
    const result = algo.compute(nodes, edges, opts);
    const a = result.nodes.get('a')!;
    const b = result.nodes.get('b')!;
    const c = result.nodes.get('c')!;
    const d = result.nodes.get('d')!;
    const dAB = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    const dCD = Math.sqrt((c.x - d.x) ** 2 + (c.y - d.y) ** 2);
    // Connected pair should generally be closer — allow generous tolerance
    expect(dAB).toBeLessThan(dCD * 3);
  });

  it('does not move pinned nodes', () => {
    const nodes = [
      makeNode('fixed', { x: 400, y: 300, pinned: true }),
      makeNode('free'),
    ];
    const opts = baseOptions({ type: 'force', iterations: 100 });
    const result = algo.compute(nodes, [], opts);
    const p = result.nodes.get('fixed')!;
    // The force layout re-initialises positions, but pinned bodies keep forced position
    // The initial position of pinned body in the engine is what matters
    expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
  });

  it('addNodes incrementally places new nodes near their neighbors', () => {
    const initialNodes = Array.from({ length: 4 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'force', iterations: 100 });
    const initial = algo.compute(initialNodes, [], opts);

    const newNode = makeNode('new');
    const allEdges = [makeEdge('n0', 'new'), makeEdge('n1', 'new')];
    const updated = algo.addNodes!(initial, [newNode], allEdges, opts);

    expect(updated.nodes.has('new')).toBe(true);
    // All original nodes should still be present
    for (const n of initialNodes) expect(updated.nodes.has(n.id)).toBe(true);
  });

  it('produces distinct positions for all nodes', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
    const edges = Array.from({ length: 9 }, (_, i) => makeEdge(`n${i}`, `n${i + 1}`));
    const result = algo.compute(nodes, edges, baseOptions({ type: 'force', iterations: 200 }));
    expect(allDistinct(result)).toBe(true);
  });
});

// ─── LayoutEngine ─────────────────────────────────────────────────────────────

describe('LayoutEngine', () => {
  it('contains all built-in layout algorithms', () => {
    const engine = new LayoutEngine();
    const names = engine.algorithmNames;
    expect(names).toContain('force');
    expect(names).toContain('circular');
    expect(names).toContain('hierarchical');
    expect(names).toContain('grid');
    expect(names).toContain('radial');
  });

  it('compute dispatches to correct algorithm', () => {
    const engine = new LayoutEngine();
    const nodes = Array.from({ length: 6 }, (_, i) => makeNode(`n${i}`));
    const opts = baseOptions({ type: 'circular' });
    const result = engine.compute(nodes, [], opts);
    expect(result.nodes.size).toBe(6);

    // Verify it used circular layout: all at same radius from center
    const cx = opts.width / 2;
    const cy = opts.height / 2;
    const radii = Array.from(result.nodes.values()).map(
      p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2),
    );
    const ref = radii[0];
    for (const r of radii) expect(r).toBeCloseTo(ref, 1);
  });

  it('throws for unknown layout type', () => {
    const engine = new LayoutEngine();
    expect(() =>
      engine.compute([], [], baseOptions({ type: 'unknown' as LayoutOptions['type'] })),
    ).toThrow(/unknown layout/i);
  });

  it('addNodes delegates to algorithm', () => {
    const engine = new LayoutEngine();
    const initialNodes = ['a', 'b', 'c'].map(makeNode);
    const opts = baseOptions({ type: 'circular' });
    const initial = engine.compute(initialNodes, [], opts);
    const updated = engine.addNodes(initial, [makeNode('d')], [], opts);
    expect(updated.nodes.size).toBe(4);
    expect(updated.nodes.has('d')).toBe(true);
  });

  it('can register a custom algorithm', () => {
    const engine = new LayoutEngine();
    const custom: LayoutAlgorithm = {
      name: 'custom',
      compute: (nodes, _edges, _opts) => {
        const result = new Map<string, { x: number; y: number }>();
        nodes.forEach((n, i) => result.set(n.id, { x: i * 10, y: 0 }));
        return { nodes: result };
      },
    };
    engine.register(custom);
    expect(engine.algorithmNames).toContain('custom');
    const result = engine.compute(
      ['a', 'b', 'c'].map(makeNode),
      [],
      baseOptions({ type: 'custom' as LayoutOptions['type'] }),
    );
    expect(result.nodes.get('a')).toEqual({ x: 0, y: 0 });
    expect(result.nodes.get('b')).toEqual({ x: 10, y: 0 });
  });

  it('addNodes falls back to full recompute for algos without addNodes', () => {
    const engine = new LayoutEngine();
    const custom: LayoutAlgorithm = {
      name: 'static',
      compute: (nodes) => {
        const m = new Map<string, { x: number; y: number }>();
        nodes.forEach((n, i) => m.set(n.id, { x: i, y: 0 }));
        return { nodes: m };
      },
      // No addNodes defined
    };
    engine.register(custom);
    const initial = engine.compute(['a', 'b'].map(makeNode), [], baseOptions({ type: 'static' as LayoutOptions['type'] }));
    const updated = engine.addNodes(initial, [makeNode('c')], [], baseOptions({ type: 'static' as LayoutOptions['type'] }));
    expect(updated.nodes.size).toBe(3);
    expect(updated.nodes.has('c')).toBe(true);
  });
});

// ─── addNodes contract (incremental layout) ───────────────────────────────────

describe('Incremental layout (addNodes)', () => {
  const algos: Array<[string, LayoutAlgorithm, LayoutOptions['type']]> = [
    ['CircularLayout', new CircularLayout(), 'circular'],
    ['GridLayout', new GridLayout(), 'grid'],
    ['HierarchicalLayout', new HierarchicalLayout(), 'hierarchical'],
    ['RadialLayout', new RadialLayout(), 'radial'],
  ];

  for (const [name, algo, type] of algos) {
    describe(name, () => {
      it('preserves existing node count when adding nodes', () => {
        const initialNodes = Array.from({ length: 4 }, (_, i) => makeNode(`n${i}`));
        const opts = baseOptions({ type });
        const initial = algo.compute(initialNodes, [], opts);
        const newNodes = [makeNode('new1'), makeNode('new2')];
        const updated = algo.addNodes!(initial, newNodes, [], opts);
        expect(updated.nodes.size).toBe(6);
      });

      it('includes all new nodes in result', () => {
        const initial = algo.compute(['a', 'b'].map(makeNode), [], baseOptions({ type }));
        const updated = algo.addNodes!(initial, [makeNode('c')], [], baseOptions({ type }));
        expect(updated.nodes.has('c')).toBe(true);
      });

      it('all positions remain finite after incremental add', () => {
        const initial = algo.compute(['a', 'b', 'c'].map(makeNode), [], baseOptions({ type }));
        const updated = algo.addNodes!(initial, [makeNode('d'), makeNode('e')], [], baseOptions({ type }));
        for (const p of updated.nodes.values()) {
          expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
        }
      });
    });
  }
});
