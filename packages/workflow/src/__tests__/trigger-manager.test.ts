import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriggerManager } from '../trigger-manager.js';
import { TriggerType, WorkflowDefinition, StepType, WorkflowError } from '../types.js';

function makeDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    version: 1,
    triggers: [],
    steps: [{ id: 's1', type: StepType.Action, config: { action: 'log' } }],
    firstStepId: 's1',
    ...overrides,
  };
}

describe('TriggerManager', () => {
  let manager: TriggerManager;

  beforeEach(() => {
    manager = new TriggerManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------
  describe('registerTrigger / registerWorkflowTriggers', () => {
    it('registers triggers from a workflow definition', () => {
      const def = makeDefinition({
        triggers: [
          { id: 't1', type: TriggerType.Manual, config: {} },
          { id: 't2', type: TriggerType.Event, config: { eventType: 'node.created' } },
        ],
      });

      manager.registerWorkflowTriggers(def);
      const triggers = manager.getTriggersForWorkflow(def.id);
      expect(triggers).toHaveLength(2);
    });

    it('registers a single trigger', () => {
      manager.registerTrigger('wf-1', { id: 't1', type: TriggerType.Manual, config: {} });
      expect(manager.getTriggersForWorkflow('wf-1')).toHaveLength(1);
    });

    it('returns empty array for unknown workflow', () => {
      expect(manager.getTriggersForWorkflow('unknown')).toHaveLength(0);
    });

    it('lists all triggers across workflows', () => {
      manager.registerTrigger('wf-1', { id: 't1', type: TriggerType.Manual, config: {} });
      manager.registerTrigger('wf-2', { id: 't2', type: TriggerType.Manual, config: {} });
      expect(manager.getAllTriggers()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Unregistration
  // -------------------------------------------------------------------------
  describe('unregisterWorkflowTriggers', () => {
    it('removes all triggers for a workflow', () => {
      manager.registerTrigger('wf-1', { id: 't1', type: TriggerType.Manual, config: {} });
      manager.registerTrigger('wf-1', { id: 't2', type: TriggerType.Manual, config: {} });
      manager.unregisterWorkflowTriggers('wf-1');
      expect(manager.getTriggersForWorkflow('wf-1')).toHaveLength(0);
    });

    it('does not affect other workflow triggers', () => {
      manager.registerTrigger('wf-1', { id: 't1', type: TriggerType.Manual, config: {} });
      manager.registerTrigger('wf-2', { id: 't2', type: TriggerType.Manual, config: {} });
      manager.unregisterWorkflowTriggers('wf-1');
      expect(manager.getTriggersForWorkflow('wf-2')).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Manual trigger
  // -------------------------------------------------------------------------
  describe('fireManual', () => {
    it('fires a manual trigger and calls onFire callback', async () => {
      const fired: Array<{ workflowId: string; triggerId: string; payload: unknown }> = [];
      manager.onFire(async (wId, tId, payload) => {
        fired.push({ workflowId: wId, triggerId: tId, payload });
      });

      manager.registerTrigger('wf-1', { id: 'manual-1', type: TriggerType.Manual, config: {} });
      await manager.fireManual('wf-1', 'manual-1', { source: 'test' });

      expect(fired).toHaveLength(1);
      expect(fired[0]!.workflowId).toBe('wf-1');
      expect(fired[0]!.triggerId).toBe('manual-1');
      expect(fired[0]!.payload).toEqual({ source: 'test' });
    });

    it('throws for unknown trigger', async () => {
      manager.registerTrigger('wf-1', { id: 'manual-1', type: TriggerType.Manual, config: {} });
      await expect(manager.fireManual('wf-1', 'nonexistent')).rejects.toThrow(WorkflowError);
    });

    it('fires with null payload if none provided', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, payload) => {
        fired.push(payload);
      });

      manager.registerTrigger('wf-1', { id: 'manual-1', type: TriggerType.Manual, config: {} });
      await manager.fireManual('wf-1', 'manual-1');
      expect(fired).toHaveLength(1);
      expect(fired[0]).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Event trigger
  // -------------------------------------------------------------------------
  describe('emitEvent', () => {
    it('fires matching event trigger on emitEvent', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, payload) => fired.push(payload));

      manager.registerTrigger('wf-1', {
        id: 'evt-1',
        type: TriggerType.Event,
        config: { eventType: 'node.created' },
      });

      await manager.emitEvent('node.created', { nodeId: 'n1' });
      expect(fired).toHaveLength(1);
      expect((fired[0] as { nodeId: string }).nodeId).toBe('n1');
    });

    it('does not fire for different event type', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, payload) => fired.push(payload));

      manager.registerTrigger('wf-1', {
        id: 'evt-1',
        type: TriggerType.Event,
        config: { eventType: 'node.created' },
      });

      await manager.emitEvent('node.deleted', { nodeId: 'n1' });
      expect(fired).toHaveLength(0);
    });

    it('fires multiple workflows for the same event type', async () => {
      const fired: string[] = [];
      manager.onFire(async (wId) => fired.push(wId));

      manager.registerTrigger('wf-1', { id: 'evt-1', type: TriggerType.Event, config: { eventType: 'node.created' } });
      manager.registerTrigger('wf-2', { id: 'evt-2', type: TriggerType.Event, config: { eventType: 'node.created' } });

      await manager.emitEvent('node.created', {});
      expect(fired).toContain('wf-1');
      expect(fired).toContain('wf-2');
    });

    it('evaluates trigger filter condition before firing', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, payload) => fired.push(payload));

      manager.registerTrigger('wf-1', {
        id: 'evt-filtered',
        type: TriggerType.Event,
        config: { eventType: 'node.updated' },
        condition: {
          expression: {
            type: 'simple',
            left: '$.status',
            operator: 'eq',
            right: 'published',
          },
        },
      });

      // Should not fire - condition not met
      await manager.emitEvent('node.updated', { status: 'draft' });
      expect(fired).toHaveLength(0);

      // Should fire - condition met
      await manager.emitEvent('node.updated', { status: 'published' });
      expect(fired).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Webhook trigger
  // -------------------------------------------------------------------------
  describe('webhook triggers', () => {
    it('registers webhook and returns path', () => {
      manager.registerTrigger('wf-1', {
        id: 'wh-1',
        type: TriggerType.Webhook,
        config: { path: '/webhooks/custom', method: 'POST' },
      });

      const webhooks = manager.getWebhooks();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]!.path).toBe('/webhooks/custom');
    });

    it('generates default path if none provided', () => {
      manager.registerTrigger('wf-1', {
        id: 'wh-auto',
        type: TriggerType.Webhook,
        config: {},
      });

      const webhooks = manager.getWebhooks();
      expect(webhooks[0]!.path).toMatch(/^\/webhooks\/wf-1\/wh-auto/);
    });

    it('handles webhook and fires callback', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, payload) => fired.push(payload));

      manager.registerTrigger('wf-1', {
        id: 'wh-1',
        type: TriggerType.Webhook,
        config: { path: '/webhooks/test', method: 'POST' },
      });

      const handled = await manager.handleWebhook('/webhooks/test', { data: 'imported' });
      expect(handled).toBe(true);
      expect(fired).toHaveLength(1);
    });

    it('returns false for unknown webhook path', async () => {
      const handled = await manager.handleWebhook('/unknown/path', {});
      expect(handled).toBe(false);
    });

    it('validates secret and throws on mismatch', async () => {
      manager.registerTrigger('wf-1', {
        id: 'wh-secret',
        type: TriggerType.Webhook,
        config: { path: '/webhooks/secure', secret: 'correct-secret' },
      });

      await expect(
        manager.handleWebhook('/webhooks/secure', {}, 'wrong-secret')
      ).rejects.toThrow(WorkflowError);
    });

    it('accepts valid secret', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, p) => fired.push(p));

      manager.registerTrigger('wf-1', {
        id: 'wh-secret-ok',
        type: TriggerType.Webhook,
        config: { path: '/webhooks/secure-ok', secret: 'my-secret' },
      });

      const handled = await manager.handleWebhook('/webhooks/secure-ok', { ok: true }, 'my-secret');
      expect(handled).toBe(true);
      expect(fired).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------
  describe('deduplication', () => {
    it('deduplicates triggers with same key within window', async () => {
      const fired: unknown[] = [];
      manager.onFire(async (_wId, _tId, p) => fired.push(p));

      manager.registerTrigger('wf-1', {
        id: 'evt-dedup',
        type: TriggerType.Event,
        config: { eventType: 'node.created' },
        deduplicationKey: '$.nodeId',
        deduplicationWindowMs: 5000,
      });

      await manager.emitEvent('node.created', { nodeId: 'n1' });
      await manager.emitEvent('node.created', { nodeId: 'n1' }); // same key, should dedup
      await manager.emitEvent('node.created', { nodeId: 'n2' }); // different key, should fire

      expect(fired).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------
  describe('destroy', () => {
    it('clears all state on destroy', () => {
      manager.registerTrigger('wf-1', { id: 't1', type: TriggerType.Manual, config: {} });
      manager.destroy();
      expect(manager.getAllTriggers()).toHaveLength(0);
      expect(manager.getWebhooks()).toHaveLength(0);
    });
  });
});
