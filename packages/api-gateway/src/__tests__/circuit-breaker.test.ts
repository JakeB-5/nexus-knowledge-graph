import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerRegistry } from '../circuit-breaker.js';
import { CircuitBreakerState } from '../types.js';

function makeBreaker(overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {}) {
  return new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    openTimeoutMs: 100,
    ...overrides,
  });
}

const succeed = async () => 'ok';
const fail = async () => { throw new Error('upstream error'); };

describe('CircuitBreaker', () => {
  describe('closed state', () => {
    it('starts in closed state', () => {
      const cb = makeBreaker();
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('passes through successful operations', async () => {
      const cb = makeBreaker();
      const result = await cb.execute(succeed);
      expect(result).toBe('ok');
    });

    it('stays closed below failure threshold', async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('resets failure count after a success', async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      await cb.execute(succeed);
      // Two more failures shouldn't open it (count was reset)
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('opening', () => {
    it('opens after reaching failure threshold', async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('calls onOpen callback', async () => {
      const onOpen = vi.fn();
      const cb = makeBreaker({ failureThreshold: 2, onOpen });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(onOpen).toHaveBeenCalledOnce();
    });

    it('rejects immediately when open (no fallback)', async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(succeed)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('uses fallback when open', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback-value');
      const cb = makeBreaker({ failureThreshold: 2, fallback });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      const result = await cb.execute(succeed);
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('half-open state', () => {
    it('transitions to half-open after timeout', async () => {
      const cb = makeBreaker({ failureThreshold: 2, openTimeoutMs: 50 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

      await new Promise((r) => setTimeout(r, 60));
      // Next call should attempt (transition to half-open)
      await cb.execute(succeed);
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('closes after enough successes in half-open', async () => {
      const cb = makeBreaker({ failureThreshold: 2, successThreshold: 2, openTimeoutMs: 50 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 60));
      await cb.execute(succeed); // half-open
      await cb.execute(succeed); // closes
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('re-opens on failure in half-open', async () => {
      const cb = makeBreaker({ failureThreshold: 2, successThreshold: 2, openTimeoutMs: 50 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 60));
      await cb.execute(succeed); // half-open
      await expect(cb.execute(fail)).rejects.toThrow(); // re-open
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('calls onHalfOpen callback', async () => {
      const onHalfOpen = vi.fn();
      const cb = makeBreaker({ failureThreshold: 2, openTimeoutMs: 50, onHalfOpen });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 60));
      await cb.execute(succeed);
      expect(onHalfOpen).toHaveBeenCalled();
    });
  });

  describe('stats', () => {
    it('tracks total, success, failure counts', async () => {
      const cb = makeBreaker();
      await cb.execute(succeed);
      await expect(cb.execute(fail)).rejects.toThrow();
      const stats = cb.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
    });

    it('tracks state changes', async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      expect(cb.getStats().stateChanges).toBeGreaterThanOrEqual(1);
    });
  });

  describe('manual control', () => {
    it('reset closes the breaker', async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await expect(cb.execute(fail)).rejects.toThrow();
      await expect(cb.execute(fail)).rejects.toThrow();
      cb.reset();
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('trip opens the breaker', () => {
      const cb = makeBreaker();
      cb.trip();
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates and returns circuit breakers per service', () => {
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 3,
      successThreshold: 2,
      openTimeoutMs: 100,
    });

    const a = registry.get('service-a');
    const b = registry.get('service-b');
    const a2 = registry.get('service-a');

    expect(a).toBe(a2); // same instance
    expect(a).not.toBe(b);
  });

  it('reports status for all services', async () => {
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 2,
      successThreshold: 2,
      openTimeoutMs: 100,
    });

    const cb = registry.get('svc');
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();

    const status = registry.status();
    expect(status['svc']?.currentState).toBe(CircuitBreakerState.OPEN);
  });

  it('resetAll closes all breakers', async () => {
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 2,
      successThreshold: 2,
      openTimeoutMs: 100,
    });

    const cb = registry.get('svc');
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    registry.resetAll();
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('removes a breaker', () => {
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 3,
      successThreshold: 2,
      openTimeoutMs: 100,
    });
    registry.get('svc');
    expect(registry.remove('svc')).toBe(true);
    expect(Object.keys(registry.status())).not.toContain('svc');
  });
});
