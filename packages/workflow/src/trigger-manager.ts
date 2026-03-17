// TriggerManager - manages workflow triggers (event, schedule, webhook, manual)

import {
  Trigger,
  TriggerType,
  WorkflowDefinition,
  WorkflowError,
  WorkflowErrorCode,
  ConditionExpression,
  EventTriggerConfig,
  ScheduleConfig,
  WebhookTriggerConfig,
} from './types.js';
import { ExpressionEvaluator } from './expression.js';
import { ConditionStepExecutor } from './steps/condition-step.js';

export interface TriggerFireCallback {
  (workflowId: string, triggerId: string, payload: unknown): Promise<void>;
}

export interface RegisteredTrigger {
  workflowId: string;
  trigger: Trigger;
  registeredAt: Date;
}

export interface WebhookInfo {
  workflowId: string;
  triggerId: string;
  path: string;
  secret?: string;
  method: 'GET' | 'POST';
}

// Deduplication cache entry
interface DedupeEntry {
  key: string;
  firedAt: Date;
}

export class TriggerManager {
  private triggers: Map<string, RegisteredTrigger[]> = new Map(); // workflowId -> triggers
  private scheduleTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private eventListeners: Map<string, Array<{ workflowId: string; trigger: Trigger }>> = new Map();
  private webhooks: Map<string, WebhookInfo> = new Map(); // path -> info
  private dedupeCache: Map<string, DedupeEntry> = new Map();
  private fireCallback?: TriggerFireCallback;
  private evaluator: ExpressionEvaluator;
  private conditionExecutor: ConditionStepExecutor;

  constructor() {
    this.evaluator = new ExpressionEvaluator();
    this.conditionExecutor = new ConditionStepExecutor(this.evaluator);
  }

  /**
   * Set the callback to invoke when a trigger fires.
   */
  onFire(callback: TriggerFireCallback): void {
    this.fireCallback = callback;
  }

  /**
   * Register all triggers for a workflow definition.
   */
  registerWorkflowTriggers(definition: WorkflowDefinition): void {
    for (const trigger of definition.triggers) {
      this.registerTrigger(definition.id, trigger);
    }
  }

  /**
   * Register a single trigger for a workflow.
   */
  registerTrigger(workflowId: string, trigger: Trigger): void {
    const existing = this.triggers.get(workflowId) ?? [];
    existing.push({ workflowId, trigger, registeredAt: new Date() });
    this.triggers.set(workflowId, existing);

    switch (trigger.type) {
      case TriggerType.Schedule:
        this.setupScheduleTrigger(workflowId, trigger);
        break;
      case TriggerType.Event:
        this.setupEventTrigger(workflowId, trigger);
        break;
      case TriggerType.Webhook:
        this.setupWebhookTrigger(workflowId, trigger);
        break;
      case TriggerType.Manual:
        // Manual triggers are fired explicitly via fireManual()
        break;
    }
  }

  /**
   * Unregister all triggers for a workflow.
   */
  unregisterWorkflowTriggers(workflowId: string): void {
    const registered = this.triggers.get(workflowId) ?? [];

    for (const { trigger } of registered) {
      const timerId = `${workflowId}:${trigger.id}`;
      const timer = this.scheduleTimers.get(timerId);
      if (timer) {
        clearInterval(timer);
        this.scheduleTimers.delete(timerId);
      }

      if (trigger.type === TriggerType.Event) {
        const cfg = trigger.config as EventTriggerConfig;
        const listeners = this.eventListeners.get(cfg.eventType) ?? [];
        const filtered = listeners.filter(l => l.workflowId !== workflowId || l.trigger.id !== trigger.id);
        this.eventListeners.set(cfg.eventType, filtered);
      }

      if (trigger.type === TriggerType.Webhook) {
        const cfg = trigger.config as WebhookTriggerConfig;
        const path = this.buildWebhookPath(workflowId, trigger.id, cfg.path);
        this.webhooks.delete(path);
      }
    }

    this.triggers.delete(workflowId);
  }

  /**
   * Emit an event - fires matching event triggers.
   */
  async emitEvent(eventType: string, payload: unknown): Promise<void> {
    const listeners = this.eventListeners.get(eventType) ?? [];

    for (const { workflowId, trigger } of listeners) {
      await this.maybeFireTrigger(workflowId, trigger, payload);
    }
  }

  /**
   * Fire a manual trigger for a workflow.
   */
  async fireManual(workflowId: string, triggerId: string, payload?: unknown): Promise<void> {
    const registered = this.triggers.get(workflowId) ?? [];
    const entry = registered.find(r => r.trigger.id === triggerId && r.trigger.type === TriggerType.Manual);

    if (!entry) {
      throw new WorkflowError(
        WorkflowErrorCode.WorkflowNotFound,
        `No manual trigger '${triggerId}' found for workflow '${workflowId}'`
      );
    }

    await this.maybeFireTrigger(workflowId, entry.trigger, payload ?? null);
  }

  /**
   * Handle an incoming webhook request.
   * Returns true if a matching webhook was found and fired.
   */
  async handleWebhook(path: string, payload: unknown, secret?: string): Promise<boolean> {
    const info = this.webhooks.get(path);
    if (!info) return false;

    // Validate secret if configured
    if (info.secret && info.secret !== secret) {
      throw new WorkflowError(
        WorkflowErrorCode.StepFailed,
        'Webhook secret validation failed'
      );
    }

    const registered = this.triggers.get(info.workflowId) ?? [];
    const entry = registered.find(r => r.trigger.id === info.triggerId);
    if (!entry) return false;

    await this.maybeFireTrigger(info.workflowId, entry.trigger, payload);
    return true;
  }

  /**
   * Get all registered webhook paths.
   */
  getWebhooks(): WebhookInfo[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get all registered triggers for a workflow.
   */
  getTriggersForWorkflow(workflowId: string): RegisteredTrigger[] {
    return this.triggers.get(workflowId) ?? [];
  }

  /**
   * Get all registered triggers.
   */
  getAllTriggers(): RegisteredTrigger[] {
    const all: RegisteredTrigger[] = [];
    for (const list of this.triggers.values()) {
      all.push(...list);
    }
    return all;
  }

  /**
   * Clean up expired deduplication entries.
   */
  cleanupDedupeCache(): void {
    const now = new Date();
    for (const [key, entry] of this.dedupeCache) {
      // Default dedup window: 1 minute if not specified
      if (now.getTime() - entry.firedAt.getTime() > 60_000) {
        this.dedupeCache.delete(key);
      }
    }
  }

  /**
   * Stop all timers and clear state.
   */
  destroy(): void {
    for (const timer of this.scheduleTimers.values()) {
      clearInterval(timer);
    }
    this.scheduleTimers.clear();
    this.triggers.clear();
    this.eventListeners.clear();
    this.webhooks.clear();
    this.dedupeCache.clear();
  }

  // -------------------------------------------------------------------------
  // Private setup methods
  // -------------------------------------------------------------------------

  private setupScheduleTrigger(workflowId: string, trigger: Trigger): void {
    const cfg = trigger.config as ScheduleConfig;
    const intervalMs = this.parseCronToInterval(cfg.cron);

    if (intervalMs <= 0) return; // Invalid cron

    const timerId = `${workflowId}:${trigger.id}`;
    const timer = setInterval(async () => {
      await this.maybeFireTrigger(workflowId, trigger, {
        scheduledAt: new Date().toISOString(),
        cron: cfg.cron,
      });
    }, intervalMs);

    this.scheduleTimers.set(timerId, timer);
  }

  private setupEventTrigger(workflowId: string, trigger: Trigger): void {
    const cfg = trigger.config as EventTriggerConfig;
    const listeners = this.eventListeners.get(cfg.eventType) ?? [];
    listeners.push({ workflowId, trigger });
    this.eventListeners.set(cfg.eventType, listeners);
  }

  private setupWebhookTrigger(workflowId: string, trigger: Trigger): void {
    const cfg = trigger.config as WebhookTriggerConfig;
    const path = this.buildWebhookPath(workflowId, trigger.id, cfg.path);
    const method = cfg.method ?? 'POST';

    this.webhooks.set(path, {
      workflowId,
      triggerId: trigger.id,
      path,
      secret: cfg.secret,
      method,
    });
  }

  private buildWebhookPath(workflowId: string, triggerId: string, customPath?: string): string {
    if (customPath) return customPath.startsWith('/') ? customPath : `/${customPath}`;
    return `/webhooks/${workflowId}/${triggerId}`;
  }

  // -------------------------------------------------------------------------
  // Firing logic with deduplication and condition evaluation
  // -------------------------------------------------------------------------

  private async maybeFireTrigger(
    workflowId: string,
    trigger: Trigger,
    payload: unknown
  ): Promise<void> {
    // Evaluate trigger condition if set
    if (trigger.condition) {
      const shouldFire = this.evaluateTriggerCondition(trigger.condition.expression, payload);
      if (!shouldFire) return;
    }

    // Deduplication
    if (trigger.deduplicationKey) {
      const ctx = this.buildEvalContext(payload);
      const keyExpr = trigger.deduplicationKey;
      let dedupeKey: string;
      try {
        const evalCtx = { variables: ctx, stepResults: new Map() };
        dedupeKey = String(this.evaluator.evaluate(keyExpr, evalCtx) ?? keyExpr);
      } catch {
        dedupeKey = keyExpr;
      }

      const fullKey = `${workflowId}:${trigger.id}:${dedupeKey}`;
      const windowMs = trigger.deduplicationWindowMs ?? 60_000;
      const cached = this.dedupeCache.get(fullKey);

      if (cached && new Date().getTime() - cached.firedAt.getTime() < windowMs) {
        return; // Deduplicated
      }

      this.dedupeCache.set(fullKey, { key: fullKey, firedAt: new Date() });
    }

    // Fire!
    if (this.fireCallback) {
      await this.fireCallback(workflowId, trigger.id, payload);
    }
  }

  private evaluateTriggerCondition(condition: ConditionExpression, payload: unknown): boolean {
    const variables: Record<string, unknown> = {
      payload,
      ...(typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}),
    };

    const mockCtx = {
      workflowId: '',
      instanceId: '',
      variables,
      stepResults: new Map<string, import('./types.js').StepResult>(),
    };

    try {
      return this.conditionExecutor.evaluateCondition(condition, mockCtx);
    } catch {
      return false;
    }
  }

  private buildEvalContext(payload: unknown): Record<string, unknown> {
    if (typeof payload === 'object' && payload !== null) {
      return { payload, ...(payload as Record<string, unknown>) };
    }
    return { payload };
  }

  /**
   * Parse a simple cron expression to an interval in milliseconds.
   * Supports common patterns like "* * * * *" (every minute),
   * "0 * * * *" (every hour), "0 9 * * *" (daily at 9am).
   * This is a simplified implementation for common cases.
   */
  private parseCronToInterval(cron: string): number {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 0;

    const [minute, hour, dom, month, dow] = parts;

    // Every minute
    if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return 60_000;
    }
    // Every N minutes: */N * * * *
    if (minute?.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      const n = parseInt(minute.slice(2), 10);
      if (!isNaN(n) && n > 0) return n * 60_000;
    }
    // Every hour: 0 * * * *
    if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return 3_600_000;
    }
    // Every N hours: 0 */N * * *
    if (minute === '0' && hour?.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
      const n = parseInt(hour.slice(2), 10);
      if (!isNaN(n) && n > 0) return n * 3_600_000;
    }
    // Daily: 0 H * * * -> 24 hours
    if (minute === '0' && hour !== undefined && !hour.includes('*') && dom === '*' && month === '*' && dow === '*') {
      return 24 * 3_600_000;
    }
    // Weekly: 0 H * * D -> 7 days
    if (minute === '0' && hour !== undefined && !hour.includes('*') && dom === '*' && month === '*' && dow !== undefined && !dow.includes('*')) {
      return 7 * 24 * 3_600_000;
    }

    // Default: treat as every hour
    return 3_600_000;
  }
}
