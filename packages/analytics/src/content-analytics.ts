// Content analytics: views, edits, freshness, quality, tag usage, growth

export interface NodeView {
  nodeId: string;
  userId: string;
  timestamp: number;
}

export interface NodeEdit {
  nodeId: string;
  userId: string;
  timestamp: number;
  changeSize?: number; // characters added/removed
}

export interface NodeMetadata {
  nodeId: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  /** Text content length in characters */
  contentLength: number;
  /** Number of outgoing links (edges) from this node */
  outgoingLinks: number;
  /** Number of incoming links (edges) to this node */
  incomingLinks: number;
  /** Additional metadata fields */
  customFields: string[];
}

export interface ContentQualityScore {
  nodeId: string;
  score: number; // 0–100
  breakdown: {
    contentLengthScore: number;
    linksScore: number;
    metadataScore: number;
    freshnessScore: number;
    tagsScore: number;
  };
}

export interface GrowthData {
  /** Cumulative node count at each time bucket */
  timestamps: number[];
  cumulativeCounts: number[];
  /** Average nodes created per day */
  avgPerDay: number;
}

export class ContentAnalytics {
  private views: NodeView[] = [];
  private edits: NodeEdit[] = [];
  private nodeRegistry: Map<string, NodeMetadata> = new Map();

  private readonly maxEvents: number;
  private readonly staleThresholdMs: number;

  constructor(
    options: {
      maxEvents?: number;
      /** Nodes not updated for this long are considered stale (default: 90 days) */
      staleThresholdMs?: number;
    } = {}
  ) {
    this.maxEvents = options.maxEvents ?? 500_000;
    this.staleThresholdMs = options.staleThresholdMs ?? 90 * 24 * 60 * 60 * 1000;
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /** Register or update node metadata */
  registerNode(metadata: NodeMetadata): void {
    this.nodeRegistry.set(metadata.nodeId, metadata);
  }

  registerNodes(nodes: NodeMetadata[]): void {
    for (const n of nodes) this.registerNode(n);
  }

  // ─── Event recording ─────────────────────────────────────────────────────

  recordView(view: NodeView): void {
    this.views.push(view);
    if (this.views.length > this.maxEvents) {
      this.views.splice(0, Math.floor(this.maxEvents * 0.1));
    }
  }

  recordViews(views: NodeView[]): void {
    for (const v of views) this.recordView(v);
  }

  recordEdit(edit: NodeEdit): void {
    this.edits.push(edit);
    if (this.edits.length > this.maxEvents) {
      this.edits.splice(0, Math.floor(this.maxEvents * 0.1));
    }

    // Update the updatedAt timestamp in registry
    const meta = this.nodeRegistry.get(edit.nodeId);
    if (meta && edit.timestamp > meta.updatedAt) {
      meta.updatedAt = edit.timestamp;
    }
  }

  recordEdits(edits: NodeEdit[]): void {
    for (const e of edits) this.recordEdit(e);
  }

  // ─── Most viewed / edited ─────────────────────────────────────────────────

  mostViewed(
    limit = 10,
    startTime = 0,
    endTime = Infinity
  ): Array<{ nodeId: string; views: number }> {
    const counts = new Map<string, number>();
    for (const v of this.views) {
      if (v.timestamp < startTime || v.timestamp > endTime) continue;
      counts.set(v.nodeId, (counts.get(v.nodeId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([nodeId, views]) => ({ nodeId, views }));
  }

  mostEdited(
    limit = 10,
    startTime = 0,
    endTime = Infinity
  ): Array<{ nodeId: string; edits: number }> {
    const counts = new Map<string, number>();
    for (const e of this.edits) {
      if (e.timestamp < startTime || e.timestamp > endTime) continue;
      counts.set(e.nodeId, (counts.get(e.nodeId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([nodeId, edits]) => ({ nodeId, edits }));
  }

  // ─── Freshness ────────────────────────────────────────────────────────────

  /**
   * Stale content: nodes not updated within staleThresholdMs.
   * Returns nodeIds sorted oldest-first.
   */
  staleNodes(referenceTime = Date.now()): string[] {
    const threshold = referenceTime - this.staleThresholdMs;
    return [...this.nodeRegistry.values()]
      .filter((n) => n.updatedAt < threshold)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((n) => n.nodeId);
  }

  /** Average age (ms since last update) of all registered nodes */
  avgContentAge(referenceTime = Date.now()): number {
    const nodes = [...this.nodeRegistry.values()];
    if (nodes.length === 0) return 0;
    return nodes.reduce((sum, n) => sum + (referenceTime - n.updatedAt), 0) / nodes.length;
  }

  // ─── Structural analysis ──────────────────────────────────────────────────

  /** Orphan nodes: no incoming edges (incomingLinks === 0) */
  orphanNodes(): string[] {
    return [...this.nodeRegistry.values()]
      .filter((n) => n.incomingLinks === 0)
      .map((n) => n.nodeId);
  }

  /** Dead-end nodes: no outgoing edges (outgoingLinks === 0) */
  deadEndNodes(): string[] {
    return [...this.nodeRegistry.values()]
      .filter((n) => n.outgoingLinks === 0)
      .map((n) => n.nodeId);
  }

  // ─── Content quality scoring ──────────────────────────────────────────────

  /**
   * Quality score for a single node (0–100).
   * Sub-scores:
   *   contentLength: 0–30 (based on character count, max at 2000+)
   *   links: 0–25 (based on total links, max at 10+)
   *   metadata: 0–20 (based on custom fields filled in)
   *   freshness: 0–15 (recency of last update)
   *   tags: 0–10 (based on tag count, max at 5+)
   */
  qualityScore(
    nodeId: string,
    referenceTime = Date.now()
  ): ContentQualityScore | null {
    const meta = this.nodeRegistry.get(nodeId);
    if (!meta) return null;

    // Content length score
    const lengthScore = Math.min(30, (meta.contentLength / 2000) * 30);

    // Links score
    const totalLinks = meta.incomingLinks + meta.outgoingLinks;
    const linksScore = Math.min(25, (totalLinks / 10) * 25);

    // Metadata completeness
    const metadataScore = Math.min(20, (meta.customFields.length / 5) * 20);

    // Freshness score
    const ageMs = referenceTime - meta.updatedAt;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const freshnessScore = Math.max(0, 15 * (1 - ageDays / 365));

    // Tags score
    const tagsScore = Math.min(10, (meta.tags.length / 5) * 10);

    const score = lengthScore + linksScore + metadataScore + freshnessScore + tagsScore;

    return {
      nodeId,
      score: Math.round(score * 10) / 10,
      breakdown: {
        contentLengthScore: Math.round(lengthScore * 10) / 10,
        linksScore: Math.round(linksScore * 10) / 10,
        metadataScore: Math.round(metadataScore * 10) / 10,
        freshnessScore: Math.round(freshnessScore * 10) / 10,
        tagsScore: Math.round(tagsScore * 10) / 10,
      },
    };
  }

  /** Quality scores for all registered nodes */
  allQualityScores(referenceTime = Date.now()): ContentQualityScore[] {
    const scores: ContentQualityScore[] = [];
    for (const nodeId of this.nodeRegistry.keys()) {
      const score = this.qualityScore(nodeId, referenceTime);
      if (score) scores.push(score);
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  /** Distribution of quality scores in buckets (0-20, 20-40, 40-60, 60-80, 80-100) */
  qualityDistribution(referenceTime = Date.now()): Record<string, number> {
    const buckets: Record<string, number> = {
      "0-20": 0,
      "20-40": 0,
      "40-60": 0,
      "60-80": 0,
      "80-100": 0,
    };

    for (const nodeId of this.nodeRegistry.keys()) {
      const qs = this.qualityScore(nodeId, referenceTime);
      if (!qs) continue;
      const s = qs.score;
      if (s < 20) buckets["0-20"]!++;
      else if (s < 40) buckets["20-40"]!++;
      else if (s < 60) buckets["40-60"]!++;
      else if (s < 80) buckets["60-80"]!++;
      else buckets["80-100"]!++;
    }
    return buckets;
  }

  // ─── Tag usage ────────────────────────────────────────────────────────────

  /** Tag usage counts sorted by frequency */
  tagUsage(limit = 50): Array<{ tag: string; count: number }> {
    const counts = new Map<string, number>();
    for (const node of this.nodeRegistry.values()) {
      for (const tag of node.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  // ─── Node type distribution ───────────────────────────────────────────────

  /** Distribution of node types at a point in time */
  nodeTypeDistribution(): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const node of this.nodeRegistry.values()) {
      dist[node.type] = (dist[node.type] ?? 0) + 1;
    }
    return dist;
  }

  /**
   * Node type distribution over time buckets.
   * Returns a timeline of type counts.
   */
  nodeTypeDistributionOverTime(
    intervalMs: number,
    startTime?: number,
    endTime?: number
  ): Array<{ timestamp: number; distribution: Record<string, number> }> {
    const nodes = [...this.nodeRegistry.values()];
    if (nodes.length === 0) return [];

    const effectiveStart = startTime ?? Math.min(...nodes.map((n) => n.createdAt));
    const effectiveEnd = endTime ?? Date.now();

    const result: Array<{ timestamp: number; distribution: Record<string, number> }> = [];

    for (let ts = effectiveStart; ts <= effectiveEnd; ts += intervalMs) {
      const bucketEnd = ts + intervalMs;
      const dist: Record<string, number> = {};

      for (const node of nodes) {
        if (node.createdAt < bucketEnd) {
          dist[node.type] = (dist[node.type] ?? 0) + 1;
        }
      }

      result.push({ timestamp: ts, distribution: dist });
    }

    return result;
  }

  // ─── Growth rate ──────────────────────────────────────────────────────────

  /**
   * Node growth rate over time.
   * Returns cumulative counts and average creation rate per day.
   */
  growthRate(
    intervalMs = 24 * 60 * 60 * 1000,
    startTime?: number,
    endTime?: number
  ): GrowthData {
    const nodes = [...this.nodeRegistry.values()].sort(
      (a, b) => a.createdAt - b.createdAt
    );

    if (nodes.length === 0) {
      return { timestamps: [], cumulativeCounts: [], avgPerDay: 0 };
    }

    const effectiveStart = startTime ?? (nodes[0]?.createdAt ?? 0);
    const effectiveEnd = endTime ?? Date.now();

    const timestamps: number[] = [];
    const cumulativeCounts: number[] = [];

    for (let ts = effectiveStart; ts <= effectiveEnd; ts += intervalMs) {
      const count = nodes.filter((n) => n.createdAt <= ts + intervalMs).length;
      timestamps.push(ts);
      cumulativeCounts.push(count);
    }

    const totalDays = (effectiveEnd - effectiveStart) / (24 * 60 * 60 * 1000);
    const avgPerDay = totalDays > 0 ? nodes.length / totalDays : nodes.length;

    return { timestamps, cumulativeCounts, avgPerDay };
  }

  /** Total registered nodes */
  get nodeCount(): number {
    return this.nodeRegistry.size;
  }

  /** Total recorded views */
  get totalViews(): number {
    return this.views.length;
  }

  /** Total recorded edits */
  get totalEdits(): number {
    return this.edits.length;
  }

  reset(): void {
    this.views = [];
    this.edits = [];
    this.nodeRegistry = new Map();
  }
}
