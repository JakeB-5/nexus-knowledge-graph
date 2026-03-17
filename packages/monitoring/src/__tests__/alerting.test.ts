import { describe, it, expect, beforeEach } from "vitest";
import {
  ThresholdCondition,
  RateCondition,
  AbsenceCondition,
  CompoundCondition,
  threshold,
  rate,
  absent,
  allOf,
  anyOf,
} from "../alerting/conditions.js";
import { AlertManager } from "../alerting/alert-manager.js";
import { AlertStatus } from "../types.js";
import type { MetricQueryResult } from "../alerting/conditions.js";
import type { AlertRuleConfig } from "../alerting/alert-manager.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQuery(value: number, hasData: boolean = true) {
  return (): MetricQueryResult => ({
    value,
    timestamp: Date.now(),
    labels: {},
    hasData,
  });
}

function makeRule(overrides: Partial<AlertRuleConfig["rule"]> = {}): AlertRuleConfig["rule"] {
  return {
    id: "rule-1",
    name: "Test Alert",
    expression: "test_metric > 10",
    duration: 0,
    severity: "warning",
    enabled: true,
    ...overrides,
  };
}

// ─── ThresholdCondition tests ─────────────────────────────────────────────────

describe("ThresholdCondition", () => {
  it("fires when value exceeds threshold (gt)", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "gt", threshold: 10 });
    const result = cond.evaluate(makeQuery(15));
    expect(result.isFiring).toBe(true);
    expect(result.value).toBe(15);
    expect(result.hasData).toBe(true);
  });

  it("does not fire when value is below threshold", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "gt", threshold: 10 });
    const result = cond.evaluate(makeQuery(5));
    expect(result.isFiring).toBe(false);
  });

  it("fires on gte operator at exact threshold", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "gte", threshold: 10 });
    expect(cond.evaluate(makeQuery(10)).isFiring).toBe(true);
    expect(cond.evaluate(makeQuery(9)).isFiring).toBe(false);
  });

  it("fires on lt operator", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "lt", threshold: 5 });
    expect(cond.evaluate(makeQuery(3)).isFiring).toBe(true);
    expect(cond.evaluate(makeQuery(5)).isFiring).toBe(false);
  });

  it("fires on eq operator", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "eq", threshold: 42 });
    expect(cond.evaluate(makeQuery(42)).isFiring).toBe(true);
    expect(cond.evaluate(makeQuery(41)).isFiring).toBe(false);
  });

  it("fires on neq operator", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "neq", threshold: 0 });
    expect(cond.evaluate(makeQuery(1)).isFiring).toBe(true);
    expect(cond.evaluate(makeQuery(0)).isFiring).toBe(false);
  });

  it("does not fire immediately when forDuration is set", () => {
    const cond = new ThresholdCondition({
      metricQuery: "m",
      operator: "gt",
      threshold: 5,
      forDuration: 60_000, // 1 minute
    });
    const result = cond.evaluate(makeQuery(10));
    expect(result.isFiring).toBe(false); // pending phase
  });

  it("returns false when no data", () => {
    const cond = new ThresholdCondition({ metricQuery: "m", operator: "gt", threshold: 0 });
    const result = cond.evaluate(makeQuery(0, false));
    expect(result.isFiring).toBe(false);
    expect(result.hasData).toBe(false);
  });

  it("describe() returns human-readable string", () => {
    const cond = new ThresholdCondition({ metricQuery: "cpu_usage", operator: "gt", threshold: 90 });
    expect(cond.describe()).toContain("cpu_usage");
    expect(cond.describe()).toContain("90");
    expect(cond.describe()).toContain(">");
  });

  it("factory function threshold() works", () => {
    const cond = threshold("metric", "gte", 5);
    expect(cond instanceof ThresholdCondition).toBe(true);
    expect(cond.evaluate(makeQuery(5)).isFiring).toBe(true);
  });
});

// ─── RateCondition tests ──────────────────────────────────────────────────────

describe("RateCondition", () => {
  it("returns no-fire with insufficient samples", () => {
    const cond = new RateCondition({ metricQuery: "m", operator: "gt", threshold: 1 });
    const result = cond.evaluate(makeQuery(100));
    expect(result.isFiring).toBe(false);
    expect(result.message).toContain("Insufficient");
  });

  it("does not fire when no data", () => {
    const cond = new RateCondition({ metricQuery: "m", operator: "gt", threshold: 1 });
    expect(cond.evaluate(makeQuery(0, false)).isFiring).toBe(false);
  });

  it("factory function rate() creates RateCondition", () => {
    const cond = rate("req_total", "gt", 100);
    expect(cond instanceof RateCondition).toBe(true);
  });

  it("describe() returns informative string", () => {
    const cond = rate("req_total", "gt", 100, 30_000);
    expect(cond.describe()).toContain("req_total");
    expect(cond.describe()).toContain("100");
  });
});

// ─── AbsenceCondition tests ───────────────────────────────────────────────────

describe("AbsenceCondition", () => {
  it("fires immediately when metric never seen", () => {
    const cond = new AbsenceCondition({ metricQuery: "m" });
    const result = cond.evaluate(makeQuery(0, false));
    expect(result.isFiring).toBe(true);
  });

  it("does not fire when data is present", () => {
    const cond = new AbsenceCondition({ metricQuery: "m" });
    cond.evaluate(makeQuery(5, true)); // record last seen
    const result = cond.evaluate(makeQuery(0, false));
    expect(result.isFiring).toBe(false); // absent for < threshold
  });

  it("factory function absent() works", () => {
    const cond = absent("metric", 5000);
    expect(cond instanceof AbsenceCondition).toBe(true);
  });

  it("describe() includes query and duration", () => {
    const cond = absent("my_metric", 60_000);
    expect(cond.describe()).toContain("my_metric");
  });
});

// ─── CompoundCondition tests ──────────────────────────────────────────────────

describe("CompoundCondition", () => {
  const trueCond = threshold("m", "gt", 0);
  const falseCond = threshold("m", "gt", 1000);

  it("AND: fires only when all conditions fire", () => {
    const query = makeQuery(5);
    const andCond = allOf(trueCond, falseCond);
    expect(andCond.evaluate(query).isFiring).toBe(false);

    const allTrue = allOf(trueCond, trueCond);
    expect(allTrue.evaluate(query).isFiring).toBe(true);
  });

  it("OR: fires when any condition fires", () => {
    const query = makeQuery(5);
    const orCond = anyOf(trueCond, falseCond);
    expect(orCond.evaluate(query).isFiring).toBe(true);

    const allFalse = anyOf(falseCond, falseCond);
    expect(allFalse.evaluate(query).isFiring).toBe(false);
  });

  it("throws when given empty conditions array", () => {
    expect(() => new CompoundCondition({ conditions: [], operator: "and" })).toThrow();
  });

  it("describe() combines sub-conditions", () => {
    const cond = allOf(trueCond, falseCond);
    expect(cond.describe()).toContain("AND");
  });
});

// ─── AlertManager tests ───────────────────────────────────────────────────────

describe("AlertManager", () => {
  let manager: AlertManager;

  beforeEach(() => {
    manager = new AlertManager({ evaluationIntervalMs: 60_000 });
  });

  it("registers and retrieves rules", () => {
    const config: AlertRuleConfig = {
      rule: makeRule(),
      condition: threshold("cpu", "gt", 90),
    };
    manager.addRule(config);
    expect(manager.getRules()).toHaveLength(1);
    expect(manager.getRule("rule-1")).toBeDefined();
  });

  it("throws on duplicate rule ID", () => {
    const config: AlertRuleConfig = { rule: makeRule(), condition: threshold("m", "gt", 1) };
    manager.addRule(config);
    expect(() => manager.addRule(config)).toThrow();
  });

  it("removes rules", () => {
    manager.addRule({ rule: makeRule(), condition: threshold("m", "gt", 1) });
    expect(manager.removeRule("rule-1")).toBe(true);
    expect(manager.getRules()).toHaveLength(0);
  });

  it("transitions from pending to firing on evaluation", async () => {
    const query = makeQuery(100); // value > threshold → fires
    manager.setQueryFn(query);

    manager.addRule({
      rule: makeRule({ duration: 0 }),
      condition: threshold("cpu", "gt", 50),
    });

    await manager.evaluate();
    const instance = manager.getInstance("rule-1");
    expect(instance?.status).toBe(AlertStatus.Firing);
    expect(instance?.value).toBe(100);
  });

  it("resolves firing alert when condition clears", async () => {
    let returnValue = 100;
    manager.setQueryFn(() => ({ value: returnValue, timestamp: Date.now(), labels: {}, hasData: true }));

    manager.addRule({
      rule: makeRule({ duration: 0 }),
      condition: threshold("cpu", "gt", 50),
    });

    await manager.evaluate(); // fires
    returnValue = 10; // condition clears
    await manager.evaluate(); // resolves

    const instance = manager.getInstance("rule-1");
    expect(instance?.status).toBe(AlertStatus.Resolved);
    expect(instance?.resolvedAt).toBeDefined();
  });

  it("disabled rules are not evaluated", async () => {
    manager.setQueryFn(makeQuery(100));
    manager.addRule({
      rule: makeRule({ enabled: false }),
      condition: threshold("cpu", "gt", 50),
    });
    await manager.evaluate();
    expect(manager.getInstance("rule-1")).toBeUndefined();
  });

  it("setRuleEnabled enables/disables a rule", () => {
    manager.addRule({ rule: makeRule(), condition: threshold("m", "gt", 1) });
    manager.setRuleEnabled("rule-1", false);
    expect(manager.getRule("rule-1")?.rule.enabled).toBe(false);
    manager.setRuleEnabled("rule-1", true);
    expect(manager.getRule("rule-1")?.rule.enabled).toBe(true);
  });

  it("records alert history", async () => {
    manager.setQueryFn(makeQuery(100));
    manager.addRule({ rule: makeRule({ duration: 0 }), condition: threshold("m", "gt", 50) });
    await manager.evaluate();
    const history = manager.getHistory("rule-1");
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.status).toBeDefined();
  });

  it("calls notification channel on firing alerts", async () => {
    const notified: string[] = [];
    manager.addChannel("test", group => { notified.push(group.name); });
    manager.setQueryFn(makeQuery(100));
    manager.addRule({ rule: makeRule({ duration: 0 }), condition: threshold("m", "gt", 50) });
    await manager.evaluate();
    expect(notified.length).toBeGreaterThan(0);
  });

  it("silences matching alerts", async () => {
    const notified: string[] = [];
    manager.addChannel("test", group => { notified.push(group.name); });
    manager.setQueryFn(makeQuery(100));
    manager.addRule({
      rule: makeRule({ duration: 0, labels: { env: "prod" } }),
      condition: threshold("m", "gt", 50),
    });

    manager.addSilence({
      id: "s1",
      matchers: [{ name: "env", value: "prod", isRegex: false }],
      startsAt: Date.now() - 1000,
      endsAt: Date.now() + 60_000,
      createdBy: "test",
      comment: "Silencing prod",
    });

    await manager.evaluate();
    expect(notified).toHaveLength(0);
  });

  it("getFiringAlerts returns only firing instances", async () => {
    manager.setQueryFn(makeQuery(100));
    manager.addRule({ rule: makeRule({ duration: 0 }), condition: threshold("m", "gt", 50) });
    await manager.evaluate();
    expect(manager.getFiringAlerts()).toHaveLength(1);
  });

  it("clearInstances resets all alert state", async () => {
    manager.setQueryFn(makeQuery(100));
    manager.addRule({ rule: makeRule({ duration: 0 }), condition: threshold("m", "gt", 50) });
    await manager.evaluate();
    manager.clearInstances();
    expect(manager.getInstances()).toHaveLength(0);
  });

  it("start/stop manages evaluation interval", () => {
    manager.start();
    manager.stop();
    // No errors thrown, interval managed
  });
});
