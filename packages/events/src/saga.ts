// Saga: distributed transaction pattern with compensation and state machine

import type { SagaStep, SagaState, SagaStatus } from "./types.js";

let sagaIdCounter = 0;

function generateSagaId(): string {
  return `saga_${++sagaIdCounter}_${Date.now()}`;
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Step timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

export interface SagaOptions {
  /** Called whenever the saga state changes */
  onStateChange?: <TContext>(state: SagaState<TContext>) => void | Promise<void>;
}

export class Saga<TContext = Record<string, unknown>> {
  private steps: SagaStep<TContext>[] = [];
  private _state: SagaState<TContext>;
  private options: SagaOptions;

  constructor(
    name: string,
    initialContext: TContext,
    options: SagaOptions = {}
  ) {
    this.options = options;
    this._state = {
      id: generateSagaId(),
      name,
      status: "started",
      currentStep: 0,
      context: initialContext,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Step registration ───────────────────────────────────────────────────────

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  step(
    name: string,
    execute: (context: TContext) => Promise<TContext>,
    compensate: (context: TContext) => Promise<TContext>,
    timeoutMs?: number
  ): this {
    return this.addStep({ name, execute, compensate, timeoutMs });
  }

  // ─── State access ────────────────────────────────────────────────────────────

  get state(): Readonly<SagaState<TContext>> {
    return this._state;
  }

  get id(): string {
    return this._state.id;
  }

  // ─── Execution ───────────────────────────────────────────────────────────────

  private async updateState(
    patch: Partial<SagaState<TContext>>
  ): Promise<void> {
    this._state = {
      ...this._state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (this.options.onStateChange) {
      const result = this.options.onStateChange(this._state);
      if (result instanceof Promise) await result;
    }
  }

  async execute(): Promise<TContext> {
    if (
      this._state.status === "completed" ||
      this._state.status === "failed"
    ) {
      throw new Error(
        `Saga ${this._state.id} already finished with status "${this._state.status}"`
      );
    }

    // Execute steps forward
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]!;
      const stepStatus: SagaStatus = `step_${i}`;
      await this.updateState({ status: stepStatus, currentStep: i });

      try {
        let executePromise = step.execute(this._state.context);
        if (step.timeoutMs !== undefined) {
          executePromise = timeout(executePromise, step.timeoutMs);
        }
        const newContext = await executePromise;
        await this.updateState({ context: newContext });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        await this.updateState({
          status: "compensating",
          error: `Step "${step.name}" failed: ${errorMessage}`,
        });

        // Compensate in reverse order (steps 0..i-1)
        await this.compensate(i - 1);

        await this.updateState({ status: "failed" });
        throw new Error(
          `Saga "${this._state.name}" failed at step "${step.name}": ${errorMessage}`
        );
      }
    }

    await this.updateState({
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    return this._state.context;
  }

  private async compensate(fromStep: number): Promise<void> {
    for (let i = fromStep; i >= 0; i--) {
      const step = this.steps[i];
      if (!step) continue;

      try {
        let compensatePromise = step.compensate(this._state.context);
        if (step.timeoutMs !== undefined) {
          compensatePromise = timeout(compensatePromise, step.timeoutMs);
        }
        const newContext = await compensatePromise;
        await this.updateState({ context: newContext });
      } catch (err) {
        // Compensation failure is logged but does not stop other compensations
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        console.error(
          `Compensation for step "${step.name}" failed: ${errorMessage}`
        );
      }
    }
  }

  // ─── Resume support ──────────────────────────────────────────────────────────

  /** Resume a saga from a persisted state (e.g. after crash) */
  static resume<TContext>(
    steps: SagaStep<TContext>[],
    savedState: SagaState<TContext>,
    options: SagaOptions = {}
  ): Saga<TContext> {
    const saga = new Saga<TContext>(
      savedState.name,
      savedState.context,
      options
    );
    saga.steps = steps;
    saga._state = { ...savedState };
    return saga;
  }

  /** Serialize state for persistence */
  serializeState(): string {
    return JSON.stringify(this._state);
  }

  /** Deserialize state from persistence */
  static deserializeState<TContext>(
    serialized: string
  ): SagaState<TContext> {
    return JSON.parse(serialized) as SagaState<TContext>;
  }
}

// ─── SagaBuilder: fluent API ──────────────────────────────────────────────────

export class SagaBuilder<TContext = Record<string, unknown>> {
  private sagaName: string;
  private steps: SagaStep<TContext>[] = [];
  private options: SagaOptions = {};

  constructor(name: string) {
    this.sagaName = name;
  }

  step(
    name: string,
    execute: (context: TContext) => Promise<TContext>,
    compensate: (context: TContext) => Promise<TContext>,
    timeoutMs?: number
  ): this {
    this.steps.push({ name, execute, compensate, timeoutMs });
    return this;
  }

  onStateChange(handler: <T>(state: SagaState<T>) => void | Promise<void>): this {
    this.options.onStateChange = handler as SagaOptions["onStateChange"];
    return this;
  }

  build(initialContext: TContext): Saga<TContext> {
    const saga = new Saga<TContext>(this.sagaName, initialContext, this.options);
    for (const s of this.steps) saga.addStep(s);
    return saga;
  }
}

/** Convenience factory */
export function createSaga<TContext = Record<string, unknown>>(
  name: string
): SagaBuilder<TContext> {
  return new SagaBuilder<TContext>(name);
}
