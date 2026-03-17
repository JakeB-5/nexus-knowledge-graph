// CircuitBreaker: closed/open/half-open states with fallback and callbacks

import { CircuitBreakerState } from './types.js';
import type { CircuitBreakerStats } from './types.js';

export interface CircuitBreakerOptions {
  failureThreshold: number;        // Failures to trip open
  successThreshold: number;        // Successes in half-open to close
  openTimeoutMs: number;           // How long to stay open before half-open
  fallback?: <T>() => Promise<T>;  // Called when circuit is open
  onOpen?: (stats: CircuitBreakerStats) => void;
  onClose?: (stats: CircuitBreakerStats) => void;
  onHalfOpen?: (stats: CircuitBreakerStats) => void;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastOpenedAt?: Date;
  private stats: CircuitBreakerStats;
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      stateChanges: 0,
      currentState: CircuitBreakerState.CLOSED,
    };
  }

  /**
   * Execute an operation through the circuit breaker.
   * Throws if open and no fallback is configured.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    if (this.state === CircuitBreakerState.OPEN) {
      if (!this.shouldAttemptReset()) {
        if (this.options.fallback) {
          return this.options.fallback<T>();
        }
        throw new Error('Circuit breaker is OPEN');
      }
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Return a snapshot of the statistics.
   */
  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  /**
   * Manually force the circuit to close (for recovery scenarios).
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.transitionTo(CircuitBreakerState.CLOSED);
  }

  /**
   * Manually trip the circuit open.
   */
  trip(): void {
    this.transitionTo(CircuitBreakerState.OPEN);
  }

  // ── Internal state management ─────────────────────────────────────

  private onSuccess(): void {
    this.stats.successfulRequests++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.failureCount = 0;
        this.successCount = 0;
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.stats.failedRequests++;
    this.failureCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // One failure in half-open → re-open
      this.successCount = 0;
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (
      this.state === CircuitBreakerState.CLOSED &&
      this.failureCount >= this.options.failureThreshold
    ) {
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastOpenedAt) return false;
    return Date.now() - this.lastOpenedAt.getTime() >= this.options.openTimeoutMs;
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return;

    this.state = newState;
    this.stats.currentState = newState;
    this.stats.stateChanges++;
    this.stats.lastStateChange = new Date();

    if (newState === CircuitBreakerState.OPEN) {
      this.lastOpenedAt = new Date();
      this.options.onOpen?.(this.getStats());
    } else if (newState === CircuitBreakerState.CLOSED) {
      this.options.onClose?.(this.getStats());
    } else if (newState === CircuitBreakerState.HALF_OPEN) {
      this.options.onHalfOpen?.(this.getStats());
    }
  }
}

/**
 * Registry of per-service circuit breakers.
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultOptions: CircuitBreakerOptions;

  constructor(defaultOptions: CircuitBreakerOptions) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a circuit breaker for a service.
   */
  get(serviceId: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(serviceId)) {
      this.breakers.set(
        serviceId,
        new CircuitBreaker({ ...this.defaultOptions, ...options })
      );
    }
    return this.breakers.get(serviceId)!;
  }

  /**
   * Remove a circuit breaker from the registry.
   */
  remove(serviceId: string): boolean {
    return this.breakers.delete(serviceId);
  }

  /**
   * Return all registered breakers with their current states.
   */
  status(): Record<string, CircuitBreakerStats> {
    const result: Record<string, CircuitBreakerStats> = {};
    this.breakers.forEach((breaker, id) => {
      result[id] = breaker.getStats();
    });
    return result;
  }

  /**
   * Reset all circuit breakers to closed.
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }
}
