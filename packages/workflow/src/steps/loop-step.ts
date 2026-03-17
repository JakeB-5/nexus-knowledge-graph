// LoopStep executor - for-each and while loops with sub-step execution

import {
  LoopStepConfig,
  ExecutionContext,
  StepResult,
  WorkflowStep,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';
import { ExpressionEvaluator } from '../expression.js';
import { ConditionStepExecutor } from './condition-step.js';

export interface LoopControl {
  shouldBreak: boolean;
  shouldContinue: boolean;
}

export interface LoopStepResult extends StepResult {
  iterations: number;
  accumulator: unknown[];
}

export type SubStepExecutor = (
  step: WorkflowStep,
  ctx: ExecutionContext
) => Promise<StepResult>;

export class LoopStepExecutor {
  private evaluator: ExpressionEvaluator;
  private conditionExecutor: ConditionStepExecutor;

  constructor(evaluator: ExpressionEvaluator) {
    this.evaluator = evaluator;
    this.conditionExecutor = new ConditionStepExecutor(evaluator);
  }

  async execute(
    stepId: string,
    config: LoopStepConfig,
    ctx: ExecutionContext,
    attempt: number,
    executeSubStep: SubStepExecutor
  ): Promise<LoopStepResult> {
    const startedAt = new Date();
    const maxIterations = config.maxIterations ?? 1000;
    const accumulator: unknown[] = [];

    try {
      let iterations = 0;

      if (config.mode === 'for-each') {
        iterations = await this.runForEach(
          config,
          ctx,
          maxIterations,
          accumulator,
          executeSubStep
        );
      } else {
        iterations = await this.runWhile(
          config,
          ctx,
          maxIterations,
          accumulator,
          executeSubStep
        );
      }

      // Store accumulator in context if configured
      if (config.accumulator) {
        ctx.variables[config.accumulator] = accumulator;
      }

      const result: LoopStepResult = {
        stepId,
        status: 'success',
        output: { iterations, accumulator },
        startedAt,
        completedAt: new Date(),
        attempt,
        iterations,
        accumulator,
      };

      ctx.stepResults.set(stepId, result);
      return result;
    } catch (err) {
      if (err instanceof WorkflowError && err.code === WorkflowErrorCode.MaxIterationsExceeded) {
        const result: LoopStepResult = {
          stepId,
          status: 'failure',
          error: err.message,
          startedAt,
          completedAt: new Date(),
          attempt,
          iterations: maxIterations,
          accumulator,
        };
        ctx.stepResults.set(stepId, result);
        throw err;
      }

      const result: LoopStepResult = {
        stepId,
        status: 'failure',
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
        attempt,
        iterations: 0,
        accumulator,
      };
      ctx.stepResults.set(stepId, result);
      throw err;
    }
  }

  private async runForEach(
    config: LoopStepConfig,
    ctx: ExecutionContext,
    maxIterations: number,
    accumulator: unknown[],
    executeSubStep: SubStepExecutor
  ): Promise<number> {
    if (!config.items) {
      throw new WorkflowError(
        WorkflowErrorCode.InvalidStepConfig,
        'for-each loop requires items expression'
      );
    }

    const evalCtx = {
      variables: ctx.variables,
      stepResults: ctx.stepResults as Map<string, unknown>,
    };

    const items = this.evaluator.evaluate(config.items, evalCtx);
    if (!Array.isArray(items)) {
      throw new WorkflowError(
        WorkflowErrorCode.InvalidStepConfig,
        `Loop items expression must yield an array, got: ${typeof items}`
      );
    }

    const itemVar = config.itemVariable ?? 'item';
    let iterations = 0;

    for (const item of items) {
      if (iterations >= maxIterations) {
        throw new WorkflowError(
          WorkflowErrorCode.MaxIterationsExceeded,
          `Loop exceeded maximum iterations (${maxIterations})`
        );
      }

      // Set current item in context
      ctx.variables[itemVar] = item;
      ctx.variables['_loopIndex'] = iterations;

      let control: LoopControl = { shouldBreak: false, shouldContinue: false };

      // Execute sub-steps
      for (const step of config.steps) {
        if (control.shouldBreak || control.shouldContinue) break;
        control = await this.executeSubStepWithControl(step, ctx, executeSubStep);
      }

      // Collect result if accumulator configured
      if (config.accumulator) {
        const lastStep = config.steps[config.steps.length - 1];
        if (lastStep) {
          const lastResult = ctx.stepResults.get(lastStep.id);
          if (lastResult) {
            const stepResult = lastResult as StepResult;
            accumulator.push(stepResult.output);
          }
        } else {
          accumulator.push(item);
        }
      }

      iterations++;

      if (control.shouldBreak) break;
    }

    // Clean up loop variables
    delete ctx.variables[itemVar];
    delete ctx.variables['_loopIndex'];

    return iterations;
  }

  private async runWhile(
    config: LoopStepConfig,
    ctx: ExecutionContext,
    maxIterations: number,
    accumulator: unknown[],
    executeSubStep: SubStepExecutor
  ): Promise<number> {
    if (!config.condition) {
      throw new WorkflowError(
        WorkflowErrorCode.InvalidStepConfig,
        'while loop requires a condition'
      );
    }

    let iterations = 0;

    while (this.conditionExecutor.evaluateCondition(config.condition, ctx)) {
      if (iterations >= maxIterations) {
        throw new WorkflowError(
          WorkflowErrorCode.MaxIterationsExceeded,
          `While loop exceeded maximum iterations (${maxIterations})`
        );
      }

      ctx.variables['_loopIndex'] = iterations;
      let control: LoopControl = { shouldBreak: false, shouldContinue: false };

      for (const step of config.steps) {
        if (control.shouldBreak || control.shouldContinue) break;
        control = await this.executeSubStepWithControl(step, ctx, executeSubStep);
      }

      if (config.accumulator) {
        const lastStep = config.steps[config.steps.length - 1];
        if (lastStep) {
          const lastResult = ctx.stepResults.get(lastStep.id);
          if (lastResult) {
            accumulator.push((lastResult as StepResult).output);
          }
        }
      }

      iterations++;
      if (control.shouldBreak) break;
    }

    delete ctx.variables['_loopIndex'];
    return iterations;
  }

  private async executeSubStepWithControl(
    step: WorkflowStep,
    ctx: ExecutionContext,
    executeSubStep: SubStepExecutor
  ): Promise<LoopControl> {
    // Check for break/continue signals in context
    const control: LoopControl = { shouldBreak: false, shouldContinue: false };

    try {
      await executeSubStep(step, ctx);

      // Check if sub-step set break/continue signals
      if (ctx.variables['_break'] === true) {
        delete ctx.variables['_break'];
        control.shouldBreak = true;
      }
      if (ctx.variables['_continue'] === true) {
        delete ctx.variables['_continue'];
        control.shouldContinue = true;
      }
    } catch (err) {
      // Re-throw unless it's a break/continue signal
      if (ctx.variables['_break'] === true) {
        delete ctx.variables['_break'];
        control.shouldBreak = true;
        return control;
      }
      throw err;
    }

    return control;
  }
}
