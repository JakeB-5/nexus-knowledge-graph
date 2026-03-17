// AlertManager: rule evaluation, state transitions, grouping, silencing
import type {
  AlertGroup,
  AlertInstance,
  AlertRule,
  AlertStatus,
  Labels,
  SilenceRule,
} from "../types.js";
import { AlertStatus as AlertStatusEnum } from "../types.js";
import type { AlertCondition, MetricQueryFn } from "./conditions.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationChannel = (group: AlertGroup) => void | Promise<void>;

export interface AlertRuleConfig {
  rule: AlertRule;
  condition: AlertCondition;
}

export interface AlertManagerOptions {
  /** How often to evaluate rules (ms, default: 15000) */
  evaluationIntervalMs?: number;
  /** Function to query metric values */
  queryFn?: MetricQueryFn;
  /** Hysteresis: minimum time (ms) between firing→resolved transition (default: 0) */
  resolveHysteresisMs?: number;
  /** Maximum alert history entries to keep per rule (default: 100) */
  maxHistoryPerRule?: number;
}

export interface AlertHistoryEntry {
  status: AlertStatus;
  timestamp: number;
  value: number;
  message: string;
}

// ─── AlertManager ─────────────────────────────────────────────────────────────

export class AlertManager {
  private readonly rules: Map<string, AlertRuleConfig> = new Map();
  private readonly instances: Map<string, AlertInstance> = new Map();
  private readonly silences: Map<string, SilenceRule> = new Map();
  private readonly channels: Map<string, NotificationChannel> = new Map();
  private readonly history: Map<string, AlertHistoryEntry[]> = new Map();

  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private readonly evalIntervalMs: number;
  private queryFn: MetricQueryFn;
  private readonly resolveHysteresisMs: number;
  private readonly maxHistory: number;

  // Track when a rule last resolved (for hysteresis)
  private readonly lastResolved: Map<string, number> = new Map();

  constructor(options: AlertManagerOptions = {}) {
    this.evalIntervalMs = options.evaluationIntervalMs ?? 15_000;
    this.queryFn = options.queryFn ?? defaultQueryFn;
    this.resolveHysteresisMs = options.resolveHysteresisMs ?? 0;
    this.maxHistory = options.maxHistoryPerRule ?? 100;
  }

  // ─── Rule management ──────────────────────────────────────────────────────

  /**
   * Register an alert rule with its condition.
   */
  addRule(config: AlertRuleConfig): void {
    if (this.rules.has(config.rule.id)) {
      throw new Error(`Alert rule "${config.rule.id}" already registered`);
    }
    this.rules.set(config.rule.id, config);
    this.history.set(config.rule.id, []);
  }

  /**
   * Remove an alert rule and its current instance.
   */
  removeRule(ruleId: string): boolean {
    this.instances.delete(ruleId);
    this.history.delete(ruleId);
    this.lastResolved.delete(ruleId);
    return this.rules.delete(ruleId);
  }

  /**
   * Enable or disable a rule by ID.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const config = this.rules.get(ruleId);
    if (!config) throw new Error(`Rule "${ruleId}" not found`);
    config.rule.enabled = enabled;
    if (!enabled) {
      this.instances.delete(ruleId);
    }
  }

  getRules(): AlertRuleConfig[] {
    return [...this.rules.values()];
  }

  getRule(ruleId: string): AlertRuleConfig | undefined {
    return this.rules.get(ruleId);
  }

  // ─── Silence management ───────────────────────────────────────────────────

  addSilence(silence: SilenceRule): void {
    this.silences.set(silence.id, silence);
  }

  removeSilence(silenceId: string): boolean {
    return this.silences.delete(silenceId);
  }

  getSilences(): SilenceRule[] {
    return [...this.silences.values()];
  }

  private isSilenced(instance: AlertInstance): boolean {
    const now = Date.now();
    for (const silence of this.silences.values()) {
      if (silence.startsAt > now || silence.endsAt < now) continue;

      const allMatch = silence.matchers.every(matcher => {
        const instanceValue = instance.labels[matcher.name] ?? instance.rule.labels?.[matcher.name];
        if (!instanceValue) return false;
        if (matcher.isRegex) {
          return new RegExp(matcher.value).test(instanceValue);
        }
        return instanceValue === matcher.value;
      });

      if (allMatch) return true;
    }
    return false;
  }

  // ─── Notification channels ────────────────────────────────────────────────

  addChannel(name: string, channel: NotificationChannel): void {
    this.channels.set(name, channel);
  }

  removeChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  // ─── Evaluation ───────────────────────────────────────────────────────────

  /**
   * Set the metric query function used for evaluation.
   */
  setQueryFn(fn: MetricQueryFn): void {
    this.queryFn = fn;
  }

  /**
   * Start periodic rule evaluation.
   */
  start(): void {
    if (this.evaluationInterval) return;
    this.evaluationInterval = setInterval(() => {
      void this.evaluate();
    }, this.evalIntervalMs);

    if (this.evaluationInterval.unref) {
      this.evaluationInterval.unref();
    }
  }

  /**
   * Stop periodic evaluation.
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }

  /**
   * Run a single evaluation cycle across all enabled rules.
   */
  async evaluate(): Promise<void> {
    const now = Date.now();
    const groupMap = new Map<string, AlertGroup>();

    for (const config of this.rules.values()) {
      if (!config.rule.enabled) continue;

      const evalResult = config.condition.evaluate(this.queryFn, config.rule.labels);
      const existing = this.instances.get(config.rule.id);

      let instance = existing ?? this.createInstance(config.rule, now);
      instance = this.transition(instance, evalResult.isFiring, evalResult.value, evalResult.message, now);
      this.instances.set(config.rule.id, instance);

      this.appendHistory(config.rule.id, {
        status: instance.status,
        timestamp: now,
        value: evalResult.value,
        message: evalResult.message,
      });

      // Group for notifications
      if (instance.status === AlertStatusEnum.Firing && !this.isSilenced(instance)) {
        const groupName = config.rule.labels?.["alertgroup"] ?? "default";
        let group = groupMap.get(groupName);
        if (!group) {
          group = { name: groupName, alerts: [], labels: config.rule.labels ?? {} };
          groupMap.set(groupName, group);
        }
        group.alerts.push(instance);
      }
    }

    // Send notifications for firing groups
    for (const group of groupMap.values()) {
      await this.notify(group);
    }
  }

  private createInstance(rule: AlertRule, now: number): AlertInstance {
    return {
      rule,
      status: AlertStatusEnum.Pending,
      startedAt: now,
      updatedAt: now,
      value: 0,
      labels: rule.labels ?? {},
      annotations: rule.annotations ?? {},
      fingerprint: this.fingerprint(rule),
    };
  }

  private transition(
    instance: AlertInstance,
    isFiring: boolean,
    value: number,
    _message: string,
    now: number,
  ): AlertInstance {
    const updated = { ...instance, value, updatedAt: now };

    if (isFiring) {
      if (instance.status === AlertStatusEnum.Pending) {
        const pendingDuration = now - instance.startedAt;
        if (pendingDuration >= instance.rule.duration) {
          updated.status = AlertStatusEnum.Firing;
        }
        // else remain pending
      } else if (instance.status === AlertStatusEnum.Resolved) {
        // Re-firing — check hysteresis
        const lastRes = this.lastResolved.get(instance.rule.id) ?? 0;
        if (now - lastRes >= this.resolveHysteresisMs) {
          updated.status = AlertStatusEnum.Pending;
          updated.startedAt = now;
          delete updated.resolvedAt;
        }
        // else suppress re-fire (hysteresis)
      }
      // If already firing, stay firing
    } else {
      if (
        instance.status === AlertStatusEnum.Firing ||
        instance.status === AlertStatusEnum.Pending
      ) {
        updated.status = AlertStatusEnum.Resolved;
        updated.resolvedAt = now;
        this.lastResolved.set(instance.rule.id, now);
      }
    }

    return updated;
  }

  private async notify(group: AlertGroup): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel(group);
      } catch {
        // Notification errors are swallowed to not disrupt evaluation
      }
    }
  }

  private appendHistory(ruleId: string, entry: AlertHistoryEntry): void {
    const hist = this.history.get(ruleId) ?? [];
    hist.push(entry);
    if (hist.length > this.maxHistory) {
      hist.splice(0, hist.length - this.maxHistory);
    }
    this.history.set(ruleId, hist);
  }

  private fingerprint(rule: AlertRule): string {
    const labelStr = JSON.stringify(rule.labels ?? {});
    return `${rule.id}:${rule.name}:${labelStr}`;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get all current alert instances.
   */
  getInstances(): AlertInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Get instances filtered by status.
   */
  getInstancesByStatus(status: AlertStatus): AlertInstance[] {
    return [...this.instances.values()].filter(i => i.status === status);
  }

  /**
   * Get firing alerts.
   */
  getFiringAlerts(): AlertInstance[] {
    return this.getInstancesByStatus(AlertStatusEnum.Firing);
  }

  /**
   * Get alert instance for a rule.
   */
  getInstance(ruleId: string): AlertInstance | undefined {
    return this.instances.get(ruleId);
  }

  /**
   * Get alert history for a rule.
   */
  getHistory(ruleId: string): AlertHistoryEntry[] {
    return [...(this.history.get(ruleId) ?? [])];
  }

  /**
   * Get all alert instances grouped by alertgroup label.
   */
  getGroups(): AlertGroup[] {
    const groupMap = new Map<string, AlertGroup>();
    for (const instance of this.instances.values()) {
      if (instance.status !== AlertStatusEnum.Firing) continue;
      const groupName = instance.labels["alertgroup"] ?? "default";
      let group = groupMap.get(groupName);
      if (!group) {
        group = { name: groupName, alerts: [], labels: {} };
        groupMap.set(groupName, group);
      }
      group.alerts.push(instance);
    }
    return [...groupMap.values()];
  }

  /**
   * Clear all alert instances (useful for testing).
   */
  clearInstances(): void {
    this.instances.clear();
    this.lastResolved.clear();
  }
}

// ─── Default query function ───────────────────────────────────────────────────

const defaultQueryFn: MetricQueryFn = (_query: string, _labels?: Labels) => ({
  value: 0,
  timestamp: Date.now(),
  labels: _labels ?? {},
  hasData: false,
});
