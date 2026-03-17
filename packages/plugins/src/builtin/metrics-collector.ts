import type { Plugin, PluginManifest, PluginContext, PluginHooks } from "../types.js";
import type { Node, Edge } from "@nexus/shared";

// ─── Metrics Types ────────────────────────────────────────────────────────────

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  nodeCreationRate: number; // per minute
  edgeCreationRate: number; // per minute
  density: number;
  averageDegree: number;
  clusteringCoefficient: number;
  collectedAt: Date;
}

interface TimestampedEvent {
  timestamp: number;
}

// ─── Rate Calculator ──────────────────────────────────────────────────────────

/**
 * Calculates the rate of events per minute over a sliding window.
 */
function calculateRate(
  events: TimestampedEvent[],
  windowMs: number = 60_000,
): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = events.filter((e) => e.timestamp >= cutoff);
  // Rate = events in window / window duration in minutes
  return (recent.length / windowMs) * 60_000;
}

// ─── Clustering Coefficient ───────────────────────────────────────────────────

/**
 * Approximates the global clustering coefficient from adjacency data.
 * CC = (triangles * 3) / (connected triples)
 */
function approximateClusteringCoefficient(
  adjacency: Map<string, Set<string>>,
): number {
  let triangles = 0;
  let connectedTriples = 0;

  for (const [node, neighbors] of adjacency) {
    const neighborList = Array.from(neighbors);
    const degree = neighborList.length;
    connectedTriples += degree * (degree - 1);

    for (let i = 0; i < neighborList.length; i++) {
      for (let j = i + 1; j < neighborList.length; j++) {
        const ni = neighborList[i]!;
        const nj = neighborList[j]!;
        if (adjacency.get(ni)?.has(nj) || adjacency.get(nj)?.has(ni)) {
          triangles++;
        }
      }
    }
  }

  if (connectedTriples === 0) return 0;
  return (2 * triangles) / connectedTriples;
}

// ─── Plugin Implementation ────────────────────────────────────────────────────

const METRICS_MANIFEST: PluginManifest = {
  name: "metrics-collector",
  version: "0.1.0",
  description:
    "Collects graph metrics including node/edge rates, density, and clustering coefficient",
  author: "Nexus",
  permissions: ["node:read", "edge:read", "metrics:write"],
};

export interface MetricsCollectorConfig {
  /** How often to collect periodic stats (ms). Default: 60000 */
  collectionIntervalMs?: number;
  /** Sliding window for rate calculation (ms). Default: 60000 */
  rateWindowMs?: number;
}

export class MetricsCollectorPlugin implements Plugin {
  readonly name = "metrics-collector";
  readonly version = "0.1.0";
  readonly manifest = METRICS_MANIFEST;

  private nodeCount = 0;
  private edgeCount = 0;
  private nodeEvents: TimestampedEvent[] = [];
  private edgeEvents: TimestampedEvent[] = [];
  private adjacency = new Map<string, Set<string>>();
  private collectionTimer: ReturnType<typeof setInterval> | null = null;
  private ctx: PluginContext | null = null;

  private config: Required<MetricsCollectorConfig> = {
    collectionIntervalMs: 60_000,
    rateWindowMs: 60_000,
  };

  readonly hooks: PluginHooks = {
    afterNodeCreate: (hookCtx) => {
      const node: Node = hookCtx.data;
      this.nodeCount++;
      this.nodeEvents.push({ timestamp: Date.now() });
      this.adjacency.set(node.id, new Set());
      this.pruneOldEvents();
      this.ctx?.logger.debug(`Node created: ${node.id}, total: ${this.nodeCount}`);
    },

    afterNodeDelete: (hookCtx) => {
      const { id } = hookCtx.data;
      if (this.nodeCount > 0) this.nodeCount--;
      // Remove from adjacency
      this.adjacency.delete(id);
      for (const neighbors of this.adjacency.values()) {
        neighbors.delete(id);
      }
      this.ctx?.logger.debug(`Node deleted: ${id}, total: ${this.nodeCount}`);
    },

    afterEdgeCreate: (hookCtx) => {
      const edge: Edge = hookCtx.data;
      this.edgeCount++;
      this.edgeEvents.push({ timestamp: Date.now() });

      // Update adjacency for clustering coefficient
      if (!this.adjacency.has(edge.sourceId)) {
        this.adjacency.set(edge.sourceId, new Set());
      }
      if (!this.adjacency.has(edge.targetId)) {
        this.adjacency.set(edge.targetId, new Set());
      }
      this.adjacency.get(edge.sourceId)!.add(edge.targetId);
      this.adjacency.get(edge.targetId)!.add(edge.sourceId);

      this.pruneOldEvents();
      this.ctx?.logger.debug(`Edge created: ${edge.id}, total: ${this.edgeCount}`);
    },

    afterEdgeDelete: (hookCtx) => {
      const { id } = hookCtx.data;
      if (this.edgeCount > 0) this.edgeCount--;
      this.ctx?.logger.debug(`Edge deleted: ${id}, total: ${this.edgeCount}`);
    },
  };

  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.config.rateWindowMs * 2;
    this.nodeEvents = this.nodeEvents.filter((e) => e.timestamp >= cutoff);
    this.edgeEvents = this.edgeEvents.filter((e) => e.timestamp >= cutoff);
  }

  collectMetrics(): GraphMetrics {
    const maxPossibleEdges =
      this.nodeCount > 1 ? this.nodeCount * (this.nodeCount - 1) : 1;
    const density = this.edgeCount / maxPossibleEdges;
    const averageDegree =
      this.nodeCount > 0 ? (2 * this.edgeCount) / this.nodeCount : 0;
    const clusteringCoefficient = approximateClusteringCoefficient(
      this.adjacency,
    );

    return {
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount,
      nodeCreationRate: calculateRate(this.nodeEvents, this.config.rateWindowMs),
      edgeCreationRate: calculateRate(this.edgeEvents, this.config.rateWindowMs),
      density: Math.round(density * 10000) / 10000,
      averageDegree: Math.round(averageDegree * 100) / 100,
      clusteringCoefficient: Math.round(clusteringCoefficient * 10000) / 10000,
      collectedAt: new Date(),
    };
  }

  init(ctx: PluginContext): void {
    this.ctx = ctx;

    if (ctx.config["collectionIntervalMs"] !== undefined) {
      this.config.collectionIntervalMs = ctx.config["collectionIntervalMs"] as number;
    }
    if (ctx.config["rateWindowMs"] !== undefined) {
      this.config.rateWindowMs = ctx.config["rateWindowMs"] as number;
    }

    // Start periodic collection
    this.collectionTimer = setInterval(() => {
      const metrics = this.collectMetrics();
      ctx.logger.info("Periodic graph metrics collected", metrics as unknown as Record<string, unknown>);
      ctx.emit("metrics-collected", metrics);
    }, this.config.collectionIntervalMs);

    ctx.logger.info("MetricsCollectorPlugin initialized", {
      intervalMs: this.config.collectionIntervalMs,
    });
  }

  destroy(ctx: PluginContext): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    // Emit final metrics snapshot
    const finalMetrics = this.collectMetrics();
    ctx.emit("metrics-final", finalMetrics);

    this.nodeEvents = [];
    this.edgeEvents = [];
    this.adjacency.clear();
    this.ctx = null;

    ctx.logger.info("MetricsCollectorPlugin destroyed");
  }
}

export function createMetricsCollectorPlugin(
  config?: MetricsCollectorConfig,
): Plugin {
  const plugin = new MetricsCollectorPlugin();
  if (config) {
    Object.assign(plugin["config"], config);
  }
  return plugin;
}
