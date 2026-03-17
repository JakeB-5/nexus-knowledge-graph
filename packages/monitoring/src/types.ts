// Core types for the Nexus monitoring, observability, and tracing system

// ─── Metric Types ────────────────────────────────────────────────────────────

export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface MetricLabel {
  name: string;
  value: string;
}

export type Labels = Record<string, string>;

export interface MetricSample {
  name: string;
  type: MetricType;
  labels: Labels;
  value: number;
  timestamp: number;
  help?: string;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: MetricType;
  samples: MetricSample[];
}

export interface CounterOptions {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface GaugeOptions {
  name: string;
  help: string;
  labelNames?: string[];
  trackMinMax?: boolean;
}

export interface HistogramOptions {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
}

export interface SummaryOptions {
  name: string;
  help: string;
  labelNames?: string[];
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

// ─── Alert Types ─────────────────────────────────────────────────────────────

export enum AlertStatus {
  Pending = "pending",
  Firing = "firing",
  Resolved = "resolved",
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertRule {
  id: string;
  name: string;
  expression: string;
  duration: number; // milliseconds before transitioning pending→firing
  severity: AlertSeverity;
  labels?: Labels;
  annotations?: Record<string, string>;
  enabled: boolean;
}

export interface AlertInstance {
  rule: AlertRule;
  status: AlertStatus;
  startedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  value: number;
  labels: Labels;
  annotations: Record<string, string>;
  fingerprint: string;
}

export interface AlertGroup {
  name: string;
  alerts: AlertInstance[];
  labels: Labels;
}

export interface SilenceRule {
  id: string;
  matchers: Array<{ name: string; value: string; isRegex: boolean }>;
  startsAt: number;
  endsAt: number;
  createdBy: string;
  comment: string;
}

// ─── Dashboard Widget Types ───────────────────────────────────────────────────

export type WidgetType =
  | "timeseries"
  | "gauge"
  | "table"
  | "stat"
  | "heatmap";

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: WidgetPosition;
  metricQuery: string;
  refreshInterval?: number; // milliseconds
}

export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  labels: Labels;
}

export interface TimeSeriesWidget extends BaseWidget {
  type: "timeseries";
  timeRange: { from: number; to: number };
  data: TimeSeriesDataPoint[];
  yAxis?: { min?: number; max?: number; unit?: string };
}

export interface GaugeWidget extends BaseWidget {
  type: "gauge";
  value: number;
  min: number;
  max: number;
  thresholds: Array<{ value: number; color: string }>;
  unit?: string;
}

export interface TableWidget extends BaseWidget {
  type: "table";
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

export interface StatWidget extends BaseWidget {
  type: "stat";
  value: number;
  previousValue?: number;
  unit?: string;
  colorMode?: "value" | "background";
  thresholds?: Array<{ value: number; color: string }>;
}

export interface HeatmapBucket {
  xBucket: number;
  yBucket: number;
  count: number;
}

export interface HeatmapWidget extends BaseWidget {
  type: "heatmap";
  xBuckets: number[];
  yBuckets: number[];
  data: HeatmapBucket[];
}

export type DashboardWidget =
  | TimeSeriesWidget
  | GaugeWidget
  | TableWidget
  | StatWidget
  | HeatmapWidget;

export interface Dashboard {
  id: string;
  title: string;
  widgets: DashboardWidget[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── Health Types ─────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  duration: number; // milliseconds
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: number;
  duration: number;
  checks: HealthCheckResult[];
  dependencies?: Record<string, HealthReport>;
}

// ─── Trace Types ─────────────────────────────────────────────────────────────

export type SpanStatusCode = "unset" | "ok" | "error";

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
}

export interface SpanLink {
  context: SpanContext;
  attributes?: Record<string, AttributeValue>;
}

export type AttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, AttributeValue>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: { code: SpanStatusCode; message?: string };
  attributes: Record<string, AttributeValue>;
  events: SpanEvent[];
  links: SpanLink[];
  resource?: Record<string, AttributeValue>;
}

export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer";

export interface TraceContextData {
  traceId: string;
  spanId: string;
  baggage?: Record<string, string>;
}

export interface ExportResult {
  code: ExportResultCode;
  error?: Error;
}

export enum ExportResultCode {
  Success = 0,
  Failed = 1,
}
