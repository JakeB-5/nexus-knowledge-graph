// ParallelStep executor - run multiple sub-steps concurrently

import {
  ParallelStepConfig,
  ExecutionContext,
  StepResult,
  WorkflowStep,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';

export interface ParallelStepResult extends StepResult {
  results: StepResult[];
  errors: Array<{ stepId: string; error: string }>;
}

export type SubStepExecutor = (
  step: WorkflowStep,
  ctx: ExecutionContext
) => Promise<StepResult>;

export class ParallelStepExecutor {
  async execute(
    stepId: string,
    config: ParallelStepConfig,
    ctx: ExecutionContext,
    attempt: number,
    executeSubStep: SubStepExecutor
  ): Promise<ParallelStepResult> {
    const startedAt = new Date();

    try {
      const { results, errors } = await this.runParallel(config, ctx, executeSubStep);

      const hasErrors = errors.length > 0;
      const status = hasErrors ? 'failure' : 'success';

      if (hasErrors && config.errorStrategy === 'fail-fast') {
        const first = errors[0]!;
        throw new WorkflowError(
          WorkflowErrorCode.StepFailed,
          `Parallel step failed: ${first.error}`,
          first.stepId
        );
      }

      const result: ParallelStepResult = {
        stepId,
        status,
        output: { results, errors },
        startedAt,
        completedAt: new Date(),
        attempt,
        results,
        errors,
      };

      ctx.stepResults.set(stepId, result);
      return result;
    } catch (err) {
      const result: ParallelStepResult = {
        stepId,
        status: 'failure',
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
        attempt,
        results: [],
        errors: [{ stepId, error: err instanceof Error ? err.message : String(err) }],
      };
      ctx.stepResults.set(stepId, result);
      throw err;
    }
  }

  private async runParallel(
    config: ParallelStepConfig,
    ctx: ExecutionContext,
    executeSubStep: SubStepExecutor
  ): Promise<{ results: StepResult[]; errors: Array<{ stepId: string; error: string }> }> {
    const { steps, waitStrategy, concurrencyLimit, errorStrategy } = config;
    const limit = concurrencyLimit ?? steps.length;

    if (waitStrategy === 'first') {
      return this.runWaitForFirst(steps, ctx, executeSubStep, errorStrategy);
    }

    // Wait for all - respect concurrency limit
    return this.runWithConcurrencyLimit(steps, ctx, executeSubStep, limit, errorStrategy);
  }

  private async runWaitForFirst(
    steps: WorkflowStep[],
    ctx: ExecutionContext,
    executeSubStep: SubStepExecutor,
    errorStrategy: 'fail-fast' | 'collect-all'
  ): Promise<{ results: StepResult[]; errors: Array<{ stepId: string; error: string }> }> {
    const errors: Array<{ stepId: string; error: string }> = [];

    return new Promise((resolve) => {
      let settled = false;
      let pendingCount = steps.length;

      if (steps.length === 0) {
        resolve({ results: [], errors: [] });
        return;
      }

      const checkDone = (results: StepResult[]) => {
        if (!settled) {
          settled = true;
          resolve({ results, errors });
        }
      };

      for (const step of steps) {
        executeSubStep(step, ctx)
          .then(result => {
            pendingCount--;
            checkDone([result]);
          })
          .catch(err => {
            pendingCount--;
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({ stepId: step.id, error: errMsg });

            if (errorStrategy === 'fail-fast' && !settled) {
              settled = true;
              resolve({ results: [], errors });
              return;
            }

            if (pendingCount === 0 && !settled) {
              // All failed
              resolved({ results: [], errors });
            }
          });
      }

      // Helper to handle the case where all fail
      function resolved(val: { results: StepResult[]; errors: Array<{ stepId: string; error: string }> }) {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      }
    });
  }

  private async runWithConcurrencyLimit(
    steps: WorkflowStep[],
    ctx: ExecutionContext,
    executeSubStep: SubStepExecutor,
    limit: number,
    errorStrategy: 'fail-fast' | 'collect-all'
  ): Promise<{ results: StepResult[]; errors: Array<{ stepId: string; error: string }> }> {
    const results: StepResult[] = [];
    const errors: Array<{ stepId: string; error: string }> = [];

    if (steps.length === 0) return { results, errors };

    const queue = [...steps];
    let aborted = false;

    const runNext = async (): Promise<void> => {
      while (queue.length > 0 && !aborted) {
        const step = queue.shift()!;
        try {
          const result = await executeSubStep(step, ctx);
          results.push(result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push({ stepId: step.id, error: errMsg });

          if (errorStrategy === 'fail-fast') {
            aborted = true;
            break;
          }
        }
      }
    };

    // Run up to `limit` workers concurrently
    const workers = Array.from({ length: Math.min(limit, steps.length) }, () => runNext());
    await Promise.all(workers);

    return { results, errors };
  }
}
