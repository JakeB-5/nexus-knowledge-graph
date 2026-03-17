import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker } from '../health-check.js';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  afterEach(() => {
    checker.stopPolling();
  });

  describe('custom function checks', () => {
    it('runs a healthy custom check', async () => {
      checker.registerCustom('db', async () => ({ healthy: true, message: 'Connected' }));
      const result = await checker.runCheck('db');
      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Connected');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('runs an unhealthy custom check', async () => {
      checker.registerCustom('db', async () => ({ healthy: false, message: 'Connection refused' }));
      const result = await checker.runCheck('db');
      expect(result.status).toBe('unhealthy');
    });

    it('catches thrown errors and marks unhealthy', async () => {
      checker.registerCustom('svc', async () => { throw new Error('Network error'); });
      const result = await checker.runCheck('svc');
      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Network error');
    });

    it('passes metadata through', async () => {
      checker.registerCustom('cache', async () => ({
        healthy: true,
        metadata: { hitRate: 0.95, connections: 10 },
      }));
      const result = await checker.runCheck('cache');
      expect(result.metadata?.['hitRate']).toBe(0.95);
    });
  });

  describe('aggregate', () => {
    it('returns healthy when all checks pass', async () => {
      checker.registerCustom('a', async () => ({ healthy: true }));
      checker.registerCustom('b', async () => ({ healthy: true }));
      await checker.checkAll();
      expect(checker.aggregate().status).toBe('healthy');
    });

    it('returns unhealthy when any check fails', async () => {
      checker.registerCustom('a', async () => ({ healthy: true }));
      checker.registerCustom('b', async () => ({ healthy: false }));
      await checker.checkAll();
      expect(checker.aggregate().status).toBe('unhealthy');
    });

    it('includes all check results in aggregate', async () => {
      checker.registerCustom('a', async () => ({ healthy: true }));
      checker.registerCustom('b', async () => ({ healthy: false }));
      const agg = await checker.checkAll();
      expect(Object.keys(agg.checks)).toContain('a');
      expect(Object.keys(agg.checks)).toContain('b');
    });
  });

  describe('liveness / readiness', () => {
    it('only includes liveness checks in liveness()', async () => {
      checker.registerCustom('live', async () => ({ healthy: true }), 'liveness');
      checker.registerCustom('ready', async () => ({ healthy: false }), 'readiness');
      const result = await checker.liveness();
      expect(Object.keys(result.checks)).toContain('live');
      expect(Object.keys(result.checks)).not.toContain('ready');
      expect(result.status).toBe('healthy');
    });

    it('only includes readiness checks in readiness()', async () => {
      checker.registerCustom('live', async () => ({ healthy: false }), 'liveness');
      checker.registerCustom('ready', async () => ({ healthy: true }), 'readiness');
      const result = await checker.readiness();
      expect(Object.keys(result.checks)).toContain('ready');
      expect(Object.keys(result.checks)).not.toContain('live');
      expect(result.status).toBe('healthy');
    });
  });

  describe('history', () => {
    it('records check history', async () => {
      checker.registerCustom('db', async () => ({ healthy: true }), 'readiness', 5);
      await checker.runCheck('db');
      await checker.runCheck('db');
      expect(checker.getHistory('db')).toHaveLength(2);
    });

    it('trims history to maxHistory', async () => {
      checker.registerCustom('db', async () => ({ healthy: true }), 'readiness', 3);
      for (let i = 0; i < 5; i++) await checker.runCheck('db');
      expect(checker.getHistory('db')).toHaveLength(3);
    });
  });

  describe('unregister', () => {
    it('removes a check', async () => {
      checker.registerCustom('db', async () => ({ healthy: true }));
      checker.unregister('db');
      await expect(checker.runCheck('db')).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws for unknown check name', async () => {
      await expect(checker.runCheck('nonexistent')).rejects.toThrow(
        'Health check "nonexistent" not registered'
      );
    });
  });
});
