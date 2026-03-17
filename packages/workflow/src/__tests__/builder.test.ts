import { describe, it, expect } from 'vitest';
import { createWorkflow, WorkflowBuilder } from '../builder.js';
import {
  StepType,
  TriggerType,
  WorkflowError,
} from '../types.js';

describe('WorkflowBuilder', () => {
  // -------------------------------------------------------------------------
  // Basic construction
  // -------------------------------------------------------------------------
  describe('basic construction', () => {
    it('builds a minimal workflow', () => {
      const def = createWorkflow('Test Workflow')
        .action('step1', 'log', { message: 'hello' })
        .build();

      expect(def.name).toBe('Test Workflow');
      expect(def.steps).toHaveLength(1);
      expect(def.firstStepId).toBe(def.steps[0]!.id);
    });

    it('sets id, description, version', () => {
      const def = createWorkflow('My Workflow')
        .id('my-workflow')
        .description('Test description')
        .version(3)
        .action('step1', 'log', {})
        .build();

      expect(def.id).toBe('my-workflow');
      expect(def.description).toBe('Test description');
      expect(def.version).toBe(3);
    });

    it('sets timeout', () => {
      const def = createWorkflow('Timeout Workflow')
        .timeout(5000)
        .action('s1', 'log', {})
        .build();

      expect(def.timeoutMs).toBe(5000);
    });

    it('sets tags', () => {
      const def = createWorkflow('Tagged Workflow')
        .tags('alpha', 'beta')
        .action('s1', 'log', {})
        .build();

      expect(def.tags).toEqual(['alpha', 'beta']);
    });

    it('sets default variables', () => {
      const def = createWorkflow('Var Workflow')
        .variable('maxItems', 100)
        .variables({ retryCount: 3, prefix: 'nexus' })
        .action('s1', 'log', {})
        .build();

      expect(def.variables).toMatchObject({ maxItems: 100, retryCount: 3, prefix: 'nexus' });
    });
  });

  // -------------------------------------------------------------------------
  // Triggers
  // -------------------------------------------------------------------------
  describe('triggers', () => {
    it('adds a manual trigger', () => {
      const def = createWorkflow('Manual Workflow')
        .manualTrigger('trigger-1')
        .action('s1', 'log', {})
        .build();

      expect(def.triggers).toHaveLength(1);
      expect(def.triggers[0]!.type).toBe(TriggerType.Manual);
      expect(def.triggers[0]!.id).toBe('trigger-1');
    });

    it('adds a schedule trigger', () => {
      const def = createWorkflow('Schedule Workflow')
        .scheduleTrigger('0 9 * * *', 'UTC', 'sched-1')
        .action('s1', 'log', {})
        .build();

      expect(def.triggers[0]!.type).toBe(TriggerType.Schedule);
      expect((def.triggers[0]!.config as { cron: string }).cron).toBe('0 9 * * *');
    });

    it('adds an event trigger', () => {
      const def = createWorkflow('Event Workflow')
        .eventTrigger('node.created', undefined, 'evt-1')
        .action('s1', 'log', {})
        .build();

      expect(def.triggers[0]!.type).toBe(TriggerType.Event);
      expect((def.triggers[0]!.config as { eventType: string }).eventType).toBe('node.created');
    });

    it('adds a webhook trigger', () => {
      const def = createWorkflow('Webhook Workflow')
        .webhookTrigger('/webhooks/test', 'secret123', 'POST', 'wh-1')
        .action('s1', 'log', {})
        .build();

      expect(def.triggers[0]!.type).toBe(TriggerType.Webhook);
      const cfg = def.triggers[0]!.config as { path: string; secret: string };
      expect(cfg.path).toBe('/webhooks/test');
      expect(cfg.secret).toBe('secret123');
    });

    it('supports multiple triggers', () => {
      const def = createWorkflow('Multi Trigger')
        .manualTrigger()
        .scheduleTrigger('* * * * *')
        .action('s1', 'log', {})
        .build();

      expect(def.triggers).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Step chaining
  // -------------------------------------------------------------------------
  describe('step chaining', () => {
    it('chains steps with .next links', () => {
      const def = createWorkflow('Chained Workflow')
        .action('step-a', 'log', { message: 'a' })
        .action('step-b', 'log', { message: 'b' })
        .action('step-c', 'log', { message: 'c' })
        .build();

      const [a, b, c] = def.steps;
      expect(a!.next).toBe(b!.id);
      expect(b!.next).toBe(c!.id);
      expect(c!.next).toBeUndefined();
    });

    it('firstStepId points to first step', () => {
      const def = createWorkflow('First Step')
        .action('first', 'log', {})
        .action('second', 'log', {})
        .build();

      expect(def.firstStepId).toBe(def.steps[0]!.id);
    });
  });

  // -------------------------------------------------------------------------
  // Action steps
  // -------------------------------------------------------------------------
  describe('action steps', () => {
    it('creates action step with correct type', () => {
      const def = createWorkflow('Action Test')
        .action('create', 'create_node', { type: 'document' })
        .build();

      const step = def.steps[0]!;
      expect(step.type).toBe(StepType.Action);
      expect((step.config as { action: string }).action).toBe('create_node');
    });

    it('supports retry config', () => {
      const def = createWorkflow('Retry Test')
        .action('fetch', 'http_request', { url: 'http://example.com' }, {
          retry: { maxAttempts: 3, backoffMs: 500 },
        })
        .build();

      expect(def.steps[0]!.retry?.maxAttempts).toBe(3);
      expect(def.steps[0]!.retry?.backoffMs).toBe(500);
    });

    it('supports onError config', () => {
      const def = createWorkflow('OnError Test')
        .action('risky', 'http_request', { url: 'http://bad.example' }, { onError: 'continue' })
        .action('always', 'log', { message: 'done' })
        .build();

      expect(def.steps[0]!.onError).toBe('continue');
    });
  });

  // -------------------------------------------------------------------------
  // Delay steps
  // -------------------------------------------------------------------------
  describe('delay steps', () => {
    it('creates fixed delay step', () => {
      const def = createWorkflow('Delay Test')
        .delay(1000, 'Wait 1s')
        .build();

      const step = def.steps[0]!;
      expect(step.type).toBe(StepType.Delay);
      expect((step.config as { ms: number }).ms).toBe(1000);
      expect(step.name).toBe('Wait 1s');
    });

    it('creates dynamic delay step from variable', () => {
      const def = createWorkflow('Dynamic Delay')
        .delay('$.delayMs')
        .build();

      expect((def.steps[0]!.config as { variable: string }).variable).toBe('$.delayMs');
    });
  });

  // -------------------------------------------------------------------------
  // Loop steps
  // -------------------------------------------------------------------------
  describe('loop steps', () => {
    it('creates for-each loop step', () => {
      const def = createWorkflow('Loop Test')
        .loop('$.items', (b) => b.action('process', 'log', { message: '{{$.item}}' }))
        .build();

      const step = def.steps[0]!;
      expect(step.type).toBe(StepType.Loop);
      const cfg = step.config as { mode: string; items: string };
      expect(cfg.mode).toBe('for-each');
      expect(cfg.items).toBe('$.items');
    });

    it('supports accumulator option', () => {
      const def = createWorkflow('Accumulator Loop')
        .loop(
          '$.items',
          (b) => b.action('process', 'log', {}),
          { accumulator: 'results' }
        )
        .build();

      expect((def.steps[0]!.config as { accumulator: string }).accumulator).toBe('results');
    });
  });

  // -------------------------------------------------------------------------
  // Parallel steps
  // -------------------------------------------------------------------------
  describe('parallel steps', () => {
    it('creates parallel step with sub-steps', () => {
      const def = createWorkflow('Parallel Test')
        .parallel((b) =>
          b
            .action('task-a', 'log', { message: 'a' })
            .action('task-b', 'log', { message: 'b' })
        )
        .build();

      const step = def.steps[0]!;
      expect(step.type).toBe(StepType.Parallel);
      const cfg = step.config as { steps: unknown[]; waitStrategy: string };
      expect(cfg.steps).toHaveLength(2);
      expect(cfg.waitStrategy).toBe('all');
    });

    it('supports wait-for-first strategy', () => {
      const def = createWorkflow('First Wins')
        .parallel(
          (b) => b.action('a', 'log', {}).action('b', 'log', {}),
          { waitStrategy: 'first' }
        )
        .build();

      expect((def.steps[0]!.config as { waitStrategy: string }).waitStrategy).toBe('first');
    });
  });

  // -------------------------------------------------------------------------
  // Webhook steps
  // -------------------------------------------------------------------------
  describe('webhook steps', () => {
    it('creates webhook step', () => {
      const def = createWorkflow('Webhook Step Test')
        .webhook('https://api.example.com/notify', { method: 'POST', name: 'Notify' })
        .build();

      const step = def.steps[0]!;
      expect(step.type).toBe(StepType.Webhook);
      expect((step.config as { url: string }).url).toBe('https://api.example.com/notify');
      expect(step.name).toBe('Notify');
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  describe('validation', () => {
    it('throws if name is missing', () => {
      expect(() =>
        new WorkflowBuilder()
          .action('s1', 'log', {})
          .build()
      ).toThrow(WorkflowError);
    });

    it('throws if no steps', () => {
      expect(() =>
        new WorkflowBuilder().name('Empty Workflow').build()
      ).toThrow(WorkflowError);
    });

    it('throws if step references unknown next step', () => {
      // Manually corrupt a step's next reference
      const builder = createWorkflow('Bad Next')
        .action('s1', 'log', {});
      // Inject a bad next reference
      const step = (builder as unknown as { _steps: Array<{ next?: string }> })._steps[0];
      if (step) step.next = 'nonexistent-step';
      expect(() => builder.build()).toThrow(WorkflowError);
    });
  });
});
