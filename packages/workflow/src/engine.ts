// WorkflowEngine - core orchestrator for workflow execution

import {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStatus,
  WorkflowStep,
  StepType,
  StepResult,
  ExecutionContext,
  ActionStepConfig,
  ConditionStepConfig,
  LoopStepConfig,
  ParallelStepConfig,
  DelayStepConfig,
  WebhookStepConfig,
  WorkflowError,
  WorkflowErrorCode,
  RetryPolicy,
  ConditionExpression,
} from './types.js';
import { ExpressionEvaluator } from './expression.js';
import { WorkflowPersistence, InMemoryPersistence } from './persistence.js';
import { ActionStepExecutor, ActionHandler } from './steps/action-step.js';
import { ConditionStepExecutor } from './steps/condition-step.js';
import { LoopStepExecutor } from './steps/loop-step.js';
import { ParallelStepExecutor } from './steps/parallel-step.js';
import { DelayStepExecutor } from './steps/delay-step.js';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface EngineOptions {
  persistence?: WorkflowPersistence;
  defaultTimeoutMs?: number;
  maxConcurrentInstances?: number;
}

export interface StartOptions {
  triggerPayload?: unknown;
  variables?: Record<string, unknown>;
}

export class WorkflowEngine {
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private persistence: WorkflowPersistence;
  private evaluator: ExpressionEvaluator;
  private actionExecutor: ActionStepExecutor;
  private conditionExecutor: ConditionStepExecutor;
  private loopExecutor: LoopStepExecutor;
  private parallelExecutor: ParallelStepExecutor;
  private delayExecutor: DelayStepExecutor;
  private defaultTimeoutMs: number;
  private runningInstances: Set<string> = new Set();

  constructor(options: EngineOptions = {}) {
    this.persistence = options.persistence ?? new InMemoryPersistence();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30 * 60 * 1000; // 30 min
    this.evaluator = new ExpressionEvaluator();
    this.actionExecutor = new ActionStepExecutor(this.evaluator);
    this.conditionExecutor = new ConditionStepExecutor(this.evaluator);
    this.loopExecutor = new LoopStepExecutor(this.evaluator);
    this.parallelExecutor = new ParallelStepExecutor();
    this.delayExecutor = new DelayStepExecutor(this.evaluator);
  }

  // -------------------------------------------------------------------------
  // Definition management
  // -------------------------------------------------------------------------

  registerWorkflow(definition: WorkflowDefinition): void {
    this.validateDefinition(definition);
    this.definitions.set(definition.id, definition);
  }

  unregisterWorkflow(workflowId: string): void {
    this.definitions.delete(workflowId);
  }

  getDefinition(workflowId: string): WorkflowDefinition | undefined {
    return this.definitions.get(workflowId);
  }

  listDefinitions(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  registerAction(name: string, handler: ActionHandler): void {
    this.actionExecutor.registerAction(name, handler);
  }

  // -------------------------------------------------------------------------
  // Instance lifecycle
  // -------------------------------------------------------------------------

  async startWorkflow(
    workflowId: string,
    options: StartOptions = {}
  ): Promise<WorkflowInstance> {
    const definition = this.definitions.get(workflowId);
    if (!definition) {
      throw new WorkflowError(
        WorkflowErrorCode.WorkflowNotFound,
        `Workflow '${workflowId}' is not registered`
      );
    }

    const instanceId = generateId();
    const now = new Date();

    const context: ExecutionContext = {
      workflowId,
      instanceId,
      variables: {
        ...(definition.variables ?? {}),
        ...(options.variables ?? {}),
      },
      stepResults: new Map(),
      triggerPayload: options.triggerPayload,
    };

    const instance: WorkflowInstance = {
      id: instanceId,
      workflowId,
      workflowVersion: definition.version,
      status: WorkflowStatus.Running,
      context,
      history: [],
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    };

    await this.persistence.saveInstance(instance);
    this.runningInstances.add(instanceId);

    // Execute asynchronously, but return instance immediately
    this.runInstance(instance, definition).catch(() => {
      // Errors are persisted to the instance
    });

    return instance;
  }

  async startWorkflowSync(
    workflowId: string,
    options: StartOptions = {}
  ): Promise<WorkflowInstance> {
    const definition = this.definitions.get(workflowId);
    if (!definition) {
      throw new WorkflowError(
        WorkflowErrorCode.WorkflowNotFound,
        `Workflow '${workflowId}' is not registered`
      );
    }

    const instanceId = generateId();
    const now = new Date();

    const context: ExecutionContext = {
      workflowId,
      instanceId,
      variables: {
        ...(definition.variables ?? {}),
        ...(options.variables ?? {}),
      },
      stepResults: new Map(),
      triggerPayload: options.triggerPayload,
    };

    const instance: WorkflowInstance = {
      id: instanceId,
      workflowId,
      workflowVersion: definition.version,
      status: WorkflowStatus.Running,
      context,
      history: [],
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    };

    await this.persistence.saveInstance(instance);
    this.runningInstances.add(instanceId);
    await this.runInstance(instance, definition);

    const final = await this.persistence.loadInstance(instanceId);
    return final ?? instance;
  }

  async pauseWorkflow(instanceId: string): Promise<void> {
    const instance = await this.persistence.loadInstance(instanceId);
    if (!instance) {
      throw new WorkflowError(WorkflowErrorCode.WorkflowNotFound, `Instance ${instanceId} not found`);
    }
    if (instance.status !== WorkflowStatus.Running) {
      throw new WorkflowError(WorkflowErrorCode.StepFailed, `Cannot pause instance in status ${instance.status}`);
    }
    instance.status = WorkflowStatus.Paused;
    instance.pausedAt = new Date();
    instance.updatedAt = new Date();
    await this.persistence.saveInstance(instance);
  }

  async resumeWorkflow(instanceId: string, resumeData?: unknown): Promise<void> {
    const instance = await this.persistence.loadInstance(instanceId);
    if (!instance) {
      throw new WorkflowError(WorkflowErrorCode.WorkflowNotFound, `Instance ${instanceId} not found`);
    }
    if (instance.status !== WorkflowStatus.Paused) {
      throw new WorkflowError(WorkflowErrorCode.StepFailed, `Cannot resume instance in status ${instance.status}`);
    }

    const definition = this.definitions.get(instance.workflowId);
    if (!definition) {
      throw new WorkflowError(WorkflowErrorCode.WorkflowNotFound, `Workflow ${instance.workflowId} not registered`);
    }

    instance.status = WorkflowStatus.Running;
    instance.resumeData = resumeData;
    instance.updatedAt = new Date();
    await this.persistence.saveInstance(instance);

    this.runInstance(instance, definition, instance.context.currentStepId).catch(() => {});
  }

  async cancelWorkflow(instanceId: string): Promise<void> {
    const instance = await this.persistence.loadInstance(instanceId);
    if (!instance) {
      throw new WorkflowError(WorkflowErrorCode.WorkflowNotFound, `Instance ${instanceId} not found`);
    }
    instance.status = WorkflowStatus.Cancelled;
    instance.completedAt = new Date();
    instance.updatedAt = new Date();
    this.runningInstances.delete(instanceId);
    await this.persistence.saveInstance(instance);
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.persistence.loadInstance(instanceId);
  }

  async listInstances(opts?: {
    workflowId?: string;
    status?: WorkflowStatus;
    limit?: number;
  }): Promise<WorkflowInstance[]> {
    return this.persistence.listInstances(opts);
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  private async runInstance(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    resumeFromStepId?: string
  ): Promise<void> {
    const timeoutMs = definition.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new WorkflowError(WorkflowErrorCode.WorkflowTimedOut, 'Workflow execution timed out')),
        timeoutMs
      )
    );

    try {
      await Promise.race([
        this.executeSteps(instance, definition, resumeFromStepId),
        timeoutPromise,
      ]);

      const fresh = await this.persistence.loadInstance(instance.id);
      if (fresh && fresh.status === WorkflowStatus.Running) {
        fresh.status = WorkflowStatus.Completed;
        fresh.completedAt = new Date();
        fresh.updatedAt = new Date();
        await this.persistence.saveInstance(fresh);
      }
    } catch (err) {
      const fresh = await this.persistence.loadInstance(instance.id);
      const target = fresh ?? instance;

      if (target.status === WorkflowStatus.Paused || target.status === WorkflowStatus.Cancelled) {
        return; // Intentional pause/cancel
      }

      const isTimeout = err instanceof WorkflowError && err.code === WorkflowErrorCode.WorkflowTimedOut;
      target.status = isTimeout ? WorkflowStatus.TimedOut : WorkflowStatus.Failed;
      target.completedAt = new Date();
      target.updatedAt = new Date();
      target.error = {
        code: err instanceof WorkflowError ? err.code : WorkflowErrorCode.StepFailed,
        message: err instanceof Error ? err.message : String(err),
        stepId: err instanceof WorkflowError ? err.stepId : undefined,
        timestamp: new Date(),
      };
      await this.persistence.saveInstance(target);
    } finally {
      this.runningInstances.delete(instance.id);
    }
  }

  private async executeSteps(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    resumeFromStepId?: string
  ): Promise<void> {
    const stepMap = new Map(definition.steps.map(s => [s.id, s]));
    let currentStepId: string | undefined = resumeFromStepId ?? definition.firstStepId;

    while (currentStepId) {
      // Check for pause/cancel
      const fresh = await this.persistence.loadInstance(instance.id);
      if (!fresh) break;
      if (fresh.status === WorkflowStatus.Paused || fresh.status === WorkflowStatus.Cancelled) {
        return;
      }

      const step = stepMap.get(currentStepId);
      if (!step) {
        throw new WorkflowError(
          WorkflowErrorCode.StepFailed,
          `Step '${currentStepId}' not found in workflow definition`
        );
      }

      // Update current step tracking
      fresh.context.currentStepId = currentStepId;
      fresh.updatedAt = new Date();
      await this.persistence.saveInstance(fresh);

      // Sync context back to instance
      instance.context = fresh.context;

      // Evaluate guard condition
      if (step.condition) {
        const shouldRun = this.conditionExecutor.evaluateCondition(step.condition, instance.context);
        if (!shouldRun) {
          const skipped: StepResult = {
            stepId: step.id,
            status: 'skipped',
            startedAt: new Date(),
            completedAt: new Date(),
            attempt: 0,
          };
          instance.history.push(skipped);
          await this.persistence.appendHistory(instance.id, skipped);
          currentStepId = step.next;
          continue;
        }
      }

      // Execute the step with retry
      const result = await this.executeStepWithRetry(step, instance.context);
      instance.history.push(result);
      await this.persistence.appendHistory(instance.id, result);

      // Handle errors
      if (result.status === 'failure') {
        if (step.onError === 'continue') {
          currentStepId = step.next;
          continue;
        }
        if (step.onError === 'fallback' && step.fallbackStepId) {
          currentStepId = step.fallbackStepId;
          continue;
        }
        throw new WorkflowError(
          WorkflowErrorCode.StepFailed,
          result.error ?? 'Step failed',
          step.id
        );
      }

      // Determine next step from condition branches
      if (step.type === StepType.Condition && result.output) {
        const condOutput = result.output as { nextStepIds?: string[] };
        const nextIds = condOutput.nextStepIds ?? [];
        if (nextIds.length > 0) {
          // Execute the branch steps sequentially, then continue to step.next
          for (const branchStepId of nextIds) {
            const branchStep = stepMap.get(branchStepId);
            if (branchStep) {
              const branchResult = await this.executeStepWithRetry(branchStep, instance.context);
              instance.history.push(branchResult);
              await this.persistence.appendHistory(instance.id, branchResult);
            }
          }
        }
        currentStepId = step.next;
        continue;
      }

      currentStepId = step.next;
    }
  }

  private async executeStepWithRetry(
    step: WorkflowStep,
    ctx: ExecutionContext
  ): Promise<StepResult> {
    const retry = step.retry ?? { maxAttempts: 1, backoffMs: 0 };
    const maxAttempts = Math.max(1, retry.maxAttempts);

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.executeStep(step, ctx, attempt);
        return result;
      } catch (err) {
        lastError = err;

        if (attempt < maxAttempts) {
          const backoff = this.computeBackoff(retry, attempt);
          if (backoff > 0) {
            await new Promise(r => setTimeout(r, backoff));
          }
        }
      }
    }

    // All retries exhausted
    return {
      stepId: step.id,
      status: 'failure',
      error: lastError instanceof Error ? lastError.message : String(lastError),
      startedAt: new Date(),
      completedAt: new Date(),
      attempt: maxAttempts,
    };
  }

  private computeBackoff(retry: RetryPolicy, attempt: number): number {
    const base = retry.backoffMs;
    const multiplier = retry.backoffMultiplier ?? 1;
    const delay = base * Math.pow(multiplier, attempt - 1);
    return retry.maxBackoffMs ? Math.min(delay, retry.maxBackoffMs) : delay;
  }

  private async executeStep(
    step: WorkflowStep,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult> {
    // Apply per-step timeout
    const timeoutMs = step.timeoutMs;
    const executePromise = this.dispatchStep(step, ctx, attempt);

    if (!timeoutMs) {
      return executePromise;
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new WorkflowError(WorkflowErrorCode.StepTimedOut, `Step '${step.id}' timed out after ${timeoutMs}ms`, step.id)),
        timeoutMs
      )
    );

    return Promise.race([executePromise, timeoutPromise]);
  }

  private async dispatchStep(
    step: WorkflowStep,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult> {
    // Interpolate variable references in step config
    const resolvedConfig = this.resolveStepConfig(step.config, ctx);

    switch (step.type) {
      case StepType.Action:
        return this.actionExecutor.execute(
          step.id,
          resolvedConfig as ActionStepConfig,
          ctx,
          attempt
        );

      case StepType.Condition:
        return this.conditionExecutor.execute(
          step.id,
          resolvedConfig as ConditionStepConfig,
          ctx,
          attempt
        );

      case StepType.Loop:
        return this.loopExecutor.execute(
          step.id,
          resolvedConfig as LoopStepConfig,
          ctx,
          attempt,
          (subStep, subCtx) => this.executeStepWithRetry(subStep, subCtx)
        );

      case StepType.Parallel:
        return this.parallelExecutor.execute(
          step.id,
          resolvedConfig as ParallelStepConfig,
          ctx,
          attempt,
          (subStep, subCtx) => this.executeStepWithRetry(subStep, subCtx)
        );

      case StepType.Delay:
        return this.delayExecutor.execute(
          step.id,
          resolvedConfig as DelayStepConfig,
          ctx,
          attempt
        );

      case StepType.Webhook:
        return this.executeWebhookStep(step.id, resolvedConfig as WebhookStepConfig, ctx, attempt);

      default:
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Unknown step type: ${step.type as string}`
        );
    }
  }

  private resolveStepConfig(config: unknown, ctx: ExecutionContext): unknown {
    const evalCtx = {
      variables: ctx.variables,
      stepResults: ctx.stepResults as Map<string, unknown>,
    };

    if (config === null || config === undefined) return config;
    if (typeof config === 'string') return this.evaluator.resolveValue(config, evalCtx);
    if (typeof config !== 'object') return config;
    if (Array.isArray(config)) return config; // Don't interpolate step arrays (sub-steps)

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(config as Record<string, unknown>)) {
      // Don't resolve sub-step arrays or condition expressions
      if (key === 'steps' || key === 'condition' || key === 'thenSteps' || key === 'elseSteps') {
        result[key] = val;
      } else if (typeof val === 'string') {
        result[key] = this.evaluator.resolveValue(val, evalCtx);
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = this.resolveStepConfig(val, ctx);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  private async executeWebhookStep(
    stepId: string,
    config: WebhookStepConfig,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult> {
    const startedAt = new Date();
    try {
      const method = config.method ?? 'POST';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.headers ?? {}),
      };

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (config.body !== undefined && method !== 'GET') {
        fetchOptions.body = typeof config.body === 'string'
          ? config.body
          : JSON.stringify(config.body);
      }

      const controller = new AbortController();
      const timeoutId = config.timeoutMs
        ? setTimeout(() => controller.abort(), config.timeoutMs)
        : undefined;

      fetchOptions.signal = controller.signal;

      let response: Response;
      try {
        response = await fetch(config.url, fetchOptions);
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }

      const responseText = await response.text();
      let responseBody: unknown = responseText;
      try { responseBody = JSON.parse(responseText); } catch { /* not json */ }

      const result: StepResult = {
        stepId,
        status: response.ok ? 'success' : 'failure',
        output: { status: response.status, body: responseBody, ok: response.ok },
        error: response.ok ? undefined : `HTTP ${response.status}`,
        startedAt,
        completedAt: new Date(),
        attempt,
      };
      ctx.stepResults.set(stepId, result);
      if (!response.ok) {
        throw new WorkflowError(WorkflowErrorCode.StepFailed, `Webhook returned HTTP ${response.status}`, stepId);
      }
      return result;
    } catch (err) {
      const result: StepResult = {
        stepId,
        status: 'failure',
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
        attempt,
      };
      ctx.stepResults.set(stepId, result);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Variable interpolation helpers
  // -------------------------------------------------------------------------

  interpolate(template: string, ctx: ExecutionContext): string {
    const evalCtx = {
      variables: ctx.variables,
      stepResults: ctx.stepResults as Map<string, unknown>,
    };
    return this.evaluator.interpolate(template, evalCtx);
  }

  evaluateCondition(condition: ConditionExpression, ctx: ExecutionContext): boolean {
    return this.conditionExecutor.evaluateCondition(condition, ctx);
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private validateDefinition(def: WorkflowDefinition): void {
    if (!def.id) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow definition must have an id');
    if (!def.name) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow definition must have a name');
    if (!def.firstStepId) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow definition must have firstStepId');
    if (!def.steps || def.steps.length === 0) {
      throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow definition must have at least one step');
    }

    const stepIds = new Set(def.steps.map(s => s.id));
    if (!stepIds.has(def.firstStepId)) {
      throw new WorkflowError(
        WorkflowErrorCode.InvalidStepConfig,
        `firstStepId '${def.firstStepId}' does not match any step id`
      );
    }

    for (const step of def.steps) {
      if (!step.id) throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'All steps must have an id');
      if (step.next && !stepIds.has(step.next)) {
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Step '${step.id}' references unknown next step '${step.next}'`
        );
      }
      if (step.fallbackStepId && !stepIds.has(step.fallbackStepId)) {
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Step '${step.id}' references unknown fallback step '${step.fallbackStepId}'`
        );
      }
    }
  }
}
