// In-process pub/sub EventBus with wildcard support, priorities, and metrics

import type { Event, EventHandler, EventFilter, Subscription } from "./types.js";

let subscriptionCounter = 0;

function generateSubscriptionId(): string {
  return `sub_${++subscriptionCounter}_${Date.now()}`;
}

/** Match an event type against a subscription pattern.
 *  Supports exact match and wildcard suffix, e.g. "node:*" matches "node:created".
 */
function matchesPattern(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -1); // "node:"
    return eventType.startsWith(prefix);
  }
  return pattern === eventType;
}

export interface EventBusOptions {
  /** Maximum number of past events to keep in memory (default: 100) */
  historySize?: number;
}

export interface EventBusMetrics {
  published: number;
  handlerCalls: number;
  handlerErrors: number;
  subscriptions: number;
}

export class EventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private history: Event[] = [];
  private historySize: number;
  private metrics: EventBusMetrics = {
    published: 0,
    handlerCalls: 0,
    handlerErrors: 0,
    subscriptions: 0,
  };

  constructor(options: EventBusOptions = {}) {
    this.historySize = options.historySize ?? 100;
  }

  // ─── Subscription management ────────────────────────────────────────────────

  subscribe<TPayload = unknown>(
    pattern: string,
    handler: EventHandler<TPayload>,
    options: {
      priority?: number;
      filter?: EventFilter<TPayload>;
      once?: boolean;
    } = {}
  ): Subscription {
    const sub: Subscription = {
      id: generateSubscriptionId(),
      pattern,
      handler: handler as EventHandler,
      priority: options.priority ?? 0,
      once: options.once ?? false,
      filter: options.filter as EventFilter | undefined,
    };
    this.subscriptions.set(sub.id, sub);
    this.metrics.subscriptions++;
    return sub;
  }

  /** Subscribe and automatically unsubscribe after the first matching event */
  once<TPayload = unknown>(
    pattern: string,
    handler: EventHandler<TPayload>,
    options: { priority?: number; filter?: EventFilter<TPayload> } = {}
  ): Subscription {
    return this.subscribe(pattern, handler, { ...options, once: true });
  }

  unsubscribe(subscriptionId: string): boolean {
    const existed = this.subscriptions.has(subscriptionId);
    if (existed) {
      this.subscriptions.delete(subscriptionId);
      this.metrics.subscriptions--;
    }
    return existed;
  }

  unsubscribeAll(pattern?: string): number {
    if (!pattern) {
      const count = this.subscriptions.size;
      this.subscriptions.clear();
      this.metrics.subscriptions = 0;
      return count;
    }
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.pattern === pattern) {
        this.subscriptions.delete(id);
        this.metrics.subscriptions--;
        count++;
      }
    }
    return count;
  }

  // ─── Publishing ─────────────────────────────────────────────────────────────

  async publish<TPayload = unknown>(
    event: Omit<Event<TPayload>, "timestamp"> & { timestamp?: string }
  ): Promise<void> {
    const fullEvent: Event<TPayload> = {
      timestamp: new Date().toISOString(),
      ...event,
    } as Event<TPayload>;

    // Record in history
    this.history.push(fullEvent as Event);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    this.metrics.published++;

    // Collect matching subscriptions sorted by priority (descending)
    const matching = [...this.subscriptions.values()]
      .filter((sub) => matchesPattern(sub.pattern, fullEvent.type))
      .filter((sub) => {
        if (!sub.filter) return true;
        try {
          return sub.filter(fullEvent as Event);
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.priority - a.priority);

    // Invoke handlers — errors are isolated
    const toRemove: string[] = [];
    for (const sub of matching) {
      this.metrics.handlerCalls++;
      try {
        const result = sub.handler(fullEvent as Event);
        if (result instanceof Promise) await result;
      } catch {
        this.metrics.handlerErrors++;
        // Error isolation: one handler failure does not affect others
      }
      if (sub.once) toRemove.push(sub.id);
    }

    for (const id of toRemove) {
      this.subscriptions.delete(id);
      this.metrics.subscriptions--;
    }
  }

  /** Publish multiple events in sequence */
  async publishAll(events: Array<Omit<Event, "timestamp"> & { timestamp?: string }>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  // ─── History ────────────────────────────────────────────────────────────────

  getHistory(filter?: { type?: string; limit?: number }): Event[] {
    let events = [...this.history];
    if (filter?.type) {
      events = events.filter((e) => matchesPattern(filter.type!, e.type));
    }
    if (filter?.limit !== undefined) {
      events = events.slice(-filter.limit);
    }
    return events;
  }

  clearHistory(): void {
    this.history = [];
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  getMetrics(): Readonly<EventBusMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      published: 0,
      handlerCalls: 0,
      handlerErrors: 0,
      subscriptions: this.subscriptions.size,
    };
  }

  // ─── Introspection ──────────────────────────────────────────────────────────

  getSubscriptions(): Subscription[] {
    return [...this.subscriptions.values()];
  }

  hasSubscribers(pattern: string): boolean {
    for (const sub of this.subscriptions.values()) {
      if (sub.pattern === pattern) return true;
    }
    return false;
  }

  /** Wait for the next event matching the pattern (returns a Promise) */
  waitFor<TPayload = unknown>(
    pattern: string,
    filter?: EventFilter<TPayload>,
    timeoutMs?: number
  ): Promise<Event<TPayload>> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const sub = this.once<TPayload>(pattern, (event) => {
        if (timer) clearTimeout(timer);
        resolve(event);
      }, { filter });

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          this.unsubscribe(sub.id);
          reject(new Error(`Timeout waiting for event "${pattern}" after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }
}
