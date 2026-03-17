import { describe, it, expect, vi } from 'vitest';
import { ExpressionEvaluator } from '../expression.js';
import { ActionStepExecutor } from '../steps/action-step.js';
import { ConditionStepExecutor } from '../steps/condition-step.js';
import { LoopStepExecutor } from '../steps/loop-step.js';
import { ParallelStepExecutor } from '../steps/parallel-step.js';
import { DelayStepExecutor } from '../steps/delay-step.js';
import {
  ExecutionContext,
  StepType,
  WorkflowStep,
  StepResult,
  WorkflowError,
  WorkflowErrorCode,
} from '../types.js';

function makeCtx(vars: Record<string, unknown> = {}): ExecutionContext {
  return {
    workflowId: 'wf-1',
    instanceId: 'inst-1',
    variables: { ...vars },
    stepResults: new Map(),
  };
}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'test-step',
    type: StepType.Action,
    config: { action: 'noop' },
    ...overrides,
  };
}

// -------------------------------------------------------------------------
// ActionStepExecutor
// -------------------------------------------------------------------------
describe('ActionStepExecutor', () => {
  const evaluator = new ExpressionEvaluator();
  const executor = new ActionStepExecutor(evaluator);

  it('executes a built-in log action', async () => {
    const ctx = makeCtx();
    const result = await executor.execute(
      'log-step',
      { action: 'log', inputs: { message: 'test', level: 'info' } },
      ctx,
      1
    );
    expect(result.status).toBe('success');
    expect(result.stepId).toBe('log-step');
    expect(ctx.stepResults.has('log-step')).toBe(true);
  });

  it('executes create_node and returns node with id', async () => {
    const ctx = makeCtx();
    const result = await executor.execute(
      'create-node-step',
      { action: 'create_node', inputs: { type: 'document', properties: { title: 'Test' } } },
      ctx,
      1
    );
    expect(result.status).toBe('success');
    const output = result.output as { nodeId: string };
    expect(typeof output.nodeId).toBe('string');
  });

  it('executes create_edge and returns edge with id', async () => {
    const ctx = makeCtx();
    const result = await executor.execute(
      'create-edge-step',
      { action: 'create_edge', inputs: { fromId: 'n1', toId: 'n2', edgeType: 'related' } },
      ctx,
      1
    );
    expect(result.status).toBe('success');
    const output = result.output as { edgeId: string };
    expect(typeof output.edgeId).toBe('string');
  });

  it('executes extract_keywords and returns keywords array', async () => {
    const ctx = makeCtx();
    const result = await executor.execute(
      'keywords-step',
      { action: 'extract_keywords', inputs: { text: 'the quick brown fox jumps over the lazy dog' } },
      ctx,
      1
    );
    expect(result.status).toBe('success');
    const output = result.output as { keywords: string[] };
    expect(Array.isArray(output.keywords)).toBe(true);
    expect(output.keywords.length).toBeGreaterThan(0);
    // Stop words should be filtered
    expect(output.keywords).not.toContain('the');
    expect(output.keywords).not.toContain('over');
  });

  it('executes set_variable and updates context', async () => {
    const ctx = makeCtx();
    await executor.execute(
      'set-var-step',
      { action: 'set_variable', inputs: { name: 'myVar', value: 42 } },
      ctx,
      1
    );
    expect(ctx.variables['myVar']).toBe(42);
  });

  it('throws WorkflowError for unknown action', async () => {
    const ctx = makeCtx();
    await expect(
      executor.execute('bad-step', { action: 'nonexistent_action' }, ctx, 1)
    ).rejects.toThrow(WorkflowError);
  });

  it('applies output mapping to context variables', async () => {
    const ctx = makeCtx();
    await executor.execute(
      'create-with-mapping',
      {
        action: 'create_node',
        inputs: { type: 'doc' },
        outputMapping: { nodeId: 'lastCreatedId' },
      },
      ctx,
      1
    );
    expect(typeof ctx.variables['lastCreatedId']).toBe('string');
  });

  it('registers and executes custom action', async () => {
    const ev2 = new ExpressionEvaluator();
    const exec2 = new ActionStepExecutor(ev2);
    let called = false;
    exec2.registerAction('my-action', async () => {
      called = true;
      return { ok: true };
    });

    const ctx = makeCtx();
    const result = await exec2.execute('my-step', { action: 'my-action' }, ctx, 1);
    expect(result.status).toBe('success');
    expect(called).toBe(true);
  });

  it('resolves expression inputs using evaluator', async () => {
    const ctx = makeCtx({ nodeTitle: 'Dynamic Title' });
    let capturedTitle = '';
    const ev2 = new ExpressionEvaluator();
    const exec2 = new ActionStepExecutor(ev2);
    exec2.registerAction('capture', async (inputs) => {
      capturedTitle = inputs['title'] as string;
      return {};
    });

    await exec2.execute(
      'capture-step',
      { action: 'capture', inputs: { title: '$.nodeTitle' } },
      ctx,
      1
    );
    expect(capturedTitle).toBe('Dynamic Title');
  });
});

// -------------------------------------------------------------------------
// ConditionStepExecutor
// -------------------------------------------------------------------------
describe('ConditionStepExecutor', () => {
  const evaluator = new ExpressionEvaluator();
  const executor = new ConditionStepExecutor(evaluator);

  it('evaluates simple eq condition (true)', () => {
    const ctx = makeCtx({ status: 'active' });
    const result = executor.evaluateCondition(
      { type: 'simple', left: '$.status', operator: 'eq', right: 'active' },
      ctx
    );
    expect(result).toBe(true);
  });

  it('evaluates simple eq condition (false)', () => {
    const ctx = makeCtx({ status: 'inactive' });
    const result = executor.evaluateCondition(
      { type: 'simple', left: '$.status', operator: 'eq', right: 'active' },
      ctx
    );
    expect(result).toBe(false);
  });

  it('evaluates gt operator', () => {
    const ctx = makeCtx({ count: 10 });
    expect(executor.evaluateCondition({ type: 'simple', left: '$.count', operator: 'gt', right: 5 }, ctx)).toBe(true);
    expect(executor.evaluateCondition({ type: 'simple', left: '$.count', operator: 'gt', right: 15 }, ctx)).toBe(false);
  });

  it('evaluates contains operator on string', () => {
    const ctx = makeCtx({ text: 'hello world' });
    expect(executor.evaluateCondition({ type: 'simple', left: '$.text', operator: 'contains', right: 'world' }, ctx)).toBe(true);
    expect(executor.evaluateCondition({ type: 'simple', left: '$.text', operator: 'contains', right: 'xyz' }, ctx)).toBe(false);
  });

  it('evaluates matches operator with regex', () => {
    const ctx = makeCtx({ email: 'user@example.com' });
    expect(executor.evaluateCondition({ type: 'simple', left: '$.email', operator: 'matches', right: '@example\\.com$' }, ctx)).toBe(true);
  });

  it('evaluates logical AND (all true)', () => {
    const ctx = makeCtx({ a: 5, b: 10 });
    const result = executor.evaluateCondition({
      type: 'logical',
      operator: 'and',
      conditions: [
        { type: 'simple', left: '$.a', operator: 'gt', right: 0 },
        { type: 'simple', left: '$.b', operator: 'gt', right: 5 },
      ],
    }, ctx);
    expect(result).toBe(true);
  });

  it('evaluates logical AND (one false)', () => {
    const ctx = makeCtx({ a: 5, b: 3 });
    const result = executor.evaluateCondition({
      type: 'logical',
      operator: 'and',
      conditions: [
        { type: 'simple', left: '$.a', operator: 'gt', right: 0 },
        { type: 'simple', left: '$.b', operator: 'gt', right: 5 },
      ],
    }, ctx);
    expect(result).toBe(false);
  });

  it('evaluates logical OR (one true)', () => {
    const ctx = makeCtx({ a: 1, b: 10 });
    const result = executor.evaluateCondition({
      type: 'logical',
      operator: 'or',
      conditions: [
        { type: 'simple', left: '$.a', operator: 'gt', right: 5 },
        { type: 'simple', left: '$.b', operator: 'gt', right: 5 },
      ],
    }, ctx);
    expect(result).toBe(true);
  });

  it('evaluates logical NOT', () => {
    const ctx = makeCtx({ active: false });
    const result = executor.evaluateCondition({
      type: 'logical',
      operator: 'not',
      conditions: [
        { type: 'simple', left: '$.active', operator: 'eq', right: true },
      ],
    }, ctx);
    expect(result).toBe(true);
  });

  it('evaluates nested conditions', () => {
    const ctx = makeCtx({ role: 'admin', active: true });
    const result = executor.evaluateCondition({
      type: 'logical',
      operator: 'and',
      conditions: [
        { type: 'simple', left: '$.active', operator: 'eq', right: true },
        {
          type: 'logical',
          operator: 'or',
          conditions: [
            { type: 'simple', left: '$.role', operator: 'eq', right: 'admin' },
            { type: 'simple', left: '$.role', operator: 'eq', right: 'superuser' },
          ],
        },
      ],
    }, ctx);
    expect(result).toBe(true);
  });

  it('executes condition step and records branch result', async () => {
    const ctx = makeCtx({ value: 100 });
    const result = await executor.execute(
      'cond-step',
      {
        condition: { type: 'simple', left: '$.value', operator: 'gt', right: 50 },
        thenSteps: ['then-1'],
        elseSteps: ['else-1'],
      },
      ctx,
      1
    );
    expect(result.status).toBe('success');
    expect(result.conditionResult.branch).toBe('then');
    expect(result.conditionResult.nextStepIds).toEqual(['then-1']);
  });

  it('ConditionStepExecutor.fromExpression parses "$.x > 5"', () => {
    const cond = ConditionStepExecutor.fromExpression('$.x > 5');
    expect(cond.type).toBe('simple');
    if (cond.type === 'simple') {
      expect(cond.operator).toBe('gt');
      expect(cond.right).toBe(5);
    }
  });
});

// -------------------------------------------------------------------------
// LoopStepExecutor
// -------------------------------------------------------------------------
describe('LoopStepExecutor', () => {
  const evaluator = new ExpressionEvaluator();
  const executor = new LoopStepExecutor(evaluator);

  function makeSubStepExecutor(handler: (step: WorkflowStep, ctx: ExecutionContext) => Promise<StepResult>) {
    return handler;
  }

  it('iterates over array items in for-each mode', async () => {
    const ctx = makeCtx({ items: ['a', 'b', 'c'] });
    const visited: unknown[] = [];

    const result = await executor.execute(
      'loop-step',
      {
        mode: 'for-each',
        items: '$.items',
        itemVariable: 'item',
        steps: [makeStep({ id: 'inner', type: StepType.Action, config: { action: 'noop' } })],
        accumulator: 'results',
      },
      ctx,
      1,
      makeSubStepExecutor(async (step, stepCtx) => {
        visited.push(stepCtx.variables['item']);
        const r: StepResult = { stepId: step.id, status: 'success', output: stepCtx.variables['item'], startedAt: new Date(), completedAt: new Date(), attempt: 1 };
        stepCtx.stepResults.set(step.id, r);
        return r;
      })
    );

    expect(result.status).toBe('success');
    expect(result.iterations).toBe(3);
    expect(visited).toEqual(['a', 'b', 'c']);
  });

  it('respects maxIterations limit', async () => {
    const ctx = makeCtx({ items: [1, 2, 3, 4, 5] });

    await expect(
      executor.execute(
        'loop-step',
        {
          mode: 'for-each',
          items: '$.items',
          itemVariable: 'item',
          steps: [makeStep({ id: 'inner' })],
          maxIterations: 2,
        },
        ctx,
        1,
        async (step, stepCtx) => {
          const r: StepResult = { stepId: step.id, status: 'success', output: null, startedAt: new Date(), completedAt: new Date(), attempt: 1 };
          stepCtx.stepResults.set(step.id, r);
          return r;
        }
      )
    ).rejects.toThrow(WorkflowError);
  });

  it('runs while loop with termination condition', async () => {
    const ctx = makeCtx({ counter: 0 });
    let iterations = 0;

    const result = await executor.execute(
      'while-step',
      {
        mode: 'while',
        condition: { type: 'simple', left: '$.counter', operator: 'lt', right: 3 },
        steps: [makeStep({ id: 'inner' })],
        maxIterations: 10,
      },
      ctx,
      1,
      async (step, stepCtx) => {
        iterations++;
        stepCtx.variables['counter'] = iterations;
        const r: StepResult = { stepId: step.id, status: 'success', output: iterations, startedAt: new Date(), completedAt: new Date(), attempt: 1 };
        stepCtx.stepResults.set(step.id, r);
        return r;
      }
    );

    expect(result.status).toBe('success');
    expect(result.iterations).toBe(3);
  });

  it('throws for non-array items expression', async () => {
    const ctx = makeCtx({ notAnArray: 'string' });
    await expect(
      executor.execute(
        'bad-loop',
        { mode: 'for-each', items: '$.notAnArray', steps: [makeStep({ id: 'inner' })] },
        ctx,
        1,
        async () => ({ stepId: 'inner', status: 'success', output: null, startedAt: new Date(), completedAt: new Date(), attempt: 1 })
      )
    ).rejects.toThrow(WorkflowError);
  });
});

// -------------------------------------------------------------------------
// ParallelStepExecutor
// -------------------------------------------------------------------------
describe('ParallelStepExecutor', () => {
  const executor = new ParallelStepExecutor();

  it('runs all steps concurrently and collects results', async () => {
    const ctx = makeCtx();
    const steps = [
      makeStep({ id: 'p1' }),
      makeStep({ id: 'p2' }),
      makeStep({ id: 'p3' }),
    ];

    const result = await executor.execute(
      'parallel-step',
      { steps, waitStrategy: 'all', errorStrategy: 'collect-all' },
      ctx,
      1,
      async (step) => ({
        stepId: step.id,
        status: 'success' as const,
        output: { id: step.id },
        startedAt: new Date(),
        completedAt: new Date(),
        attempt: 1,
      })
    );

    expect(result.status).toBe('success');
    expect(result.results).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors in collect-all mode', async () => {
    const ctx = makeCtx();
    const steps = [makeStep({ id: 'ok' }), makeStep({ id: 'fail' })];

    const result = await executor.execute(
      'parallel-step',
      { steps, waitStrategy: 'all', errorStrategy: 'collect-all' },
      ctx,
      1,
      async (step) => {
        if (step.id === 'fail') throw new Error('Step failed');
        return { stepId: step.id, status: 'success' as const, output: null, startedAt: new Date(), completedAt: new Date(), attempt: 1 };
      }
    );

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('respects concurrency limit', async () => {
    const ctx = makeCtx();
    let maxConcurrent = 0;
    let current = 0;

    const steps = Array.from({ length: 6 }, (_, i) => makeStep({ id: `s${i}` }));

    await executor.execute(
      'parallel-step',
      { steps, waitStrategy: 'all', errorStrategy: 'collect-all', concurrencyLimit: 2 },
      ctx,
      1,
      async (step) => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise(r => setTimeout(r, 5));
        current--;
        return { stepId: step.id, status: 'success' as const, output: null, startedAt: new Date(), completedAt: new Date(), attempt: 1 };
      }
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('returns empty results for empty steps array', async () => {
    const ctx = makeCtx();
    const result = await executor.execute(
      'parallel-step',
      { steps: [], waitStrategy: 'all', errorStrategy: 'collect-all' },
      ctx,
      1,
      async (step) => ({ stepId: step.id, status: 'success' as const, output: null, startedAt: new Date(), completedAt: new Date(), attempt: 1 })
    );
    expect(result.results).toHaveLength(0);
    expect(result.status).toBe('success');
  });
});

// -------------------------------------------------------------------------
// DelayStepExecutor
// -------------------------------------------------------------------------
describe('DelayStepExecutor', () => {
  const evaluator = new ExpressionEvaluator();
  const executor = new DelayStepExecutor(evaluator);

  it('delays by fixed ms', async () => {
    const ctx = makeCtx();
    const start = Date.now();
    const result = await executor.execute('delay-step', { ms: 20 }, ctx, 1);
    const elapsed = Date.now() - start;
    expect(result.status).toBe('success');
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('delays by 0ms when no config', async () => {
    const ctx = makeCtx();
    const result = await executor.execute('delay-step', {}, ctx, 1);
    expect(result.status).toBe('success');
    expect((result.output as { delayMs: number }).delayMs).toBe(0);
  });

  it('resolves delay from context variable', async () => {
    const ctx = makeCtx({ waitMs: 10 });
    const result = await executor.execute('delay-step', { variable: '$.waitMs' }, ctx, 1);
    expect(result.status).toBe('success');
  });

  it('throws for negative delay', async () => {
    const ctx = makeCtx();
    await expect(
      executor.execute('delay-step', { ms: -100 }, ctx, 1)
    ).rejects.toThrow(WorkflowError);
  });
});
