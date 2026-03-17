// LoadBalancer: multiple strategies, health tracking, sticky sessions

import { LoadBalancerStrategy } from './types.js';
import type { ServerInstance } from './types.js';

export interface LoadBalancerOptions {
  strategy: LoadBalancerStrategy;
  stickySessionSalt?: string;
  healthCheckInterval?: number;
  unhealthyRemoveThreshold?: number;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

export class LoadBalancer {
  private servers: Map<string, ServerInstance> = new Map();
  private strategy: LoadBalancerStrategy;
  private roundRobinIndex = 0;
  private stickySessionSalt: string;
  private failureCounts: Map<string, number> = new Map();
  private unhealthyRemoveThreshold: number;

  constructor(options: LoadBalancerOptions) {
    this.strategy = options.strategy;
    this.stickySessionSalt = options.stickySessionSalt ?? 'nexus-sticky';
    this.unhealthyRemoveThreshold = options.unhealthyRemoveThreshold ?? 5;
  }

  /**
   * Add a server to the pool.
   */
  addServer(server: ServerInstance): void {
    this.servers.set(server.id, { ...server });
    this.failureCounts.set(server.id, 0);
  }

  /**
   * Remove a server from the pool by ID.
   */
  removeServer(id: string): boolean {
    this.failureCounts.delete(id);
    return this.servers.delete(id);
  }

  /**
   * Mark a server as healthy or unhealthy.
   */
  setHealth(id: string, healthy: boolean): void {
    const server = this.servers.get(id);
    if (!server) return;
    server.healthy = healthy;
    server.lastHealthCheck = new Date();

    if (!healthy) {
      const count = (this.failureCounts.get(id) ?? 0) + 1;
      this.failureCounts.set(id, count);
      if (count >= this.unhealthyRemoveThreshold) {
        this.servers.delete(id);
        this.failureCounts.delete(id);
      }
    } else {
      this.failureCounts.set(id, 0);
    }
  }

  /**
   * Record the start of a connection to a server.
   */
  incrementConnections(id: string): void {
    const server = this.servers.get(id);
    if (server) server.connections++;
  }

  /**
   * Record the end of a connection to a server.
   */
  decrementConnections(id: string): void {
    const server = this.servers.get(id);
    if (server && server.connections > 0) server.connections--;
  }

  /**
   * Pick the next server based on the configured strategy.
   */
  pick(stickyKey?: string): ServerInstance | null {
    const healthy = this.healthyServers();
    if (healthy.length === 0) return null;

    switch (this.strategy) {
      case LoadBalancerStrategy.ROUND_ROBIN:
        return this.roundRobin(healthy);
      case LoadBalancerStrategy.RANDOM:
        return this.random(healthy);
      case LoadBalancerStrategy.LEAST_CONNECTIONS:
        return this.leastConnections(healthy);
      case LoadBalancerStrategy.WEIGHTED:
        return this.weighted(healthy);
      default:
        return this.roundRobin(healthy);
    }
  }

  /**
   * Pick a server using sticky session (hash-based, consistent per key).
   */
  pickSticky(stickyKey: string): ServerInstance | null {
    const healthy = this.healthyServers();
    if (healthy.length === 0) return null;
    const key = this.stickySessionSalt + ':' + stickyKey;
    const index = hashString(key) % healthy.length;
    return healthy[index] ?? null;
  }

  /**
   * Return a snapshot of all servers.
   */
  getServers(): ServerInstance[] {
    return Array.from(this.servers.values());
  }

  /**
   * Return only healthy servers.
   */
  healthyServers(): ServerInstance[] {
    return Array.from(this.servers.values()).filter((s) => s.healthy);
  }

  /**
   * Update a server's weight (for weighted strategy).
   */
  setWeight(id: string, weight: number): void {
    const server = this.servers.get(id);
    if (server) server.weight = weight;
  }

  /**
   * Change the load balancing strategy at runtime.
   */
  setStrategy(strategy: LoadBalancerStrategy): void {
    this.strategy = strategy;
    this.roundRobinIndex = 0;
  }

  /**
   * Return server count stats.
   */
  stats(): { total: number; healthy: number; unhealthy: number } {
    const all = Array.from(this.servers.values());
    const healthyCount = all.filter((s) => s.healthy).length;
    return {
      total: all.length,
      healthy: healthyCount,
      unhealthy: all.length - healthyCount,
    };
  }

  // ── Strategy implementations ─────────────────────────────────────

  private roundRobin(servers: ServerInstance[]): ServerInstance {
    const server = servers[this.roundRobinIndex % servers.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % servers.length;
    return server!;
  }

  private random(servers: ServerInstance[]): ServerInstance {
    const index = Math.floor(Math.random() * servers.length);
    return servers[index]!;
  }

  private leastConnections(servers: ServerInstance[]): ServerInstance {
    return servers.reduce((min, s) => (s.connections < min.connections ? s : min));
  }

  private weighted(servers: ServerInstance[]): ServerInstance {
    const totalWeight = servers.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;

    for (const server of servers) {
      random -= server.weight;
      if (random <= 0) return server;
    }

    return servers[servers.length - 1]!;
  }
}
