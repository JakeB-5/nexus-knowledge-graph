// Alert condition types and evaluation logic
import type { Labels } from "../types.js";

// ─── Query interface ──────────────────────────────────────────────────────────

export interface MetricQueryResult {
  value: number;
  timestamp: number;
  labels: Labels;
  hasData: boolean;
}

export type MetricQueryFn = (query: string, labels?: Labels) => MetricQueryResult;

// ─── Condition interface ──────────────────────────────────────────────────────

export interface ConditionEvaluation {
  /** Whether the condition is currently true (alert should fire) */
  isFiring: boolean;
  /** The metric value used for evaluation */
  value: number;
  /** Human-readable evaluation message */
  message: string;
  /** Whether there was data to evaluate */
  hasData: boolean;
}

export interface AlertCondition {
  readonly type: string;
  evaluate(query: MetricQueryFn, labels?: Labels): ConditionEvaluation;
  describe(): string;
}

// ─── ThresholdCondition ───────────────────────────────────────────────────────

export type ComparisonOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";

export interface ThresholdConditionOptions {
  /** Metric query string (e.g. "http_requests_total") */
  metricQuery: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Threshold value to compare against */
  threshold: number;
  /** How long (ms) the condition must be true before firing (default: 0) */
  forDuration?: number;
}

function compare(value: number, operator: ComparisonOperator, threshold: number): boolean {
  switch (operator) {
    case "gt":  return value > threshold;
    case "gte": return value >= threshold;
    case "lt":  return value < threshold;
    case "lte": return value <= threshold;
    case "eq":  return value === threshold;
    case "neq": return value !== threshold;
  }
}

function operatorSymbol(op: ComparisonOperator): string {
  const symbols: Record<ComparisonOperator, string> = {
    gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "==", neq: "!=",
  };
  return symbols[op];
}

export class ThresholdCondition implements AlertCondition {
  readonly type = "threshold";
  private readonly opts: Required<ThresholdConditionOptions>;
  private readonly firingStartTime: Map<string, number> = new Map();

  constructor(options: ThresholdConditionOptions) {
    this.opts = {
      metricQuery: options.metricQuery,
      operator: options.operator,
      threshold: options.threshold,
      forDuration: options.forDuration ?? 0,
    };
  }

  evaluate(query: MetricQueryFn, labels?: Labels): ConditionEvaluation {
    const result = query(this.opts.metricQuery, labels);
    const key = JSON.stringify(labels ?? {});

    if (!result.hasData) {
      this.firingStartTime.delete(key);
      return { isFiring: false, value: 0, message: "No data", hasData: false };
    }

    const conditionMet = compare(result.value, this.opts.operator, this.opts.threshold);

    if (conditionMet) {
      if (!this.firingStartTime.has(key)) {
        this.firingStartTime.set(key, Date.now());
      }
      const elapsed = Date.now() - (this.firingStartTime.get(key) ?? Date.now());
      const isFiring = elapsed >= this.opts.forDuration;

      return {
        isFiring,
        value: result.value,
        hasData: true,
        message: isFiring
          ? `Value ${result.value} ${operatorSymbol(this.opts.operator)} ${this.opts.threshold} for ${elapsed}ms`
          : `Condition met for ${elapsed}ms, pending for ${this.opts.forDuration - elapsed}ms`,
      };
    } else {
      this.firingStartTime.delete(key);
      return {
        isFiring: false,
        value: result.value,
        hasData: true,
        message: `Value ${result.value} does not match ${operatorSymbol(this.opts.operator)} ${this.opts.threshold}`,
      };
    }
  }

  describe(): string {
    const d = this.opts.forDuration > 0 ? ` for ${this.opts.forDuration}ms` : "";
    return `${this.opts.metricQuery} ${operatorSymbol(this.opts.operator)} ${this.opts.threshold}${d}`;
  }

  reset(): void {
    this.firingStartTime.clear();
  }
}

// ─── RateCondition ────────────────────────────────────────────────────────────

export interface RateConditionOptions {
  metricQuery: string;
  /** Rate threshold (units per second) */
  threshold: number;
  operator: ComparisonOperator;
  /** Window over which to calculate rate (ms, default: 60000) */
  windowMs?: number;
}

interface RateSample {
  value: number;
  timestamp: number;
}

export class RateCondition implements AlertCondition {
  readonly type = "rate";
  private readonly opts: Required<RateConditionOptions>;
  private readonly samples: Map<string, RateSample[]> = new Map();

  constructor(options: RateConditionOptions) {
    this.opts = {
      metricQuery: options.metricQuery,
      threshold: options.threshold,
      operator: options.operator,
      windowMs: options.windowMs ?? 60_000,
    };
  }

  evaluate(query: MetricQueryFn, labels?: Labels): ConditionEvaluation {
    const result = query(this.opts.metricQuery, labels);
    const key = JSON.stringify(labels ?? {});

    if (!result.hasData) {
      return { isFiring: false, value: 0, message: "No data", hasData: false };
    }

    const now = Date.now();
    let samples = this.samples.get(key) ?? [];

    // Add new sample
    samples.push({ value: result.value, timestamp: now });

    // Prune samples outside the window
    const windowStart = now - this.opts.windowMs;
    samples = samples.filter(s => s.timestamp >= windowStart);
    this.samples.set(key, samples);

    if (samples.length < 2) {
      return { isFiring: false, value: 0, message: "Insufficient samples for rate calculation", hasData: true };
    }

    const oldest = samples[0]!;
    const newest = samples[samples.length - 1]!;
    const deltaValue = newest.value - oldest.value;
    const deltaTime = (newest.timestamp - oldest.timestamp) / 1000; // seconds
    const rate = deltaTime > 0 ? deltaValue / deltaTime : 0;

    const isFiring = compare(rate, this.opts.operator, this.opts.threshold);
    return {
      isFiring,
      value: rate,
      hasData: true,
      message: `Rate ${rate.toFixed(4)}/s ${isFiring ? "exceeds" : "within"} threshold ${this.opts.threshold}/s`,
    };
  }

  describe(): string {
    return `rate(${this.opts.metricQuery}[${this.opts.windowMs}ms]) ${operatorSymbol(this.opts.operator)} ${this.opts.threshold}/s`;
  }
}

// ─── AbsenceCondition ─────────────────────────────────────────────────────────

export interface AbsenceConditionOptions {
  metricQuery: string;
  /** Fire alert if no data for this long (ms, default: 300000 = 5min) */
  absentForMs?: number;
}

export class AbsenceCondition implements AlertCondition {
  readonly type = "absence";
  private readonly opts: Required<AbsenceConditionOptions>;
  private readonly lastSeen: Map<string, number> = new Map();

  constructor(options: AbsenceConditionOptions) {
    this.opts = {
      metricQuery: options.metricQuery,
      absentForMs: options.absentForMs ?? 300_000,
    };
  }

  evaluate(query: MetricQueryFn, labels?: Labels): ConditionEvaluation {
    const result = query(this.opts.metricQuery, labels);
    const key = JSON.stringify(labels ?? {});
    const now = Date.now();

    if (result.hasData) {
      this.lastSeen.set(key, now);
      return { isFiring: false, value: result.value, hasData: true, message: "Data present" };
    }

    const last = this.lastSeen.get(key);
    if (last === undefined) {
      // Never seen data — fire immediately
      return {
        isFiring: true,
        value: 0,
        hasData: false,
        message: `No data ever received for ${this.opts.metricQuery}`,
      };
    }

    const absentFor = now - last;
    const isFiring = absentFor >= this.opts.absentForMs;
    return {
      isFiring,
      value: 0,
      hasData: false,
      message: isFiring
        ? `No data for ${absentFor}ms (threshold: ${this.opts.absentForMs}ms)`
        : `No data for ${absentFor}ms, threshold not reached`,
    };
  }

  describe(): string {
    return `absent(${this.opts.metricQuery}) for ${this.opts.absentForMs}ms`;
  }
}

// ─── CompoundCondition ────────────────────────────────────────────────────────

export type LogicalOperator = "and" | "or";

export interface CompoundConditionOptions {
  conditions: AlertCondition[];
  operator: LogicalOperator;
}

export class CompoundCondition implements AlertCondition {
  readonly type = "compound";
  private readonly conditions: AlertCondition[];
  private readonly operator: LogicalOperator;

  constructor(options: CompoundConditionOptions) {
    if (options.conditions.length === 0) {
      throw new Error("CompoundCondition requires at least one condition");
    }
    this.conditions = [...options.conditions];
    this.operator = options.operator;
  }

  evaluate(query: MetricQueryFn, labels?: Labels): ConditionEvaluation {
    const evaluations = this.conditions.map(c => c.evaluate(query, labels));

    const isFiring = this.operator === "and"
      ? evaluations.every(e => e.isFiring)
      : evaluations.some(e => e.isFiring);

    const firingCount = evaluations.filter(e => e.isFiring).length;
    const message = `${this.operator.toUpperCase()} [${firingCount}/${evaluations.length} firing]: `
      + evaluations.map(e => e.message).join(" | ");

    const avgValue = evaluations.reduce((sum, e) => sum + e.value, 0) / evaluations.length;
    const hasData = evaluations.some(e => e.hasData);

    return { isFiring, value: avgValue, hasData, message };
  }

  describe(): string {
    return `(${this.conditions.map(c => c.describe()).join(` ${this.operator.toUpperCase()} `)})`;
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function threshold(
  metricQuery: string,
  operator: ComparisonOperator,
  value: number,
  forDuration?: number,
): ThresholdCondition {
  return new ThresholdCondition({ metricQuery, operator, threshold: value, forDuration });
}

export function rate(
  metricQuery: string,
  operator: ComparisonOperator,
  thresholdPerSecond: number,
  windowMs?: number,
): RateCondition {
  return new RateCondition({ metricQuery, operator, threshold: thresholdPerSecond, windowMs });
}

export function absent(metricQuery: string, absentForMs?: number): AbsenceCondition {
  return new AbsenceCondition({ metricQuery, absentForMs });
}

export function allOf(...conditions: AlertCondition[]): CompoundCondition {
  return new CompoundCondition({ conditions, operator: "and" });
}

export function anyOf(...conditions: AlertCondition[]): CompoundCondition {
  return new CompoundCondition({ conditions, operator: "or" });
}
