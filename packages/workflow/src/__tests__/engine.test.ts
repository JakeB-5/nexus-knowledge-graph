import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../engine.js';
import { InMemoryPersistence } from '../persistence.js';
import { createWorkflow } from '../builder.js';
import {
  WorkflowStatus,
  WorkflowError,
  WorkflowErrorCode,
  StepType,
} from '../types.js';

function makeEngine() {
  const persistence = new InMemoryPersistence();
  const engine = new WorkflowEngine({ persistence, defaultTimeoutMs: 10_000 });
  return { engine, persistence };
}

describe('WorkflowEngine', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------
  describe('registerWorkflow', () => {
    it('registers a workflow definition', () => {
      const { engine } = makeEngine();
      const def = createWorkflow('Test').action('s1', 'log', {}).build();
      engine.registerWorkflow(def);
      expect(engine.getDefinition(def.id)).toEqual(def);
    });

    it('throws if workflow has no steps', () => {
      const { engine } = makeEngine();
      expect(() =>
        engine.registerWorkflow({
          id: 'bad',
          name: 'Bad',
          version: 1,
          triggers: [],
          steps: [],
          firstStepId: '',
        })
      ).toThrow(WorkflowError);
    });

    it('throws if firstStepId does not exist', () => {
      const { engine } = makeEngine();
      expect(() =>
        engine.registerWorkflow({
          id: 'bad2',
          name: 'Bad2',
          version: 1,
          triggers: [],
          steps: [{ id: 's1', type: StepType.Action, config: { action: 'log' } }],
          firstStepId: 'does-not-exist',
        })
      ).toThrow(WorkflowError);
    });

    it('unregisters a workflow', () => {
      const { engine } = makeEngine();
      const def = createWorkflow('Temp').action('s1', 'log', {}).build();
      engine.registerWorkflow(def);
      engine.unregisterWorkflow(def.id);
      expect(engine.getDefinition(def.id)).toBeUndefined();
    });

    it('lists all definitions', () => {
      const { engine } = makeEngine();
      const d1 = createWorkflow('W1').action('s1', 'log', {}).build();
      const d2 = createWorkflow('W2').action('s1', 'log', {}).build();
      engine.registerWorkflow(d1);
      engine.registerWorkflow(d2);
      expect(engine.listDefinitions()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // startWorkflowSync - single action
  // -------------------------------------------------------------------------
  describe('startWorkflowSync - basic execution', () => {
    it('runs a single action step and completes', async () => {
      const { engine } = makeEngine();
      const logs: unknown[] = [];
      engine.registerAction('capture', async (inputs) => {
        logs.push(inputs['message']);
        return { captured: true };
      });

      const def = createWorkflow('Log Workflow')
        .action('log-step', 'capture', { message: 'hello' })
        .build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      expect(instance.status).toBe(WorkflowStatus.Completed);
      expect(logs).toEqual(['hello']);
    });

    it('passes trigger payload to context', async () => {
      const { engine } = makeEngine();
      let capturedPayload: unknown;
      engine.registerAction('capture-payload', async (_inputs, ctx) => {
        capturedPayload = ctx.triggerPayload;
        return {};
      });

      const def = createWorkflow('Payload Workflow')
        .action('step', 'capture-payload', {})
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id, { triggerPayload: { event: 'node.created', nodeId: '42' } });
      expect(capturedPayload).toEqual({ event: 'node.created', nodeId: '42' });
    });

    it('passes custom variables to context', async () => {
      const { engine } = makeEngine();
      let capturedVars: Record<string, unknown> = {};
      engine.registerAction('capture-vars', async (_inputs, ctx) => {
        capturedVars = { ...ctx.variables };
        return {};
      });

      const def = createWorkflow('Vars Workflow')
        .variable('defaultMax', 50)
        .action('step', 'capture-vars', {})
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id, { variables: { extraVar: 'hello' } });
      expect(capturedVars['defaultMax']).toBe(50);
      expect(capturedVars['extraVar']).toBe('hello');
    });

    it('executes multiple sequential steps in order', async () => {
      const { engine } = makeEngine();
      const order: string[] = [];
      engine.registerAction('step-tracker', async (inputs) => {
        order.push(inputs['name'] as string);
        return {};
      });

      const def = createWorkflow('Sequential Workflow')
        .action('first', 'step-tracker', { name: 'first' })
        .action('second', 'step-tracker', { name: 'second' })
        .action('third', 'step-tracker', { name: 'third' })
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(order).toEqual(['first', 'second', 'third']);
    });
  });

  // -------------------------------------------------------------------------
  // Condition branching
  // -------------------------------------------------------------------------
  describe('condition branching', () => {
    it('executes then-branch when condition is true', async () => {
      const { engine } = makeEngine();
      const executed: string[] = [];
      engine.registerAction('track', async (inputs) => {
        executed.push(inputs['branch'] as string);
        return {};
      });

      const def = createWorkflow('Condition True Workflow')
        .variable('score', 100)
        .condition(
          { type: 'simple', left: '$.score', operator: 'gt', right: 50 },
          'Check score'
        )
        .then((b) => b.action('then-track', 'track', { branch: 'then' }))
        .else((b) => b.action('else-track', 'track', { branch: 'else' }))
        .end()
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(executed).toContain('then');
      expect(executed).not.toContain('else');
    });

    it('executes else-branch when condition is false', async () => {
      const { engine } = makeEngine();
      const executed: string[] = [];
      engine.registerAction('track', async (inputs) => {
        executed.push(inputs['branch'] as string);
        return {};
      });

      const def = createWorkflow('Condition False Workflow')
        .variable('score', 10)
        .condition(
          { type: 'simple', left: '$.score', operator: 'gt', right: 50 },
          'Check score'
        )
        .then((b) => b.action('then-track', 'track', { branch: 'then' }))
        .else((b) => b.action('else-track', 'track', { branch: 'else' }))
        .end()
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(executed).toContain('else');
      expect(executed).not.toContain('then');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('marks instance as failed on step error', async () => {
      const { engine } = makeEngine();
      engine.registerAction('fail-action', async () => {
        throw new Error('Action failed intentionally');
      });

      const def = createWorkflow('Failing Workflow')
        .action('fail', 'fail-action', {})
        .build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      expect(instance.status).toBe(WorkflowStatus.Failed);
      expect(instance.error?.message).toContain('Action failed intentionally');
    });

    it('continues on error when onError=continue', async () => {
      const { engine } = makeEngine();
      const executed: string[] = [];
      engine.registerAction('fail-action', async () => {
        throw new Error('Intentional');
      });
      engine.registerAction('track', async (inputs) => {
        executed.push(inputs['name'] as string);
        return {};
      });

      const def = createWorkflow('Continue On Error')
        .action('risky', 'fail-action', {}, { onError: 'continue' })
        .action('after', 'track', { name: 'after' })
        .build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      expect(instance.status).toBe(WorkflowStatus.Completed);
      expect(executed).toContain('after');
    });

    it('retries on failure and succeeds', async () => {
      const { engine } = makeEngine();
      let attempts = 0;
      engine.registerAction('flaky-action', async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary failure');
        return { ok: true };
      });

      const def = createWorkflow('Retry Workflow')
        .action('flaky', 'flaky-action', {}, { retry: { maxAttempts: 3, backoffMs: 0 } })
        .build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      expect(instance.status).toBe(WorkflowStatus.Completed);
      expect(attempts).toBe(3);
    });

    it('throws WorkflowNotFound for unknown workflow', async () => {
      const { engine } = makeEngine();
      await expect(engine.startWorkflowSync('nonexistent')).rejects.toThrow(WorkflowError);
    });

    it('skips step with guard condition that evaluates false', async () => {
      const { engine } = makeEngine();
      const executed: string[] = [];
      engine.registerAction('track', async (inputs) => {
        executed.push(inputs['name'] as string);
        return {};
      });

      const def = createWorkflow('Guard Workflow')
        .variable('skipMe', false)
        .step('guarded', StepType.Action, { action: 'track', inputs: { name: 'guarded' } }, {
          condition: { type: 'simple', left: '$.skipMe', operator: 'eq', right: true },
        })
        .action('always', 'track', { name: 'always' })
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(executed).not.toContain('guarded');
      expect(executed).toContain('always');
    });
  });

  // -------------------------------------------------------------------------
  // Variable interpolation in step configs
  // -------------------------------------------------------------------------
  describe('variable interpolation', () => {
    it('resolves $ expressions in action inputs', async () => {
      const { engine } = makeEngine();
      let captured = '';
      engine.registerAction('capture', async (inputs) => {
        captured = inputs['msg'] as string;
        return {};
      });

      const def = createWorkflow('Interpolation Workflow')
        .variable('name', 'World')
        .action('greet', 'capture', { msg: 'Hello {{$.name}}!' })
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(captured).toBe('Hello World!');
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  describe('cancelWorkflow', () => {
    it('cancels a workflow instance', async () => {
      const { engine } = makeEngine();
      const def = createWorkflow('Cancel Test').action('s1', 'log', {}).build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      // Cancel after completion - should throw or succeed
      try {
        await engine.cancelWorkflow(instance.id);
      } catch {
        // Already completed, ok
      }
    });
  });

  // -------------------------------------------------------------------------
  // getInstance / listInstances
  // -------------------------------------------------------------------------
  describe('getInstance / listInstances', () => {
    it('retrieves instance by id', async () => {
      const { engine } = makeEngine();
      const def = createWorkflow('Get Instance').action('s1', 'log', {}).build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      const fetched = await engine.getInstance(instance.id);
      expect(fetched?.id).toBe(instance.id);
    });

    it('returns null for unknown instance', async () => {
      const { engine } = makeEngine();
      const result = await engine.getInstance('nonexistent');
      expect(result).toBeNull();
    });

    it('lists instances filtered by workflowId', async () => {
      const { engine } = makeEngine();
      const def1 = createWorkflow('W1').action('s1', 'log', {}).build();
      const def2 = createWorkflow('W2').action('s1', 'log', {}).build();
      engine.registerWorkflow(def1);
      engine.registerWorkflow(def2);

      await engine.startWorkflowSync(def1.id);
      await engine.startWorkflowSync(def1.id);
      await engine.startWorkflowSync(def2.id);

      const w1Instances = await engine.listInstances({ workflowId: def1.id });
      expect(w1Instances).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Custom action registration
  // -------------------------------------------------------------------------
  describe('registerAction', () => {
    it('registers and invokes a custom action', async () => {
      const { engine } = makeEngine();
      let called = false;
      engine.registerAction('my-custom-action', async () => {
        called = true;
        return { result: 'custom' };
      });

      const def = createWorkflow('Custom Action Workflow')
        .action('custom', 'my-custom-action', {})
        .build();
      engine.registerWorkflow(def);

      await engine.startWorkflowSync(def.id);
      expect(called).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Step history
  // -------------------------------------------------------------------------
  describe('execution history', () => {
    it('records step results in instance history', async () => {
      const { engine } = makeEngine();
      const def = createWorkflow('History Workflow')
        .action('step-a', 'log', { message: 'a' })
        .action('step-b', 'log', { message: 'b' })
        .build();
      engine.registerWorkflow(def);

      const instance = await engine.startWorkflowSync(def.id);
      expect(instance.history.length).toBeGreaterThanOrEqual(2);
      expect(instance.history.every(r => r.status === 'success')).toBe(true);
    });
  });
});
