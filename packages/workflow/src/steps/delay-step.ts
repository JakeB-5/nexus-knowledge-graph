// DelayStep executor - pause execution for a fixed or dynamic duration

import {
  DelayStepConfig,
  ExecutionContext,
  StepResult,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';
import { ExpressionEvaluator } from '../expression.js';

export class DelayStepExecutor {
  private evaluator: ExpressionEvaluator;

  constructor(evaluator: ExpressionEvaluator) {
    this.evaluator = evaluator;
  }

  async execute(
    stepId: string,
    config: DelayStepConfig,
    ctx: ExecutionContext,
    attempt: number
  ): Promise<StepResult> {
    const startedAt = new Date();

    try {
      const delayMs = this.resolveDelay(config, ctx);

      if (delayMs < 0) {
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Delay must be non-negative, got: ${delayMs}`
        );
      }

      // Cap delay at 5 minutes to prevent accidental infinite waits
      const cappedDelay = Math.min(delayMs, 5 * 60 * 1000);

      await this.sleep(cappedDelay);

      const result: StepResult = {
        stepId,
        status: 'success',
        output: { delayMs: cappedDelay, requestedMs: delayMs },
        startedAt,
        completedAt: new Date(),
        attempt,
      };

      ctx.stepResults.set(stepId, result);
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

  private resolveDelay(config: DelayStepConfig, ctx: ExecutionContext): number {
    if (config.ms !== undefined) {
      return config.ms;
    }

    if (config.variable) {
      const evalCtx = {
        variables: ctx.variables,
        stepResults: ctx.stepResults as Map<string, unknown>,
      };
      const value = this.evaluator.evaluate(config.variable, evalCtx);
      const ms = Number(value);
      if (isNaN(ms)) {
        throw new WorkflowError(
          WorkflowErrorCode.InvalidStepConfig,
          `Delay variable '${config.variable}' did not yield a number, got: ${String(value)}`
        );
      }
      return ms;
    }

    // Default: no delay
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
