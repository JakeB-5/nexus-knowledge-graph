// Comprehensive tests for the PhysicsEngine

import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsEngine, createPhysicsBody, DEFAULT_PHYSICS_OPTIONS } from '../physics.js';
import type { PhysicsBody } from '../../graph/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBody(
  id: string,
  x: number,
  y: number,
  mass: number = 1,
  radius: number = 20,
  pinned: boolean = false,
): PhysicsBody {
  return createPhysicsBody(id, x, y, mass, radius, pinned);
}

function distance(a: PhysicsBody, b: PhysicsBody): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── createPhysicsBody ────────────────────────────────────────────────────────

describe('createPhysicsBody', () => {
  it('creates a body with correct initial values', () => {
    const body = makeBody('a', 10, 20, 2, 15);
    expect(body.id).toBe('a');
    expect(body.x).toBe(10);
    expect(body.y).toBe(20);
    expect(body.mass).toBe(2);
    expect(body.radius).toBe(15);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
    expect(body.fx).toBe(0);
    expect(body.fy).toBe(0);
    expect(body.pinned).toBe(false);
  });

  it('creates a pinned body', () => {
    const body = makeBody('b', 0, 0, 1, 10, true);
    expect(body.pinned).toBe(true);
  });
});

// ─── PhysicsEngine construction ───────────────────────────────────────────────

describe('PhysicsEngine construction', () => {
  it('creates with default options', () => {
    const engine = new PhysicsEngine();
    expect(engine.bodies.size).toBe(0);
    expect(engine.energy).toBe(Infinity);
    expect(engine.isSettled).toBe(false);
  });

  it('accepts partial options', () => {
    const engine = new PhysicsEngine({ gravity: 0.1, damping: 0.9 });
    expect(engine).toBeDefined();
  });
});

// ─── addBody / removeBody ─────────────────────────────────────────────────────

describe('addBody / removeBody', () => {
  let engine: PhysicsEngine;
  beforeEach(() => { engine = new PhysicsEngine(); });

  it('adds a body', () => {
    engine.addBody(makeBody('a', 0, 0));
    expect(engine.bodies.size).toBe(1);
    expect(engine.bodies.has('a')).toBe(true);
  });

  it('adds multiple bodies', () => {
    engine.addBody(makeBody('a', 0, 0));
    engine.addBody(makeBody('b', 100, 0));
    engine.addBody(makeBody('c', 50, 100));
    expect(engine.bodies.size).toBe(3);
  });

  it('removes a body', () => {
    engine.addBody(makeBody('a', 0, 0));
    engine.addBody(makeBody('b', 100, 0));
    engine.removeBody('a');
    expect(engine.bodies.size).toBe(1);
    expect(engine.bodies.has('a')).toBe(false);
  });

  it('removing a body also removes its edges', () => {
    engine.addBody(makeBody('a', 0, 0));
    engine.addBody(makeBody('b', 100, 0));
    engine.addEdge({ source: 'a', target: 'b' });
    engine.removeBody('a');
    // If we try to step, it should not throw (missing edge endpoints handled)
    expect(() => engine.step()).not.toThrow();
  });

  it('removing a non-existent body is a no-op', () => {
    engine.addBody(makeBody('a', 0, 0));
    engine.removeBody('nonexistent');
    expect(engine.bodies.size).toBe(1);
  });
});

// ─── addEdge / removeEdge ─────────────────────────────────────────────────────

describe('addEdge / removeEdge', () => {
  let engine: PhysicsEngine;
  beforeEach(() => {
    engine = new PhysicsEngine();
    engine.addBody(makeBody('a', -100, 0));
    engine.addBody(makeBody('b', 100, 0));
  });

  it('adds edges without error', () => {
    expect(() => engine.addEdge({ source: 'a', target: 'b' })).not.toThrow();
  });

  it('removes an edge', () => {
    engine.addEdge({ source: 'a', target: 'b' });
    engine.removeEdge('a', 'b');
    // After removal, step should still work
    expect(() => engine.step()).not.toThrow();
  });
});

// ─── step() basic mechanics ──────────────────────────────────────────────────

describe('step() mechanics', () => {
  it('does not move pinned bodies', () => {
    const engine = new PhysicsEngine({ gravity: 0.5 });
    const body = makeBody('a', 50, 50, 1, 20, true);
    engine.addBody(body);
    engine.step();
    const b = engine.bodies.get('a')!;
    expect(b.x).toBe(50);
    expect(b.y).toBe(50);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('gravity pulls free bodies toward center', () => {
    const engine = new PhysicsEngine({
      gravity: 0.5,
      repulsionStrength: 0,
      springStrength: 0,
    });
    const body = makeBody('a', 200, 0);
    engine.addBody(body);
    engine.step();
    const b = engine.bodies.get('a')!;
    // x should move toward 0
    expect(b.x).toBeLessThan(200);
  });

  it('repulsion pushes overlapping bodies apart', () => {
    const engine = new PhysicsEngine({
      gravity: 0,
      springStrength: 0,
      repulsionStrength: 8000,
    });
    // Two bodies at the same position
    engine.addBody(makeBody('a', 1, 0));
    engine.addBody(makeBody('b', -1, 0));
    engine.step();
    const a = engine.bodies.get('a')!;
    const b = engine.bodies.get('b')!;
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(0);
  });

  it('spring force pulls distant connected bodies together', () => {
    const engine = new PhysicsEngine({
      gravity: 0,
      repulsionStrength: 0,
      springStrength: 0.5,
      springLength: 50,
    });
    engine.addBody(makeBody('a', -200, 0));
    engine.addBody(makeBody('b', 200, 0));
    engine.addEdge({ source: 'a', target: 'b' });
    engine.step();
    const a = engine.bodies.get('a')!;
    const b = engine.bodies.get('b')!;
    // They should move toward each other
    expect(a.x).toBeGreaterThan(-200);
    expect(b.x).toBeLessThan(200);
  });

  it('spring force pushes too-close connected bodies apart', () => {
    const engine = new PhysicsEngine({
      gravity: 0,
      repulsionStrength: 0,
      springStrength: 0.5,
      springLength: 200,
    });
    engine.addBody(makeBody('a', -10, 0));
    engine.addBody(makeBody('b', 10, 0));
    engine.addEdge({ source: 'a', target: 'b' });
    engine.step();
    const a = engine.bodies.get('a')!;
    const b = engine.bodies.get('b')!;
    // Spring rest length is 200; bodies at distance 20 should be pushed apart
    expect(a.x).toBeLessThan(-10);
    expect(b.x).toBeGreaterThan(10);
  });

  it('increments energy correctly', () => {
    const engine = new PhysicsEngine({ gravity: 0.1 });
    engine.addBody(makeBody('a', 100, 0));
    engine.step();
    expect(engine.energy).toBeGreaterThan(0);
    expect(engine.energy).not.toBe(Infinity);
  });

  it('respects max velocity clamping', () => {
    const engine = new PhysicsEngine({
      gravity: 100,
      maxVelocity: 5,
      damping: 1,
    });
    engine.addBody(makeBody('a', 1000, 1000));
    for (let i = 0; i < 10; i++) engine.step();
    const b = engine.bodies.get('a')!;
    const speed = Math.sqrt(b.vx ** 2 + b.vy ** 2);
    expect(speed).toBeLessThanOrEqual(5 + 0.001); // small float tolerance
  });
});

// ─── start / tick / stop ─────────────────────────────────────────────────────

describe('start / tick / stop', () => {
  it('tick returns true while running and not settled', () => {
    const engine = new PhysicsEngine({ minEnergy: 0 }); // never settles by energy
    engine.addBody(makeBody('a', 100, 0));
    engine.addBody(makeBody('b', -100, 0));
    engine.start();
    const active = engine.tick();
    expect(active).toBe(true);
  });

  it('tick returns false when stopped', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('a', 100, 0));
    engine.start();
    engine.stop();
    expect(engine.tick()).toBe(false);
  });

  it('tick returns false when engine is settled', () => {
    const engine = new PhysicsEngine({ minEnergy: Infinity }); // always settled
    engine.addBody(makeBody('a', 0, 0));
    engine.start();
    expect(engine.tick()).toBe(false);
  });
});

// ─── runToSettled ─────────────────────────────────────────────────────────────

describe('runToSettled', () => {
  it('runs at most maxSteps steps', () => {
    const engine = new PhysicsEngine({ minEnergy: 0 }); // never settles
    engine.addBody(makeBody('a', 100, 0));
    engine.addBody(makeBody('b', -100, 0));
    const steps = engine.runToSettled(50);
    expect(steps).toBeLessThanOrEqual(50);
  });

  it('returns early when settled', () => {
    const engine = new PhysicsEngine({ minEnergy: Infinity }); // immediately settled
    engine.addBody(makeBody('a', 0, 0));
    const steps = engine.runToSettled(500);
    expect(steps).toBe(0);
  });

  it('reduces energy over time for stable layout', () => {
    const engine = new PhysicsEngine();
    // Star graph: center node connected to several outer nodes
    engine.addBody(makeBody('center', 0, 0));
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI * i) / 5;
      engine.addBody(makeBody(`n${i}`, Math.cos(angle) * 300, Math.sin(angle) * 300));
      engine.addEdge({ source: 'center', target: `n${i}` });
    }
    engine.runToSettled(50);
    const energyAfter50 = engine.energy;
    engine.runToSettled(200);
    expect(engine.energy).toBeLessThanOrEqual(energyAfter50 + 0.001);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('zeros velocities and forces', () => {
    const engine = new PhysicsEngine({ gravity: 1 });
    engine.addBody(makeBody('a', 100, 0));
    engine.step();
    engine.reset();
    const b = engine.bodies.get('a')!;
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.fx).toBe(0);
    expect(b.fy).toBe(0);
  });

  it('sets energy to Infinity', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('a', 100, 0));
    engine.step();
    engine.reset();
    expect(engine.energy).toBe(Infinity);
  });
});

// ─── collision detection ──────────────────────────────────────────────────────

describe('collision detection', () => {
  it('separates overlapping bodies', () => {
    const engine = new PhysicsEngine({
      gravity: 0,
      springStrength: 0,
      repulsionStrength: 0,
      collisionRadius: 0,
    });
    const r = 20;
    engine.addBody(makeBody('a', 0, 0, 1, r));
    engine.addBody(makeBody('b', 5, 0, 1, r)); // deeply overlapping (total min 40)
    engine.step();
    const a = engine.bodies.get('a')!;
    const b = engine.bodies.get('b')!;
    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    expect(dist).toBeGreaterThan(5); // They should have moved apart
  });
});

// ─── getPositions ─────────────────────────────────────────────────────────────

describe('getPositions', () => {
  it('returns current positions of all bodies', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('a', 10, 20));
    engine.addBody(makeBody('b', -5, 15));
    const positions = engine.getPositions();
    expect(positions.size).toBe(2);
    expect(positions.get('a')).toEqual({ x: 10, y: 20 });
    expect(positions.get('b')).toEqual({ x: -5, y: 15 });
  });

  it('reflects updated positions after stepping', () => {
    const engine = new PhysicsEngine({ gravity: 1, repulsionStrength: 0 });
    engine.addBody(makeBody('a', 100, 0));
    engine.step();
    const positions = engine.getPositions();
    expect(positions.get('a')!.x).not.toBe(100);
  });
});

// ─── setOptions ───────────────────────────────────────────────────────────────

describe('setOptions', () => {
  it('changes simulation behavior when options are updated', () => {
    const engine1 = new PhysicsEngine({ gravity: 0.01 });
    engine1.addBody(makeBody('a', 100, 0));
    engine1.step();
    const x1 = engine1.bodies.get('a')!.x;

    const engine2 = new PhysicsEngine({ gravity: 1.0 });
    engine2.addBody(makeBody('a', 100, 0));
    engine2.step();
    const x2 = engine2.bodies.get('a')!.x;

    // Higher gravity → moves more
    expect(Math.abs(x2 - 100)).toBeGreaterThan(Math.abs(x1 - 100));
  });

  it('can update options mid-simulation', () => {
    const engine = new PhysicsEngine({ gravity: 0 });
    engine.addBody(makeBody('a', 100, 0));
    engine.step();
    engine.setOptions({ gravity: 1 });
    engine.step();
    const b = engine.bodies.get('a')!;
    // After gravity update, body should have moved toward center
    expect(b.x).toBeLessThan(100);
  });
});

// ─── DEFAULT_PHYSICS_OPTIONS ──────────────────────────────────────────────────

describe('DEFAULT_PHYSICS_OPTIONS', () => {
  it('has expected keys', () => {
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('springLength');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('springStrength');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('repulsionStrength');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('gravity');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('damping');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('maxVelocity');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('minEnergy');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('theta');
    expect(DEFAULT_PHYSICS_OPTIONS).toHaveProperty('timeStep');
  });

  it('has sensible default values', () => {
    expect(DEFAULT_PHYSICS_OPTIONS.springLength).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS_OPTIONS.damping).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS_OPTIONS.damping).toBeLessThan(1);
    expect(DEFAULT_PHYSICS_OPTIONS.theta).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS_OPTIONS.theta).toBeLessThanOrEqual(2);
  });
});

// ─── Barnes-Hut accuracy ──────────────────────────────────────────────────────

describe('Barnes-Hut approximation', () => {
  it('produces repulsion for a grid of bodies', () => {
    const engine = new PhysicsEngine({
      gravity: 0,
      springStrength: 0,
      repulsionStrength: 5000,
      theta: 0.5,
    });

    // Place 16 bodies in a 4x4 grid at origin — they should spread out
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        engine.addBody(makeBody(`n${i}_${j}`, i * 5, j * 5));
      }
    }

    const before = engine.getPositions();
    engine.runToSettled(30);
    const after = engine.getPositions();

    // Bounding box should be larger after repulsion
    let beforeMaxDist = 0, afterMaxDist = 0;
    const beforeCenter = { x: 7.5, y: 7.5 };
    for (const [id] of before) {
      const pb = before.get(id)!;
      const pa = after.get(id)!;
      beforeMaxDist = Math.max(beforeMaxDist, Math.sqrt((pb.x - beforeCenter.x) ** 2 + (pb.y - beforeCenter.y) ** 2));
      afterMaxDist = Math.max(afterMaxDist, Math.sqrt((pa.x - beforeCenter.x) ** 2 + (pa.y - beforeCenter.y) ** 2));
    }
    expect(afterMaxDist).toBeGreaterThan(beforeMaxDist);
  });

  it('does not crash with theta=0 (exact calculation)', () => {
    const engine = new PhysicsEngine({ theta: 0.001, repulsionStrength: 1000 });
    for (let i = 0; i < 10; i++) {
      engine.addBody(makeBody(`n${i}`, Math.random() * 100, Math.random() * 100));
    }
    expect(() => engine.runToSettled(10)).not.toThrow();
  });
});

// ─── edge case: single node ───────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles a single body without errors', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('solo', 0, 0));
    expect(() => engine.runToSettled(20)).not.toThrow();
  });

  it('handles zero bodies without errors', () => {
    const engine = new PhysicsEngine();
    expect(() => engine.step()).not.toThrow();
    expect(engine.energy).toBe(0);
  });

  it('handles self-loop edges gracefully', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('a', 0, 0));
    engine.addEdge({ source: 'a', target: 'a' });
    expect(() => engine.step()).not.toThrow();
  });

  it('handles edges with missing nodes gracefully', () => {
    const engine = new PhysicsEngine();
    engine.addBody(makeBody('a', 0, 0));
    engine.addEdge({ source: 'a', target: 'missing' });
    expect(() => engine.step()).not.toThrow();
  });

  it('custom edge rest length overrides default', () => {
    const engine1 = new PhysicsEngine({
      gravity: 0,
      repulsionStrength: 0,
      springStrength: 0.5,
      springLength: 100,
    });
    engine1.addBody(makeBody('a', -300, 0));
    engine1.addBody(makeBody('b', 300, 0));
    engine1.addEdge({ source: 'a', target: 'b', length: 100 });

    const engine2 = new PhysicsEngine({
      gravity: 0,
      repulsionStrength: 0,
      springStrength: 0.5,
      springLength: 100,
    });
    engine2.addBody(makeBody('a', -300, 0));
    engine2.addBody(makeBody('b', 300, 0));
    engine2.addEdge({ source: 'a', target: 'b', length: 50 }); // shorter rest length

    engine1.step();
    engine2.step();

    const d1 = distance(engine1.bodies.get('a')!, engine1.bodies.get('b')!);
    const d2 = distance(engine2.bodies.get('a')!, engine2.bodies.get('b')!);

    // Shorter rest length → stronger pull → shorter distance after one step
    expect(d2).toBeLessThan(d1);
  });
});
