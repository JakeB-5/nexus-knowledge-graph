// Physics simulation engine for force-directed graph layout

import type { PhysicsBody, PhysicsOptions } from './types.js';

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PHYSICS_OPTIONS: PhysicsOptions = {
  springLength: 120,
  springStrength: 0.04,
  repulsionStrength: 8000,
  gravity: 0.05,
  damping: 0.85,
  maxVelocity: 400,
  minEnergy: 0.001,
  theta: 0.8,
  timeStep: 0.016,
  collisionRadius: 5,
};

// ─── Barnes-Hut Quadtree ──────────────────────────────────────────────────────

interface QuadNode {
  x: number;
  y: number;
  width: number;
  height: number;
  mass: number;
  cx: number; // center of mass x
  cy: number; // center of mass y
  body: PhysicsBody | null;
  nw: QuadNode | null;
  ne: QuadNode | null;
  sw: QuadNode | null;
  se: QuadNode | null;
}

function createQuadNode(
  x: number, y: number, width: number, height: number,
): QuadNode {
  return { x, y, width, height, mass: 0, cx: 0, cy: 0, body: null, nw: null, ne: null, sw: null, se: null };
}

function insertBody(node: QuadNode, body: PhysicsBody): void {
  if (node.mass === 0) {
    // Empty leaf: store body here
    node.body = body;
    node.mass = body.mass;
    node.cx = body.x;
    node.cy = body.y;
    return;
  }

  // Update center of mass
  const totalMass = node.mass + body.mass;
  node.cx = (node.cx * node.mass + body.x * body.mass) / totalMass;
  node.cy = (node.cy * node.mass + body.y * body.mass) / totalMass;
  node.mass = totalMass;

  if (node.body !== null) {
    // Internal node: push existing body down
    const existing = node.body;
    node.body = null;
    insertIntoChild(node, existing);
  }

  insertIntoChild(node, body);
}

function insertIntoChild(node: QuadNode, body: PhysicsBody): void {
  const midX = node.x + node.width / 2;
  const midY = node.y + node.height / 2;
  const isWest = body.x < midX;
  const isNorth = body.y < midY;

  if (isNorth && isWest) {
    if (!node.nw) node.nw = createQuadNode(node.x, node.y, node.width / 2, node.height / 2);
    insertBody(node.nw, body);
  } else if (isNorth && !isWest) {
    if (!node.ne) node.ne = createQuadNode(midX, node.y, node.width / 2, node.height / 2);
    insertBody(node.ne, body);
  } else if (!isNorth && isWest) {
    if (!node.sw) node.sw = createQuadNode(node.x, midY, node.width / 2, node.height / 2);
    insertBody(node.sw, body);
  } else {
    if (!node.se) node.se = createQuadNode(midX, midY, node.width / 2, node.height / 2);
    insertBody(node.se, body);
  }
}

function computeRepulsion(
  node: QuadNode,
  body: PhysicsBody,
  repulsion: number,
  theta: number,
): [number, number] {
  if (node.mass === 0) return [0, 0];

  const dx = body.x - node.cx;
  const dy = body.y - node.cy;
  const distSq = dx * dx + dy * dy;
  if (distSq < 0.0001) return [0, 0];

  // Barnes-Hut criterion: use approximation if node is far enough
  const s = Math.max(node.width, node.height);
  if (node.body === body) return [0, 0];

  if (node.body !== null || (s * s) / distSq < theta * theta) {
    // Treat as single mass
    const dist = Math.sqrt(distSq);
    const force = (repulsion * node.mass * body.mass) / distSq;
    return [force * (dx / dist), force * (dy / dist)];
  }

  // Recurse into children
  let fx = 0, fy = 0;
  const children = [node.nw, node.ne, node.sw, node.se];
  for (const child of children) {
    if (child) {
      const [cfx, cfy] = computeRepulsion(child, body, repulsion, theta);
      fx += cfx;
      fy += cfy;
    }
  }
  return [fx, fy];
}

// ─── Physics Engine ───────────────────────────────────────────────────────────

export interface SpringEdge {
  source: string;
  target: string;
  length?: number;
}

export class PhysicsEngine {
  private _bodies: Map<string, PhysicsBody> = new Map();
  private _edges: SpringEdge[] = [];
  private _options: PhysicsOptions;
  private _energy: number = Infinity;
  private _temperature: number = 1.0;
  private _stepCount: number = 0;
  private _running: boolean = false;

  constructor(options: Partial<PhysicsOptions> = {}) {
    this._options = { ...DEFAULT_PHYSICS_OPTIONS, ...options };
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  addBody(body: PhysicsBody): void {
    this._bodies.set(body.id, body);
  }

  removeBody(id: string): void {
    this._bodies.delete(id);
    this._edges = this._edges.filter(e => e.source !== id && e.target !== id);
  }

  addEdge(edge: SpringEdge): void {
    this._edges.push(edge);
  }

  removeEdge(source: string, target: string): void {
    this._edges = this._edges.filter(
      e => !(e.source === source && e.target === target),
    );
  }

  setOptions(options: Partial<PhysicsOptions>): void {
    this._options = { ...this._options, ...options };
  }

  get bodies(): Map<string, PhysicsBody> {
    return this._bodies;
  }

  get energy(): number {
    return this._energy;
  }

  get isSettled(): boolean {
    return this._energy < this._options.minEnergy;
  }

  start(): void {
    this._running = true;
    this._temperature = 1.0;
    this._stepCount = 0;
  }

  stop(): void {
    this._running = false;
  }

  reset(): void {
    this._stepCount = 0;
    this._temperature = 1.0;
    this._energy = Infinity;
    for (const body of this._bodies.values()) {
      body.vx = 0;
      body.vy = 0;
      body.fx = 0;
      body.fy = 0;
    }
  }

  // ─── Force Accumulation ──────────────────────────────────────────────────────

  private _resetForces(): void {
    for (const body of this._bodies.values()) {
      body.fx = 0;
      body.fy = 0;
    }
  }

  private _applyGravity(): void {
    const g = this._options.gravity;
    for (const body of this._bodies.values()) {
      if (body.pinned) continue;
      body.fx -= body.x * g * body.mass;
      body.fy -= body.y * g * body.mass;
    }
  }

  private _applySpringForces(): void {
    const k = this._options.springStrength;
    const L = this._options.springLength;

    for (const edge of this._edges) {
      const a = this._bodies.get(edge.source);
      const b = this._bodies.get(edge.target);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const restLength = edge.length ?? L;
      const force = k * (dist - restLength);

      const fx = force * (dx / dist);
      const fy = force * (dy / dist);

      if (!a.pinned) { a.fx += fx; a.fy += fy; }
      if (!b.pinned) { b.fx -= fx; b.fy -= fy; }
    }
  }

  private _applyRepulsionForces(): void {
    const bodies = Array.from(this._bodies.values());
    if (bodies.length === 0) return;

    // Build bounding box for quadtree
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x > maxX) maxX = b.x;
      if (b.y > maxY) maxY = b.y;
    }

    const margin = 100;
    const size = Math.max(maxX - minX, maxY - minY) + margin * 2;
    const root = createQuadNode(minX - margin, minY - margin, size, size);

    for (const b of bodies) {
      insertBody(root, b);
    }

    const rep = this._options.repulsionStrength;
    const theta = this._options.theta;

    for (const body of bodies) {
      if (body.pinned) continue;
      const [fx, fy] = computeRepulsion(root, body, rep, theta);
      body.fx += fx;
      body.fy += fy;
    }
  }

  private _applyCollisionForces(): void {
    const bodies = Array.from(this._bodies.values());
    const extra = this._options.collisionRadius ?? 0;

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius + extra;
        if (distSq >= minDist * minDist || distSq < 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const totalMass = a.mass + b.mass;

        if (!a.pinned) {
          a.fx -= nx * overlap * (b.mass / totalMass) * 0.5;
          a.fy -= ny * overlap * (b.mass / totalMass) * 0.5;
        }
        if (!b.pinned) {
          b.fx += nx * overlap * (a.mass / totalMass) * 0.5;
          b.fy += ny * overlap * (a.mass / totalMass) * 0.5;
        }
      }
    }
  }

  // ─── Integration ─────────────────────────────────────────────────────────────

  /**
   * Velocity Verlet integration step.
   */
  step(): void {
    this._resetForces();
    this._applyGravity();
    this._applySpringForces();
    this._applyRepulsionForces();
    this._applyCollisionForces();

    const dt = this._options.timeStep;
    const damping = this._options.damping;
    const maxV = this._options.maxVelocity;
    let totalEnergy = 0;

    for (const body of this._bodies.values()) {
      if (body.pinned) {
        body.vx = 0;
        body.vy = 0;
        continue;
      }

      // Verlet integration
      const ax = body.fx / body.mass;
      const ay = body.fy / body.mass;

      body.vx = (body.vx + ax * dt) * damping * this._temperature;
      body.vy = (body.vy + ay * dt) * damping * this._temperature;

      // Clamp velocity
      const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
      if (speed > maxV) {
        body.vx = (body.vx / speed) * maxV;
        body.vy = (body.vy / speed) * maxV;
      }

      body.x += body.vx * dt;
      body.y += body.vy * dt;

      totalEnergy += 0.5 * body.mass * (body.vx * body.vx + body.vy * body.vy);
    }

    this._energy = totalEnergy;
    this._stepCount++;

    // Cooling schedule (simulated annealing)
    this._temperature = Math.max(0.1, this._temperature * 0.999);
  }

  /**
   * Run multiple steps until settled or max iterations reached.
   */
  runToSettled(maxSteps: number = 500): number {
    let steps = 0;
    while (!this.isSettled && steps < maxSteps) {
      this.step();
      steps++;
    }
    return steps;
  }

  /**
   * Run a single tick, returning true if still active.
   */
  tick(): boolean {
    if (!this._running) return false;
    if (this.isSettled) {
      this._running = false;
      return false;
    }
    this.step();
    return true;
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────────

  getPositions(): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    for (const [id, body] of this._bodies) {
      result.set(id, { x: body.x, y: body.y });
    }
    return result;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPhysicsBody(
  id: string,
  x: number,
  y: number,
  mass: number = 1,
  radius: number = 20,
  pinned: boolean = false,
): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, mass, radius, pinned };
}
