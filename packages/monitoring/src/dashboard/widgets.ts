// Dashboard widget types and data-fetching logic
import type {
  Dashboard,
  DashboardWidget,
  GaugeWidget,
  HeatmapBucket,
  HeatmapWidget,
  Labels,
  StatWidget,
  TableWidget,
  TimeSeriesDataPoint,
  TimeSeriesWidget,
  WidgetPosition,
} from "../types.js";

// ─── Widget query interface ───────────────────────────────────────────────────

export interface WidgetQueryResult {
  value: number;
  timestamp: number;
  labels: Labels;
}

export interface RangeQueryResult {
  dataPoints: Array<{ timestamp: number; value: number; labels: Labels }>;
}

export type InstantQueryFn = (query: string, labels?: Labels) => WidgetQueryResult;
export type RangeQueryFn = (query: string, from: number, to: number, stepMs?: number) => RangeQueryResult;

// ─── Widget builder helpers ───────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── TimeSeriesWidget builder ─────────────────────────────────────────────────

export interface TimeSeriesWidgetConfig {
  id?: string;
  title: string;
  metricQuery: string;
  position?: WidgetPosition;
  timeRange?: { from: number; to: number };
  stepMs?: number;
  yAxis?: { min?: number; max?: number; unit?: string };
  refreshInterval?: number;
}

export function buildTimeSeriesWidget(
  config: TimeSeriesWidgetConfig,
  queryFn: RangeQueryFn,
): TimeSeriesWidget {
  const now = Date.now();
  const timeRange = config.timeRange ?? { from: now - 3_600_000, to: now };

  const result = queryFn(config.metricQuery, timeRange.from, timeRange.to, config.stepMs);
  const data: TimeSeriesDataPoint[] = result.dataPoints.map(p => ({
    timestamp: p.timestamp,
    value: p.value,
    labels: p.labels,
  }));

  return {
    id: config.id ?? generateId(),
    type: "timeseries",
    title: config.title,
    metricQuery: config.metricQuery,
    position: config.position ?? { x: 0, y: 0, width: 12, height: 8 },
    timeRange,
    data,
    yAxis: config.yAxis,
    refreshInterval: config.refreshInterval,
  };
}

// ─── GaugeWidget builder ──────────────────────────────────────────────────────

export interface GaugeWidgetConfig {
  id?: string;
  title: string;
  metricQuery: string;
  position?: WidgetPosition;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: Array<{ value: number; color: string }>;
  refreshInterval?: number;
}

export function buildGaugeWidget(
  config: GaugeWidgetConfig,
  queryFn: InstantQueryFn,
): GaugeWidget {
  const result = queryFn(config.metricQuery);

  return {
    id: config.id ?? generateId(),
    type: "gauge",
    title: config.title,
    metricQuery: config.metricQuery,
    position: config.position ?? { x: 0, y: 0, width: 6, height: 4 },
    value: result.value,
    min: config.min ?? 0,
    max: config.max ?? 100,
    unit: config.unit,
    thresholds: config.thresholds ?? [
      { value: 0, color: "green" },
      { value: 75, color: "yellow" },
      { value: 90, color: "red" },
    ],
    refreshInterval: config.refreshInterval,
  };
}

// ─── TableWidget builder ──────────────────────────────────────────────────────

export interface TableWidgetConfig {
  id?: string;
  title: string;
  metricQuery: string;
  position?: WidgetPosition;
  columns?: string[];
  refreshInterval?: number;
}

export interface TableDataRow {
  labels: Labels;
  value: number;
  timestamp: number;
}

export function buildTableWidget(
  config: TableWidgetConfig,
  rows: TableDataRow[],
): TableWidget {
  const allKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.labels)) {
      allKeys.add(key);
    }
  }
  allKeys.add("value");
  allKeys.add("timestamp");

  const columns = config.columns ?? [...allKeys];

  const tableRows = rows.map(row => {
    const result: Record<string, string | number> = {};
    for (const col of columns) {
      if (col === "value") {
        result[col] = row.value;
      } else if (col === "timestamp") {
        result[col] = row.timestamp;
      } else {
        result[col] = row.labels[col] ?? "";
      }
    }
    return result;
  });

  return {
    id: config.id ?? generateId(),
    type: "table",
    title: config.title,
    metricQuery: config.metricQuery,
    position: config.position ?? { x: 0, y: 0, width: 12, height: 6 },
    columns,
    rows: tableRows,
    refreshInterval: config.refreshInterval,
  };
}

// ─── StatWidget builder ───────────────────────────────────────────────────────

export interface StatWidgetConfig {
  id?: string;
  title: string;
  metricQuery: string;
  position?: WidgetPosition;
  unit?: string;
  colorMode?: "value" | "background";
  thresholds?: Array<{ value: number; color: string }>;
  refreshInterval?: number;
}

export function buildStatWidget(
  config: StatWidgetConfig,
  queryFn: InstantQueryFn,
  previousQueryFn?: InstantQueryFn,
): StatWidget {
  const result = queryFn(config.metricQuery);
  const previous = previousQueryFn?.(config.metricQuery);

  return {
    id: config.id ?? generateId(),
    type: "stat",
    title: config.title,
    metricQuery: config.metricQuery,
    position: config.position ?? { x: 0, y: 0, width: 4, height: 3 },
    value: result.value,
    previousValue: previous?.value,
    unit: config.unit,
    colorMode: config.colorMode ?? "value",
    thresholds: config.thresholds ?? [
      { value: 0, color: "green" },
      { value: 80, color: "yellow" },
      { value: 95, color: "red" },
    ],
    refreshInterval: config.refreshInterval,
  };
}

// ─── HeatmapWidget builder ────────────────────────────────────────────────────

export interface HeatmapWidgetConfig {
  id?: string;
  title: string;
  metricQuery: string;
  position?: WidgetPosition;
  xBuckets?: number[];
  yBuckets?: number[];
  refreshInterval?: number;
}

export interface HeatmapDataPoint {
  x: number;
  y: number;
}

export function buildHeatmapWidget(
  config: HeatmapWidgetConfig,
  dataPoints: HeatmapDataPoint[],
): HeatmapWidget {
  // Auto-detect buckets if not provided
  const xVals = dataPoints.map(p => p.x);
  const yVals = dataPoints.map(p => p.y);

  const xBuckets = config.xBuckets ?? computeBuckets(xVals, 10);
  const yBuckets = config.yBuckets ?? computeBuckets(yVals, 10);

  // Build count grid
  const grid = new Map<string, number>();

  for (const point of dataPoints) {
    const xIdx = findBucketIndex(xBuckets, point.x);
    const yIdx = findBucketIndex(yBuckets, point.y);
    const key = `${xIdx}:${yIdx}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  const data: HeatmapBucket[] = [];
  for (const [key, count] of grid) {
    const [xStr, yStr] = key.split(":");
    const xBucket = parseInt(xStr ?? "0", 10);
    const yBucket = parseInt(yStr ?? "0", 10);
    data.push({ xBucket, yBucket, count });
  }

  return {
    id: config.id ?? generateId(),
    type: "heatmap",
    title: config.title,
    metricQuery: config.metricQuery,
    position: config.position ?? { x: 0, y: 0, width: 12, height: 8 },
    xBuckets,
    yBuckets,
    data,
    refreshInterval: config.refreshInterval,
  };
}

// ─── Dashboard builder ────────────────────────────────────────────────────────

export interface DashboardConfig {
  id?: string;
  title: string;
  tags?: string[];
}

export class DashboardBuilder {
  private readonly config: DashboardConfig;
  private readonly widgets: DashboardWidget[] = [];

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  addWidget(widget: DashboardWidget): this {
    this.widgets.push(widget);
    return this;
  }

  addTimeSeries(widget: TimeSeriesWidget): this {
    return this.addWidget(widget);
  }

  addGauge(widget: GaugeWidget): this {
    return this.addWidget(widget);
  }

  addTable(widget: TableWidget): this {
    return this.addWidget(widget);
  }

  addStat(widget: StatWidget): this {
    return this.addWidget(widget);
  }

  addHeatmap(widget: HeatmapWidget): this {
    return this.addWidget(widget);
  }

  /**
   * Auto-layout widgets in a grid (left to right, top to bottom).
   * gridWidth: total column units (default: 24)
   */
  autoLayout(gridWidth: number = 24): this {
    let x = 0;
    let y = 0;
    let rowHeight = 0;

    for (const widget of this.widgets) {
      const w = widget.position.width;
      const h = widget.position.height;

      if (x + w > gridWidth) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }

      widget.position.x = x;
      widget.position.y = y;

      x += w;
      if (h > rowHeight) rowHeight = h;
    }

    return this;
  }

  build(): Dashboard {
    const now = Date.now();
    return {
      id: this.config.id ?? generateId(),
      title: this.config.title,
      widgets: [...this.widgets],
      tags: this.config.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeBuckets(values: number[], count: number): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min];

  const step = (max - min) / count;
  const buckets: number[] = [];
  for (let i = 0; i <= count; i++) {
    buckets.push(min + step * i);
  }
  return buckets;
}

function findBucketIndex(buckets: number[], value: number): number {
  for (let i = 0; i < buckets.length - 1; i++) {
    if (value <= (buckets[i + 1] ?? Infinity)) return i;
  }
  return buckets.length - 1;
}

/**
 * Get the color for a threshold-based widget given the current value.
 */
export function getThresholdColor(
  value: number,
  thresholds: Array<{ value: number; color: string }>,
): string {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return sorted[sorted.length - 1]?.color ?? "green";
}

/**
 * Calculate percent change between two values.
 */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return ((current - previous) / Math.abs(previous)) * 100;
}
