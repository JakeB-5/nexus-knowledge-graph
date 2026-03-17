// Search analytics: tracks queries, results, CTR, latency, and trends

export interface SearchEvent {
  query: string;
  timestamp: number;
  resultCount: number;
  latencyMs: number;
  userId?: string;
  sessionId?: string;
}

export interface ClickEvent {
  query: string;
  resultId: string;
  position: number;
  timestamp: number;
  userId?: string;
}

export interface QueryStats {
  query: string;
  count: number;
  zeroResultCount: number;
  totalClicks: number;
  ctr: number; // click-through rate [0..1]
  avgLatencyMs: number;
  avgResultCount: number;
}

export interface TrendingQuery {
  query: string;
  recentCount: number;
  historicalCount: number;
  /** growth ratio: recentCount / historicalCount, or Infinity if historical = 0 */
  growth: number;
}

export interface SearchAnalyticsSnapshot {
  totalSearches: number;
  uniqueQueries: number;
  zeroResultRate: number;
  avgLatencyMs: number;
  topQueries: QueryStats[];
  trendingQueries: TrendingQuery[];
  avgCtr: number;
}

export class SearchAnalytics {
  private searchEvents: SearchEvent[] = [];
  private clickEvents: ClickEvent[] = [];

  // Aggregated stats per normalized query
  private queryStats: Map<string, QueryStats> = new Map();
  // Latency sum per query for running average
  private latencySum: Map<string, number> = new Map();
  private resultCountSum: Map<string, number> = new Map();

  /** Maximum events to keep in memory (older ones are dropped) */
  private readonly maxEvents: number;

  constructor(maxEvents = 100_000) {
    this.maxEvents = maxEvents;
  }

  // ─── Recording ───────────────────────────────────────────────────────────

  /** Record a search event */
  recordSearch(event: SearchEvent): void {
    this.searchEvents.push(event);
    if (this.searchEvents.length > this.maxEvents) {
      this.searchEvents.splice(0, Math.floor(this.maxEvents * 0.1));
    }

    const key = this.normalizeQuery(event.query);
    const existing = this.queryStats.get(key);

    if (existing) {
      existing.count++;
      if (event.resultCount === 0) existing.zeroResultCount++;
      this.latencySum.set(key, (this.latencySum.get(key) ?? 0) + event.latencyMs);
      this.resultCountSum.set(key, (this.resultCountSum.get(key) ?? 0) + event.resultCount);
      existing.avgLatencyMs = (this.latencySum.get(key) ?? 0) / existing.count;
      existing.avgResultCount = (this.resultCountSum.get(key) ?? 0) / existing.count;
    } else {
      this.latencySum.set(key, event.latencyMs);
      this.resultCountSum.set(key, event.resultCount);
      this.queryStats.set(key, {
        query: key,
        count: 1,
        zeroResultCount: event.resultCount === 0 ? 1 : 0,
        totalClicks: 0,
        ctr: 0,
        avgLatencyMs: event.latencyMs,
        avgResultCount: event.resultCount,
      });
    }
  }

  /** Record a click-through event */
  recordClick(event: ClickEvent): void {
    this.clickEvents.push(event);
    if (this.clickEvents.length > this.maxEvents) {
      this.clickEvents.splice(0, Math.floor(this.maxEvents * 0.1));
    }

    const key = this.normalizeQuery(event.query);
    const stats = this.queryStats.get(key);
    if (stats) {
      stats.totalClicks++;
      // CTR = clicks / searches
      stats.ctr = stats.count > 0 ? stats.totalClicks / stats.count : 0;
    }
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /** Top-K queries by search count */
  topQueries(k = 10): QueryStats[] {
    return [...this.queryStats.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, k);
  }

  /** Queries that returned zero results */
  zeroResultQueries(limit = 50): QueryStats[] {
    return [...this.queryStats.values()]
      .filter((s) => s.zeroResultCount > 0)
      .sort((a, b) => b.zeroResultCount - a.zeroResultCount)
      .slice(0, limit);
  }

  /** Zero-result rate across all searches */
  zeroResultRate(): number {
    if (this.searchEvents.length === 0) return 0;
    const zeroCount = this.searchEvents.filter((e) => e.resultCount === 0).length;
    return zeroCount / this.searchEvents.length;
  }

  /** Average search latency in milliseconds */
  avgLatencyMs(): number {
    if (this.searchEvents.length === 0) return 0;
    const total = this.searchEvents.reduce((sum, e) => sum + e.latencyMs, 0);
    return total / this.searchEvents.length;
  }

  /** Click-through rate for a specific query (or overall average) */
  clickThroughRate(query?: string): number {
    if (query) {
      const key = this.normalizeQuery(query);
      const stats = this.queryStats.get(key);
      return stats?.ctr ?? 0;
    }
    // Overall CTR
    const stats = [...this.queryStats.values()];
    if (stats.length === 0) return 0;
    const totalSearches = stats.reduce((s, q) => s + q.count, 0);
    const totalClicks = stats.reduce((s, q) => s + q.totalClicks, 0);
    return totalSearches > 0 ? totalClicks / totalSearches : 0;
  }

  /**
   * Query suggestions based on prefix matching against popular queries.
   * Returns up to `limit` suggestions sorted by frequency.
   */
  suggest(prefix: string, limit = 5): string[] {
    const normalized = this.normalizeQuery(prefix);
    if (!normalized) return [];

    return [...this.queryStats.values()]
      .filter((s) => s.query.startsWith(normalized))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((s) => s.query);
  }

  /**
   * Trending queries: compare recent window vs historical window.
   * recentWindowMs: time window for "recent" (default: 24h)
   * historicalWindowMs: time window before that for "historical" (default: 7d)
   */
  trendingQueries(
    recentWindowMs = 24 * 60 * 60 * 1000,
    historicalWindowMs = 7 * 24 * 60 * 60 * 1000,
    limit = 10
  ): TrendingQuery[] {
    const now = Date.now();
    const recentStart = now - recentWindowMs;
    const historicalStart = recentStart - historicalWindowMs;

    // Count queries in each window
    const recentCounts = new Map<string, number>();
    const historicalCounts = new Map<string, number>();

    for (const event of this.searchEvents) {
      const key = this.normalizeQuery(event.query);
      if (event.timestamp >= recentStart) {
        recentCounts.set(key, (recentCounts.get(key) ?? 0) + 1);
      } else if (event.timestamp >= historicalStart) {
        historicalCounts.set(key, (historicalCounts.get(key) ?? 0) + 1);
      }
    }

    // Normalize by window duration ratio
    const windowRatio = recentWindowMs / historicalWindowMs;

    const trends: TrendingQuery[] = [];

    for (const [query, recentCount] of recentCounts) {
      const historicalCount = historicalCounts.get(query) ?? 0;
      // Normalize historical to same time scale
      const normalizedHistorical = historicalCount * windowRatio;
      const growth =
        normalizedHistorical === 0
          ? recentCount > 0
            ? Infinity
            : 1
          : recentCount / normalizedHistorical;

      trends.push({ query, recentCount, historicalCount, growth });
    }

    return trends
      .filter((t) => t.growth > 1)
      .sort((a, b) => {
        // Sort by growth but put Infinity after finite values
        const ag = isFinite(a.growth) ? a.growth : a.recentCount * 1e6;
        const bg = isFinite(b.growth) ? b.growth : b.recentCount * 1e6;
        return bg - ag;
      })
      .slice(0, limit);
  }

  /** Search latency breakdown for a specific query */
  queryLatencyStats(query: string): { avg: number; min: number; max: number; count: number } {
    const key = this.normalizeQuery(query);
    const events = this.searchEvents.filter(
      (e) => this.normalizeQuery(e.query) === key
    );

    if (events.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }

    const latencies = events.map((e) => e.latencyMs);
    return {
      avg: latencies.reduce((s, v) => s + v, 0) / latencies.length,
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      count: events.length,
    };
  }

  /** Full analytics snapshot */
  snapshot(topK = 10): SearchAnalyticsSnapshot {
    return {
      totalSearches: this.searchEvents.length,
      uniqueQueries: this.queryStats.size,
      zeroResultRate: this.zeroResultRate(),
      avgLatencyMs: this.avgLatencyMs(),
      topQueries: this.topQueries(topK),
      trendingQueries: this.trendingQueries(),
      avgCtr: this.clickThroughRate(),
    };
  }

  /** Reset all data */
  reset(): void {
    this.searchEvents = [];
    this.clickEvents = [];
    this.queryStats = new Map();
    this.latencySum = new Map();
    this.resultCountSum = new Map();
  }

  /** Total number of search events recorded */
  get totalSearches(): number {
    return this.searchEvents.length;
  }

  /** Total number of unique queries */
  get uniqueQueryCount(): number {
    return this.queryStats.size;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, " ");
  }
}
