import { describe, it, expect, beforeEach } from "vitest";
import { SearchAnalytics } from "../search-analytics.js";
import { UserAnalytics } from "../user-analytics.js";
import { ContentAnalytics } from "../content-analytics.js";
import { ReportGenerator } from "../report-generator.js";
import { EventCollector } from "../collectors/event-collector.js";
import { MetricCollector, Counter, Gauge, Histogram } from "../collectors/metric-collector.js";
import type { GraphNode, GraphEdge } from "@nexus/graph";
import type { NodeMetadata } from "../content-analytics.js";
import type { UserAction } from "../user-analytics.js";
import type { SearchEvent, ClickEvent } from "../search-analytics.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function node(id: string, type = "concept"): GraphNode {
  return { id, type };
}

function edge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target, type: "link", weight: 1 };
}

function nodeMeta(id: string, overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    nodeId: id,
    type: "concept",
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 24 * 60 * 60 * 1000,
    tags: ["tag1"],
    contentLength: 500,
    outgoingLinks: 2,
    incomingLinks: 1,
    customFields: ["field1", "field2"],
    ...overrides,
  };
}

// ─── SearchAnalytics ──────────────────────────────────────────────────────────

describe("SearchAnalytics", () => {
  let sa: SearchAnalytics;

  beforeEach(() => {
    sa = new SearchAnalytics();
  });

  it("records searches and tracks counts", () => {
    const now = Date.now();
    sa.recordSearch({ query: "graph theory", timestamp: now, resultCount: 5, latencyMs: 50 });
    sa.recordSearch({ query: "graph theory", timestamp: now + 1, resultCount: 3, latencyMs: 30 });
    expect(sa.totalSearches).toBe(2);
    expect(sa.uniqueQueryCount).toBe(1);
  });

  it("normalizes queries (case-insensitive)", () => {
    const now = Date.now();
    sa.recordSearch({ query: "Graph Theory", timestamp: now, resultCount: 1, latencyMs: 10 });
    sa.recordSearch({ query: "graph theory", timestamp: now + 1, resultCount: 2, latencyMs: 15 });
    expect(sa.uniqueQueryCount).toBe(1);
  });

  it("tracks zero-result queries", () => {
    sa.recordSearch({ query: "unknown term", timestamp: Date.now(), resultCount: 0, latencyMs: 5 });
    const zeroQ = sa.zeroResultQueries();
    expect(zeroQ.length).toBeGreaterThan(0);
    expect(zeroQ[0]?.zeroResultCount).toBe(1);
  });

  it("computes zero-result rate", () => {
    const now = Date.now();
    sa.recordSearch({ query: "q1", timestamp: now, resultCount: 5, latencyMs: 10 });
    sa.recordSearch({ query: "q2", timestamp: now + 1, resultCount: 0, latencyMs: 5 });
    expect(sa.zeroResultRate()).toBeCloseTo(0.5, 5);
  });

  it("computes average latency", () => {
    const now = Date.now();
    sa.recordSearch({ query: "a", timestamp: now, resultCount: 1, latencyMs: 100 });
    sa.recordSearch({ query: "b", timestamp: now + 1, resultCount: 1, latencyMs: 200 });
    expect(sa.avgLatencyMs()).toBe(150);
  });

  it("records clicks and computes CTR", () => {
    const now = Date.now();
    sa.recordSearch({ query: "nexus", timestamp: now, resultCount: 10, latencyMs: 20 });
    sa.recordSearch({ query: "nexus", timestamp: now + 1, resultCount: 10, latencyMs: 25 });
    sa.recordClick({ query: "nexus", resultId: "node1", position: 0, timestamp: now + 2 });
    expect(sa.clickThroughRate("nexus")).toBeCloseTo(0.5, 5);
  });

  it("generates query suggestions by prefix", () => {
    const now = Date.now();
    sa.recordSearch({ query: "graph theory", timestamp: now, resultCount: 5, latencyMs: 10 });
    sa.recordSearch({ query: "graph traversal", timestamp: now + 1, resultCount: 3, latencyMs: 10 });
    sa.recordSearch({ query: "knowledge base", timestamp: now + 2, resultCount: 2, latencyMs: 10 });
    const suggestions = sa.suggest("graph");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.startsWith("graph"))).toBe(true);
  });

  it("returns top queries sorted by count", () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      sa.recordSearch({ query: "popular", timestamp: now + i, resultCount: 1, latencyMs: 10 });
    }
    sa.recordSearch({ query: "rare", timestamp: now + 10, resultCount: 1, latencyMs: 10 });
    const top = sa.topQueries(2);
    expect(top[0]?.query).toBe("popular");
    expect(top[0]?.count).toBe(3);
  });

  it("snapshot returns summary", () => {
    sa.recordSearch({ query: "test", timestamp: Date.now(), resultCount: 1, latencyMs: 10 });
    const snap = sa.snapshot();
    expect(snap.totalSearches).toBe(1);
    expect(snap.uniqueQueries).toBe(1);
  });
});

// ─── UserAnalytics ────────────────────────────────────────────────────────────

describe("UserAnalytics", () => {
  let ua: UserAnalytics;

  beforeEach(() => {
    ua = new UserAnalytics();
  });

  it("records actions and counts them", () => {
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: Date.now() });
    ua.recordAction({ userId: "u1", actionType: "edit", timestamp: Date.now() });
    expect(ua.totalActions).toBe(2);
  });

  it("computes DAU correctly", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: today.getTime() });
    ua.recordAction({ userId: "u2", actionType: "view", timestamp: today.getTime() });
    ua.recordAction({ userId: "u1", actionType: "search", timestamp: today.getTime() + 1000 });
    expect(ua.dau(today)).toBe(2); // 2 unique users
  });

  it("engagement score ranks active users higher", () => {
    const now = Date.now();
    // u1: many creates (high weight)
    for (let i = 0; i < 5; i++) {
      ua.recordAction({ userId: "u1", actionType: "create", timestamp: now + i });
    }
    // u2: one view
    ua.recordAction({ userId: "u2", actionType: "view", timestamp: now });

    const scores = ua.engagementScores();
    const u1 = scores.find((s) => s.userId === "u1");
    const u2 = scores.find((s) => s.userId === "u2");
    expect(u1!.score).toBeGreaterThan(u2!.score);
  });

  it("topUsers returns sorted descending", () => {
    const now = Date.now();
    ua.recordAction({ userId: "low", actionType: "view", timestamp: now });
    for (let i = 0; i < 3; i++) {
      ua.recordAction({ userId: "high", actionType: "create", timestamp: now + i });
    }
    const top = ua.topUsers(2);
    expect(top[0]!.userId).toBe("high");
  });

  it("session tracking works", () => {
    ua.startSession("sess1", "u1", Date.now());
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: Date.now(), sessionId: "sess1" });
    ua.endSession("sess1", Date.now() + 5000);
    expect(ua.totalSessions).toBe(1);
    const sessions = ua.userSessions("u1");
    expect(sessions).toHaveLength(1);
  });

  it("activityHeatmap has correct dimensions", () => {
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: Date.now() });
    const heatmap = ua.activityHeatmap();
    expect(heatmap.matrix).toHaveLength(24);
    expect(heatmap.matrix[0]).toHaveLength(7);
    expect(heatmap.dayLabels).toHaveLength(7);
    expect(heatmap.hourLabels).toHaveLength(24);
  });

  it("activityHeatmap increments correct cell", () => {
    // Create an action at a known time
    const d = new Date(2024, 0, 8, 10, 0, 0); // Monday 10:00
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: d.getTime() });
    const heatmap = ua.activityHeatmap();
    const hour10 = heatmap.matrix[10];
    const monday = d.getDay(); // 1
    expect(hour10?.[monday]).toBeGreaterThan(0);
  });

  it("retentionCohorts returns cohort data", () => {
    const base = new Date(2024, 0, 1).getTime(); // Jan 1, 2024
    // Week 0: u1 active both weeks
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: base });
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: base + 8 * 24 * 60 * 60 * 1000 });
    // u2 only week 0
    ua.recordAction({ userId: "u2", actionType: "view", timestamp: base + 1000 });

    const cohorts = ua.retentionCohorts(2);
    expect(cohorts.length).toBeGreaterThan(0);
    const first = cohorts[0]!;
    expect(first.size).toBeGreaterThan(0);
    expect(first.retention).toHaveLength(3); // week 0 + 2 subsequent
  });
});

// ─── ContentAnalytics ─────────────────────────────────────────────────────────

describe("ContentAnalytics", () => {
  let ca: ContentAnalytics;

  beforeEach(() => {
    ca = new ContentAnalytics({ staleThresholdMs: 30 * 24 * 60 * 60 * 1000 });
  });

  it("registers nodes and counts them", () => {
    ca.registerNode(nodeMeta("n1"));
    ca.registerNode(nodeMeta("n2"));
    expect(ca.nodeCount).toBe(2);
  });

  it("tracks most viewed nodes", () => {
    ca.registerNode(nodeMeta("n1"));
    ca.registerNode(nodeMeta("n2"));
    const now = Date.now();
    ca.recordView({ nodeId: "n1", userId: "u1", timestamp: now });
    ca.recordView({ nodeId: "n1", userId: "u2", timestamp: now + 1 });
    ca.recordView({ nodeId: "n2", userId: "u1", timestamp: now + 2 });
    const top = ca.mostViewed(2);
    expect(top[0]?.nodeId).toBe("n1");
    expect(top[0]?.views).toBe(2);
  });

  it("detects orphan nodes (no incoming edges)", () => {
    ca.registerNode(nodeMeta("orphan", { incomingLinks: 0 }));
    ca.registerNode(nodeMeta("connected", { incomingLinks: 3 }));
    const orphans = ca.orphanNodes();
    expect(orphans).toContain("orphan");
    expect(orphans).not.toContain("connected");
  });

  it("detects dead-end nodes (no outgoing edges)", () => {
    ca.registerNode(nodeMeta("dead", { outgoingLinks: 0 }));
    ca.registerNode(nodeMeta("linked", { outgoingLinks: 2 }));
    expect(ca.deadEndNodes()).toContain("dead");
    expect(ca.deadEndNodes()).not.toContain("linked");
  });

  it("detects stale nodes", () => {
    const staleTime = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    ca.registerNode(nodeMeta("stale", { updatedAt: staleTime }));
    ca.registerNode(nodeMeta("fresh", { updatedAt: Date.now() }));
    const stale = ca.staleNodes();
    expect(stale).toContain("stale");
    expect(stale).not.toContain("fresh");
  });

  it("computes quality scores between 0 and 100", () => {
    ca.registerNode(nodeMeta("n1"));
    const qs = ca.qualityScore("n1");
    expect(qs).not.toBeNull();
    expect(qs!.score).toBeGreaterThanOrEqual(0);
    expect(qs!.score).toBeLessThanOrEqual(100);
  });

  it("quality score breakdown sums to total", () => {
    ca.registerNode(nodeMeta("n1"));
    const qs = ca.qualityScore("n1")!;
    const sum = Object.values(qs.breakdown).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(qs.score, 0);
  });

  it("tag usage counts correctly", () => {
    ca.registerNode(nodeMeta("n1", { tags: ["a", "b"] }));
    ca.registerNode(nodeMeta("n2", { tags: ["a", "c"] }));
    const tags = ca.tagUsage();
    const tagA = tags.find((t) => t.tag === "a");
    expect(tagA?.count).toBe(2);
  });

  it("growth rate returns positive avgPerDay for multiple nodes", () => {
    const base = Date.now() - 10 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) {
      ca.registerNode(nodeMeta(`n${i}`, { createdAt: base + i * 24 * 60 * 60 * 1000 }));
    }
    const growth = ca.growthRate();
    expect(growth.avgPerDay).toBeGreaterThan(0);
  });
});

// ─── ReportGenerator ─────────────────────────────────────────────────────────

describe("ReportGenerator", () => {
  it("generates a daily report with all sections", () => {
    const gen = new ReportGenerator();
    const nodes = [node("A"), node("B"), node("C")];
    const edges = [edge("e1", "A", "B"), edge("e2", "B", "C")];

    const ca = new ContentAnalytics();
    ca.registerNode(nodeMeta("A"));
    ca.registerNode(nodeMeta("B"));

    const ua = new UserAnalytics();
    ua.recordAction({ userId: "u1", actionType: "view", timestamp: Date.now() });

    const sa = new SearchAnalytics();
    sa.recordSearch({ query: "test", timestamp: Date.now(), resultCount: 2, latencyMs: 15 });

    const report = gen.generateDaily({ nodes, edges, contentAnalytics: ca, userAnalytics: ua, searchAnalytics: sa });

    expect(report.type).toBe("daily");
    expect(report.sections.overview.totalNodes).toBe(3);
    expect(report.sections.overview.totalEdges).toBe(2);
    expect(report.sections.graphHealth).toBeDefined();
    expect(report.sections.content).toBeDefined();
    expect(report.sections.users).toBeDefined();
    expect(report.sections.search).toBeDefined();
  });

  it("detects increasing trend", () => {
    const gen = new ReportGenerator({ trendConfidenceThreshold: 0.5 });
    const trend = gen.detectTrend([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(trend.direction).toBe("increasing");
    expect(trend.confidence).toBeGreaterThan(0.5);
  });

  it("detects decreasing trend", () => {
    const gen = new ReportGenerator({ trendConfidenceThreshold: 0.5 });
    const trend = gen.detectTrend([10, 8, 6, 4, 2, 1]);
    expect(trend.direction).toBe("decreasing");
  });

  it("detects stable trend when R² is low", () => {
    const gen = new ReportGenerator({ trendConfidenceThreshold: 0.8 });
    const trend = gen.detectTrend([5, 3, 7, 2, 8, 1]); // noisy, low R²
    expect(trend.direction).toBe("stable");
  });

  it("detects anomalies via z-score", () => {
    const gen = new ReportGenerator({ anomalyZThreshold: 2.0 });
    // 9 normal values and 1 extreme outlier
    const series = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
    const anomalies = gen.detectAnomalies(series);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.value).toBe(100);
  });

  it("summary stats are correct", () => {
    const gen = new ReportGenerator();
    const stats = gen.summaryStats([1, 2, 3, 4, 5]);
    expect(stats.count).toBe(5);
    expect(stats.mean).toBe(3);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
  });
});

// ─── EventCollector ───────────────────────────────────────────────────────────

describe("EventCollector", () => {
  it("collects events into buffer", () => {
    const ec = new EventCollector({ flushIntervalMs: 0 });
    ec.collect({ type: "node_view", timestamp: Date.now(), userId: "u1", properties: {} });
    expect(ec.bufferLength).toBe(1);
    expect(ec.totalCollected).toBe(1);
    ec.stop();
  });

  it("deduplicates events within window", () => {
    const ec = new EventCollector({ flushIntervalMs: 0, dedupeWindowMs: 1000 });
    const ts = Date.now();
    ec.collect({ type: "node_view", timestamp: ts, userId: "u1", nodeId: "n1", properties: {} });
    ec.collect({ type: "node_view", timestamp: ts + 100, userId: "u1", nodeId: "n1", properties: {} });
    expect(ec.bufferLength).toBe(1);
    expect(ec.totalDropped).toBe(1);
    ec.stop();
  });

  it("allows same event after dedupe window expires", () => {
    const ec = new EventCollector({ flushIntervalMs: 0, dedupeWindowMs: 100 });
    const ts = Date.now();
    ec.collect({ type: "node_view", timestamp: ts, userId: "u1", nodeId: "n1", properties: {} });
    ec.collect({ type: "node_view", timestamp: ts + 500, userId: "u1", nodeId: "n1", properties: {} });
    expect(ec.bufferLength).toBe(2);
    ec.stop();
  });

  it("applies sampling rate", () => {
    const ec = new EventCollector({ flushIntervalMs: 0, samplingRate: 0, sampledEventTypes: ["node_view"] });
    ec.collect({ type: "node_view", timestamp: Date.now(), userId: "u1", properties: {} });
    // With rate=0, all sampled events should be dropped
    expect(ec.totalCollected).toBe(0);
    expect(ec.totalDropped).toBe(1);
    ec.stop();
  });

  it("flushSync returns and clears buffer", () => {
    const ec = new EventCollector({ flushIntervalMs: 0 });
    ec.collect({ type: "login", timestamp: Date.now(), userId: "u1", properties: {} });
    const flushed = ec.flushSync();
    expect(flushed).toHaveLength(1);
    expect(ec.bufferLength).toBe(0);
    ec.stop();
  });

  it("convenience methods work", () => {
    const ec = new EventCollector({ flushIntervalMs: 0 });
    ec.nodeView("u1", "n1");
    ec.nodeCreate("u1", "n2");
    ec.search("u1", "query", 5, 20);
    expect(ec.totalCollected).toBe(3);
    ec.stop();
  });
});

// ─── MetricCollector ──────────────────────────────────────────────────────────

describe("MetricCollector", () => {
  it("Counter increments correctly", () => {
    const c = new Counter({ name: "requests", type: "counter" });
    c.inc();
    c.inc(5);
    expect(c.value).toBe(6);
  });

  it("Counter throws on negative delta", () => {
    const c = new Counter({ name: "requests", type: "counter" });
    expect(() => c.inc(-1)).toThrow();
  });

  it("Gauge set/inc/dec works", () => {
    const g = new Gauge({ name: "connections", type: "gauge" });
    g.set(10);
    g.inc(2);
    g.dec(3);
    expect(g.value).toBe(9);
  });

  it("Histogram observe and count", () => {
    const h = new Histogram({ name: "latency", type: "histogram" }, [10, 50, 100, 500]);
    h.observe(5);
    h.observe(30);
    h.observe(200);
    expect(h.count).toBe(3);
    expect(h.sum).toBeCloseTo(235, 5);
  });

  it("Histogram p50 estimate", () => {
    const h = new Histogram({ name: "lat", type: "histogram" }, [10, 20, 30, 40, 50]);
    for (let i = 1; i <= 10; i++) h.observe(i * 5); // 5,10,15,20,25,30,35,40,45,50
    const p50 = h.estimatePercentile(50);
    expect(p50).toBeGreaterThan(0);
    expect(p50).toBeLessThanOrEqual(50);
  });

  it("MetricCollector registers and snapshots metrics", () => {
    const mc = new MetricCollector({ snapshotIntervalMs: 0 });
    mc.increment("api.calls", 3, { endpoint: "/search" });
    mc.setGauge("memory.mb", 256);
    const snapshots = mc.takeSnapshot();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    mc.stop();
  });

  it("MetricCollector exports to TimeSeries", () => {
    const mc = new MetricCollector({ snapshotIntervalMs: 0 });
    mc.increment("counter", 1);
    mc.takeSnapshot(1000);
    mc.increment("counter", 2);
    mc.takeSnapshot(2000);
    const ts = mc.exportToTimeSeries("counter");
    expect(ts.size).toBe(2);
    mc.stop();
  });

  it("MetricCollector metricNames returns all registered names", () => {
    const mc = new MetricCollector({ snapshotIntervalMs: 0 });
    mc.increment("hits");
    mc.setGauge("memory");
    mc.observeHistogram("latency", 100, [50, 100, 200]);
    const names = mc.metricNames();
    expect(names).toContain("hits");
    expect(names).toContain("memory");
    expect(names).toContain("latency");
    mc.stop();
  });
});
