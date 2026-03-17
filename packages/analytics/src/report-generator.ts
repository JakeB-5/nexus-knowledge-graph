// ReportGenerator: produces structured analytics reports with trend and anomaly detection

import type {
  AnalyticsReport,
  OverviewSection,
  GraphHealthSection,
  ContentSection,
  UsersSection,
  SearchSection,
  TrendInfo,
  AnomalyPoint,
} from "./types.js";
import { GraphMetrics } from "./graph-metrics.js";
import { ContentAnalytics } from "./content-analytics.js";
import { UserAnalytics } from "./user-analytics.js";
import { SearchAnalytics } from "./search-analytics.js";
import { linearRegression, mean, stdDeviation, zScore } from "./statistics.js";
import type { GraphNode, GraphEdge } from "@nexus/graph";

export interface ReportInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  contentAnalytics: ContentAnalytics;
  userAnalytics: UserAnalytics;
  searchAnalytics: SearchAnalytics;
  /** Historical metric series for trend/anomaly detection: name → [value, ...] (oldest first) */
  metricSeries?: Record<string, number[]>;
}

export interface ReportGeneratorOptions {
  /** Z-score threshold for anomaly detection (default: 2.5) */
  anomalyZThreshold?: number;
  /** Minimum R² to consider a trend significant (default: 0.3) */
  trendConfidenceThreshold?: number;
}

export class ReportGenerator {
  private readonly anomalyZThreshold: number;
  private readonly trendConfidenceThreshold: number;

  constructor(options: ReportGeneratorOptions = {}) {
    this.anomalyZThreshold = options.anomalyZThreshold ?? 2.5;
    this.trendConfidenceThreshold = options.trendConfidenceThreshold ?? 0.3;
  }

  // ─── Main entry points ────────────────────────────────────────────────────

  generateDaily(input: ReportInput, referenceDate = new Date()): AnalyticsReport {
    const end = startOfDay(referenceDate).getTime() + 24 * 60 * 60 * 1000;
    const start = end - 24 * 60 * 60 * 1000;
    return this.generate(input, "daily", start, end);
  }

  generateWeekly(input: ReportInput, referenceDate = new Date()): AnalyticsReport {
    const end = startOfDay(referenceDate).getTime() + 24 * 60 * 60 * 1000;
    const start = end - 7 * 24 * 60 * 60 * 1000;
    return this.generate(input, "weekly", start, end);
  }

  generateMonthly(input: ReportInput, referenceDate = new Date()): AnalyticsReport {
    const end = startOfDay(referenceDate).getTime() + 24 * 60 * 60 * 1000;
    const start = end - 30 * 24 * 60 * 60 * 1000;
    return this.generate(input, "monthly", start, end);
  }

  generate(
    input: ReportInput,
    type: "daily" | "weekly" | "monthly",
    startTime: number,
    endTime: number
  ): AnalyticsReport {
    const id = `report-${type}-${startTime}`;
    const graphMetrics = new GraphMetrics(input.nodes, input.edges);

    return {
      id,
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      type,
      sections: {
        overview: this.buildOverview(input, graphMetrics, startTime, endTime),
        graphHealth: this.buildGraphHealth(graphMetrics, input.nodes, input.edges),
        content: this.buildContent(input.contentAnalytics, startTime, endTime),
        users: this.buildUsers(input.userAnalytics, startTime, endTime),
        search: this.buildSearch(input.searchAnalytics, startTime, endTime),
      },
    };
  }

  // ─── Section builders ─────────────────────────────────────────────────────

  private buildOverview(
    input: ReportInput,
    graphMetrics: GraphMetrics,
    startTime: number,
    endTime: number
  ): OverviewSection {
    const trends: Record<string, TrendInfo> = {};
    const allAnomalies: AnomalyPoint[] = [];

    if (input.metricSeries) {
      for (const [name, series] of Object.entries(input.metricSeries)) {
        trends[name] = this.detectTrend(series);
        const anomalies = this.detectAnomalies(series, name);
        allAnomalies.push(...anomalies);
      }
    }

    return {
      totalNodes: input.nodes.length,
      totalEdges: input.edges.length,
      activeUsers: input.userAnalytics.actionCount(startTime, endTime),
      totalSearches: input.searchAnalytics.totalSearches,
      trends,
      anomalies: allAnomalies,
    };
  }

  private buildGraphHealth(
    graphMetrics: GraphMetrics,
    nodes: GraphNode[],
    _edges: GraphEdge[]
  ): GraphHealthSection {
    const degDist = graphMetrics.degreeDistribution();
    const clustering = graphMetrics.clusteringCoefficient();
    const wcc = graphMetrics.weaklyConnectedComponents();

    // Orphan and dead-end counts from degree distribution
    let orphanCount = 0;
    let deadEndCount = 0;
    for (const node of nodes) {
      if ((degDist.inDegree.get(node.id) ?? 0) === 0) orphanCount++;
      if ((degDist.outDegree.get(node.id) ?? 0) === 0) deadEndCount++;
    }

    return {
      density: graphMetrics.density(),
      avgDegree: degDist.avg,
      clusteringCoefficient: clustering.global,
      connectedComponents: wcc.count,
      orphanNodes: orphanCount,
      deadEndNodes: deadEndCount,
      avgPathLength: graphMetrics.averagePathLength(30),
    };
  }

  private buildContent(
    ca: ContentAnalytics,
    startTime: number,
    endTime: number
  ): ContentSection {
    return {
      mostViewed: ca.mostViewed(10, startTime, endTime),
      mostEdited: ca.mostEdited(10, startTime, endTime),
      staleNodes: ca.staleNodes(),
      qualityDistribution: ca.qualityDistribution(),
      tagUsage: ca.tagUsage(20),
      growthRate: ca.growthRate().avgPerDay,
    };
  }

  private buildUsers(ua: UserAnalytics, _startTime: number, _endTime: number): UsersSection {
    const now = new Date();
    const heatmap = ua.activityHeatmap();

    return {
      dau: ua.dau(now),
      wau: ua.wau(now),
      mau: ua.mau(now),
      avgSessionDuration: ua.avgSessionDurationMs(),
      topUsers: ua.topUsers(10),
      retentionRate: this.computeOverallRetention(ua),
      activityHeatmap: heatmap.matrix,
    };
  }

  private buildSearch(sa: SearchAnalytics, _startTime: number, _endTime: number): SearchSection {
    const snapshot = sa.snapshot(10);
    return {
      totalSearches: snapshot.totalSearches,
      uniqueQueries: snapshot.uniqueQueries,
      zeroResultRate: snapshot.zeroResultRate,
      avgLatencyMs: snapshot.avgLatencyMs,
      topQueries: snapshot.topQueries.map((q) => ({
        query: q.query,
        count: q.count,
      })),
      trendingQueries: snapshot.trendingQueries.map((t) => ({
        query: t.query,
        growth: t.growth,
      })),
      avgClickThrough: snapshot.avgCtr,
    };
  }

  // ─── Trend detection ──────────────────────────────────────────────────────

  /**
   * Detect trend direction and magnitude from a time series of values.
   * Uses linear regression; x-values are indices (0, 1, 2, ...).
   */
  detectTrend(series: number[]): TrendInfo {
    if (series.length < 3) {
      return { direction: "stable", magnitude: 0, confidence: 0 };
    }

    const xs = series.map((_, i) => i);
    const { slope, rSquared } = linearRegression(xs, series);

    let direction: TrendInfo["direction"];
    if (rSquared < this.trendConfidenceThreshold) {
      direction = "stable";
    } else if (slope > 0) {
      direction = "increasing";
    } else if (slope < 0) {
      direction = "decreasing";
    } else {
      direction = "stable";
    }

    return { direction, magnitude: slope, confidence: rSquared };
  }

  // ─── Anomaly detection ────────────────────────────────────────────────────

  /**
   * Z-score based anomaly detection.
   * Returns points where |z-score| >= threshold.
   */
  detectAnomalies(
    series: number[],
    metricName: string = "metric"
  ): AnomalyPoint[] {
    if (series.length < 3) return [];

    const mu = mean(series);
    const sigma = stdDeviation(series);
    if (sigma === 0) return [];

    const anomalies: AnomalyPoint[] = [];
    for (let i = 0; i < series.length; i++) {
      const val = series[i] ?? 0;
      const z = zScore(val, mu, sigma);
      if (Math.abs(z) >= this.anomalyZThreshold) {
        anomalies.push({
          timestamp: i, // index as timestamp placeholder; caller should map
          value: val,
          zScore: z,
          expected: mu,
        });
      }
    }

    void metricName; // available for future labeling
    return anomalies;
  }

  // ─── Summary statistics ───────────────────────────────────────────────────

  /** Compute summary stats from an array of numbers */
  summaryStats(values: number[]): {
    count: number;
    mean: number;
    min: number;
    max: number;
    stdDev: number;
  } {
    if (values.length === 0) {
      return { count: 0, mean: 0, min: 0, max: 0, stdDev: 0 };
    }
    return {
      count: values.length,
      mean: mean(values),
      min: Math.min(...values),
      max: Math.max(...values),
      stdDev: stdDeviation(values),
    };
  }

  // ─── Retention helper ─────────────────────────────────────────────────────

  private computeOverallRetention(ua: UserAnalytics): number {
    const cohorts = ua.retentionCohorts(4);
    if (cohorts.length === 0) return 0;

    // Average week-1 retention across all cohorts
    const week1Retentions = cohorts
      .map((c) => c.retention[1] ?? 0)
      .filter((r) => r > 0);

    if (week1Retentions.length === 0) return 0;
    return week1Retentions.reduce((s, r) => s + r, 0) / week1Retentions.length;
  }
}

// ─── Date utility ─────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
