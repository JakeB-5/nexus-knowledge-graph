// WorkflowBuilder - fluent API for constructing WorkflowDefinition objects

import {
  WorkflowDefinition,
  WorkflowStep,
  StepType,
  Trigger,
  TriggerType,
  ConditionExpression,
  ActionStepConfig,
  ConditionStepConfig,
  LoopStepConfig,
  ParallelStepConfig,
  DelayStepConfig,
  WebhookStepConfig,
  ScheduleConfig,
  EventTriggerConfig,
  WebhookTriggerConfig,
  RetryPolicy,
  WorkflowError,
  WorkflowErrorCode,
} from './types.js';
import { ConditionStepExecutor } from './steps/condition-step.js';

function genId(): string {
  return `step_${Math.random().toString(36).slice(2, 11)}`;
}

function genTriggerId(): string {
  return `trigger_${Math.random().toString(36).slice(2, 11)}`;
}

// Fluent step builder for condition branches
export class ConditionBuilder {
  private thenStepIds: string[] = [];
  private elseStepIds: string[] = [];
  private parentBuilder: WorkflowBuilder;
  private conditionExpression: ConditionExpression;
  private stepId: string;
  private stepName?: string;

  constructor(
    parent: WorkflowBuilder,
    stepId: string,
    condition: ConditionExpression,
    name?: string
  ) {
    this.parentBuilder = parent;
    this.conditionExpression = condition;
    this.stepId = stepId;
    this.stepName = name;
  }

  then(configure: (b: WorkflowBuilder) => WorkflowBuilder): this {
    const subBuilder = new WorkflowBuilder();
    configure(subBuilder);
    const subDef = subBuilder.buildPartial();
    // Register sub-steps in parent and collect their ids
    for (const step of subDef.steps) {
      this.parentBuilder.addStep(step);
      this.thenStepIds.push(step.id);
    }
    return this;
  }

  else(configure: (b: WorkflowBuilder) => WorkflowBuilder): this {
    const subBuilder = new WorkflowBuilder();
    configure(subBuilder);
    const subDef = subBuilder.buildPartial();
    for (const step of subDef.steps) {
      this.parentBuilder.addStep(step);
      this.elseStepIds.push(step.id);
    }
    return this;
  }

  end(): WorkflowBuilder {
    const config: ConditionStepConfig = {
      condition: this.conditionExpression,
      thenSteps: this.thenStepIds,
      elseSteps: this.elseStepIds,
    };

    const step: WorkflowStep = {
      id: this.stepId,
      name: this.stepName,
      type: StepType.Condition,
      config,
    };

    this.parentBuilder.addStep(step);
    return this.parentBuilder;
  }
}

export class WorkflowBuilder {
  private _id: string = `workflow_${Math.random().toString(36).slice(2, 11)}`;
  private _name: string = '';
  private _description?: string;
  private _version: number = 1;
  private _triggers: Trigger[] = [];
  private _steps: WorkflowStep[] = [];
  private _variables: Record<string, unknown> = {};
  private _timeoutMs?: number;
  private _tags: string[] = [];
  private _lastStepId?: string;

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  id(id: string): this {
    this._id = id;
    return this;
  }

  name(name: string): this {
    this._name = name;
    return this;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  version(v: number): this {
    this._version = v;
    return this;
  }

  timeout(ms: number): this {
    this._timeoutMs = ms;
    return this;
  }

  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  variable(name: string, value: unknown): this {
    this._variables[name] = value;
    return this;
  }

  variables(vars: Record<string, unknown>): this {
    Object.assign(this._variables, vars);
    return this;
  }

  // -------------------------------------------------------------------------
  // Triggers
  // -------------------------------------------------------------------------

  trigger(type: TriggerType, config: Record<string, unknown> = {}, id?: string): this {
    this._triggers.push({
      id: id ?? genTriggerId(),
      type,
      config,
    });
    return this;
  }

  scheduleTrigger(cron: string, timezone?: string, id?: string): this {
    const cfg: ScheduleConfig = { cron, timezone };
    this._triggers.push({ id: id ?? genTriggerId(), type: TriggerType.Schedule, config: cfg });
    return this;
  }

  eventTrigger(eventType: string, filter?: ConditionExpression, id?: string): this {
    const cfg: EventTriggerConfig = { eventType, filter };
    this._triggers.push({ id: id ?? genTriggerId(), type: TriggerType.Event, config: cfg });
    return this;
  }

  webhookTrigger(path?: string, secret?: string, method: 'GET' | 'POST' = 'POST', id?: string): this {
    const cfg: WebhookTriggerConfig = { path, secret, method };
    this._triggers.push({ id: id ?? genTriggerId(), type: TriggerType.Webhook, config: cfg });
    return this;
  }

  manualTrigger(id?: string): this {
    this._triggers.push({ id: id ?? genTriggerId(), type: TriggerType.Manual, config: {} });
    return this;
  }

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  step(
    nameOrId: string,
    type: StepType,
    config: WorkflowStep['config'],
    opts: Partial<Pick<WorkflowStep, 'id' | 'retry' | 'timeoutMs' | 'onError' | 'fallbackStepId' | 'condition'>> = {}
  ): this {
    const stepId = opts.id ?? genId();
    const step: WorkflowStep = {
      id: stepId,
      name: nameOrId,
      type,
      config,
      retry: opts.retry,
      timeoutMs: opts.timeoutMs,
      onError: opts.onError,
      fallbackStepId: opts.fallbackStepId,
      condition: opts.condition,
    };

    this.addStep(step);
    return this;
  }

  action(
    name: string,
    action: string,
    inputs?: Record<string, unknown>,
    opts: Partial<Pick<WorkflowStep, 'id' | 'retry' | 'timeoutMs' | 'onError'>> = {}
  ): this {
    const config: ActionStepConfig = { action, inputs };
    return this.step(name, StepType.Action, config, opts);
  }

  condition(
    expression: string | ConditionExpression,
    name?: string
  ): ConditionBuilder {
    const stepId = genId();
    const condExpr: ConditionExpression =
      typeof expression === 'string'
        ? ConditionStepExecutor.fromExpression(expression)
        : expression;
    return new ConditionBuilder(this, stepId, condExpr, name);
  }

  parallel(
    configure: (b: WorkflowBuilder) => WorkflowBuilder,
    opts: { waitStrategy?: 'all' | 'first'; concurrencyLimit?: number; errorStrategy?: 'fail-fast' | 'collect-all'; name?: string } = {}
  ): this {
    const subBuilder = new WorkflowBuilder();
    configure(subBuilder);
    const subDef = subBuilder.buildPartial();

    const config: ParallelStepConfig = {
      steps: subDef.steps,
      waitStrategy: opts.waitStrategy ?? 'all',
      concurrencyLimit: opts.concurrencyLimit,
      errorStrategy: opts.errorStrategy ?? 'fail-fast',
    };

    const step: WorkflowStep = {
      id: genId(),
      name: opts.name ?? 'parallel',
      type: StepType.Parallel,
      config,
    };

    this.addStep(step);
    return this;
  }

  loop(
    items: string,
    configure: (b: WorkflowBuilder) => WorkflowBuilder,
    opts: { itemVariable?: string; maxIterations?: number; accumulator?: string; name?: string } = {}
  ): this {
    const subBuilder = new WorkflowBuilder();
    configure(subBuilder);
    const subDef = subBuilder.buildPartial();

    const config: LoopStepConfig = {
      mode: 'for-each',
      items,
      itemVariable: opts.itemVariable ?? 'item',
      steps: subDef.steps,
      maxIterations: opts.maxIterations,
      accumulator: opts.accumulator,
    };

    const step: WorkflowStep = {
      id: genId(),
      name: opts.name ?? 'loop',
      type: StepType.Loop,
      config,
    };

    this.addStep(step);
    return this;
  }

  while(
    condition: ConditionExpression,
    configure: (b: WorkflowBuilder) => WorkflowBuilder,
    opts: { maxIterations?: number; accumulator?: string; name?: string } = {}
  ): this {
    const subBuilder = new WorkflowBuilder();
    configure(subBuilder);
    const subDef = subBuilder.buildPartial();

    const config: LoopStepConfig = {
      mode: 'while',
      condition,
      steps: subDef.steps,
      maxIterations: opts.maxIterations,
      accumulator: opts.accumulator,
    };

    const step: WorkflowStep = {
      id: genId(),
      name: opts.name ?? 'while-loop',
      type: StepType.Loop,
      config,
    };

    this.addStep(step);
    return this;
  }

  delay(ms: number | string, name?: string): this {
    const config: DelayStepConfig =
      typeof ms === 'number' ? { ms } : { variable: ms };

    const step: WorkflowStep = {
      id: genId(),
      name: name ?? 'delay',
      type: StepType.Delay,
      config,
    };

    this.addStep(step);
    return this;
  }

  webhook(
    url: string,
    opts: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      body?: unknown;
      timeoutMs?: number;
      name?: string;
    } = {}
  ): this {
    const config: WebhookStepConfig = {
      url,
      method: opts.method ?? 'POST',
      headers: opts.headers,
      body: opts.body,
      timeoutMs: opts.timeoutMs,
    };

    const step: WorkflowStep = {
      id: genId(),
      name: opts.name ?? 'webhook',
      type: StepType.Webhook,
      config,
    };

    this.addStep(step);
    return this;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Add a step and wire the previous step's .next to this one */
  addStep(step: WorkflowStep): void {
    // Wire previous step to this one
    if (this._lastStepId) {
      const prev = this._steps.find(s => s.id === this._lastStepId);
      if (prev && !prev.next) {
        prev.next = step.id;
      }
    }
    this._steps.push(step);
    this._lastStepId = step.id;
  }

  /** Build without validation - used internally for sub-builders */
  buildPartial(): { steps: WorkflowStep[] } {
    return { steps: [...this._steps] };
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  build(): WorkflowDefinition {
    this.validate();

    return {
      id: this._id,
      name: this._name,
      description: this._description,
      version: this._version,
      triggers: this._triggers,
      steps: this._steps,
      firstStepId: this._steps[0]!.id,
      variables: Object.keys(this._variables).length > 0 ? this._variables : undefined,
      timeoutMs: this._timeoutMs,
      tags: this._tags.length > 0 ? this._tags : undefined,
    };
  }

  private validate(): void {
    if (!this._name) {
      throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow must have a name');
    }
    if (this._steps.length === 0) {
      throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'Workflow must have at least one step');
    }

    const stepIds = new Set(this._steps.map(s => s.id));

    for (const step of this._steps) {
      if (!step.id) {
        throw new WorkflowError(WorkflowErrorCode.InvalidStepConfig, 'All steps must have an id');
      }
      if (step.next && !stepIds.has(step.next)) {
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Step '${step.id}' references unknown next step '${step.next}'`
        );
      }
    }
  }
}

/** Convenience factory */
export function createWorkflow(name: string): WorkflowBuilder {
  return new WorkflowBuilder().name(name);
}
