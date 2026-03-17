// Analytics types for the Nexus knowledge graph platform

export interface MetricPoint {
  timestamp: number; // Unix ms
  value: number;
  labels?: Record<string, string>;
}

export type TimeSeriesData = MetricPoint[];

export enum AggregationType {
  Sum = "sum",
  Avg = "avg",
  Min = "min",
  Max = "max",
  Count = "count",
  P50 = "p50",
  P95 = "p95",
  P99 = "p99",
}

export interface MetricQuery {
  name: string;
  startTime: number;
  endTime: number;
  aggregation: AggregationType;
  intervalMs?: number; // bucket size for downsampling
  labels?: Record<string, string>; // filter by labels
}

export interface AggregatedMetric {
  timestamp: number;
  value: number;
  count: number;
}

export interface TrendInfo {
  direction: "increasing" | "decreasing" | "stable";
  magnitude: number; // slope of linear regression
  confidence: number; // R-squared value [0..1]
}

export interface AnomalyPoint {
  timestamp: number;
  value: number;
  zScore: number;
  expected: number;
}

export interface AnalyticsReport {
  id: string;
  generatedAt: number;
  period: { start: number; end: number };
  type: "daily" | "weekly" | "monthly";
  sections: {
    overview: OverviewSection;
    graphHealth: GraphHealthSection;
    content: ContentSection;
    users: UsersSection;
    search: SearchSection;
  };
}

export interface OverviewSection {
  totalNodes: number;
  totalEdges: number;
  activeUsers: number;
  totalSearches: number;
  trends: Record<string, TrendInfo>;
  anomalies: AnomalyPoint[];
}

export interface GraphHealthSection {
  density: number;
  avgDegree: number;
  clusteringCoefficient: number;
  connectedComponents: number;
  orphanNodes: number;
  deadEndNodes: number;
  avgPathLength: number;
}

export interface ContentSection {
  mostViewed: Array<{ nodeId: string; views: number }>;
  mostEdited: Array<{ nodeId: string; edits: number }>;
  staleNodes: string[];
  qualityDistribution: Record<string, number>;
  tagUsage: Array<{ tag: string; count: number }>;
  growthRate: number; // nodes per day
}

export interface UsersSection {
  dau: number;
  wau: number;
  mau: number;
  avgSessionDuration: number;
  topUsers: Array<{ userId: string; score: number }>;
  retentionRate: number;
  activityHeatmap: number[][]; // [hour][dayOfWeek]
}

export interface SearchSection {
  totalSearches: number;
  uniqueQueries: number;
  zeroResultRate: number;
  avgLatencyMs: number;
  topQueries: Array<{ query: string; count: number }>;
  trendingQueries: Array<{ query: string; growth: number }>;
  avgClickThrough: number;
}

// Dashboard widget types
export type WidgetType =
  | "line-chart"
  | "bar-chart"
  | "pie-chart"
  | "stat-card"
  | "table"
  | "heatmap";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  data: unknown;
  config: WidgetConfig;
}

export interface WidgetConfig {
  refreshIntervalMs?: number;
  timeRangeMs?: number;
  colors?: string[];
  showLegend?: boolean;
  unit?: string;
}

export interface LineChartWidget extends DashboardWidget {
  type: "line-chart";
  data: {
    series: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  };
}

export interface StatCardWidget extends DashboardWidget {
  type: "stat-card";
  data: {
    value: number | string;
    previousValue?: number | string;
    changePercent?: number;
    trend?: "up" | "down" | "neutral";
  };
}

export interface TableWidget extends DashboardWidget {
  type: "table";
  data: {
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
  };
}

export interface HeatmapWidget extends DashboardWidget {
  type: "heatmap";
  data: {
    matrix: number[][];
    rowLabels: string[];
    colLabels: string[];
  };
}
