import { describe, it, expect, beforeEach } from 'vitest';
import { LoadBalancer } from '../load-balancer.js';
import { LoadBalancerStrategy } from '../types.js';
import type { ServerInstance } from '../types.js';

function makeServer(id: string, weight = 1): ServerInstance {
  return { id, url: `http://${id}`, weight, connections: 0, healthy: true };
}

describe('LoadBalancer', () => {
  describe('round-robin', () => {
    let lb: LoadBalancer;

    beforeEach(() => {
      lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));
      lb.addServer(makeServer('c'));
    });

    it('cycles through servers in order', () => {
      const ids = [lb.pick()?.id, lb.pick()?.id, lb.pick()?.id];
      expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('wraps around after all servers', () => {
      lb.pick(); lb.pick(); lb.pick();
      expect(lb.pick()?.id).toBe('a');
    });

    it('skips unhealthy servers', () => {
      lb.setHealth('b', false);
      const picked = new Set([lb.pick()?.id, lb.pick()?.id, lb.pick()?.id]);
      expect(picked.has('b')).toBe(false);
    });

    it('returns null with no healthy servers', () => {
      lb.setHealth('a', false);
      lb.setHealth('b', false);
      lb.setHealth('c', false);
      expect(lb.pick()).toBeNull();
    });
  });

  describe('random', () => {
    it('returns a healthy server', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.RANDOM });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));
      const server = lb.pick();
      expect(server).not.toBeNull();
      expect(['a', 'b']).toContain(server?.id);
    });
  });

  describe('least-connections', () => {
    it('picks server with fewest connections', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.LEAST_CONNECTIONS });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));

      lb.incrementConnections('a');
      lb.incrementConnections('a');
      lb.incrementConnections('b');

      expect(lb.pick()?.id).toBe('b');
    });

    it('tracks connections accurately', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.LEAST_CONNECTIONS });
      lb.addServer(makeServer('a'));
      lb.incrementConnections('a');
      lb.incrementConnections('a');
      lb.decrementConnections('a');
      expect(lb.getServers().find((s) => s.id === 'a')?.connections).toBe(1);
    });
  });

  describe('weighted', () => {
    it('respects weight distribution over many picks', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.WEIGHTED });
      lb.addServer({ ...makeServer('a'), weight: 3 });
      lb.addServer({ ...makeServer('b'), weight: 1 });

      const counts: Record<string, number> = { a: 0, b: 0 };
      for (let i = 0; i < 400; i++) {
        const s = lb.pick();
        if (s) counts[s.id] = (counts[s.id] ?? 0) + 1;
      }

      // a should get ~75%, b ~25% — allow generous tolerance
      expect(counts['a']!).toBeGreaterThan(counts['b']!);
    });
  });

  describe('sticky sessions', () => {
    it('returns same server for same key', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));
      lb.addServer(makeServer('c'));

      const first = lb.pickSticky('user-123');
      const second = lb.pickSticky('user-123');
      expect(first?.id).toBe(second?.id);
    });

    it('may return different servers for different keys', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      for (let i = 0; i < 10; i++) lb.addServer(makeServer(`s${i}`));

      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const s = lb.pickSticky(`user-${i}`);
        if (s) results.add(s.id);
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('server management', () => {
    it('removes a server by id', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));
      expect(lb.removeServer('a')).toBe(true);
      expect(lb.getServers().find((s) => s.id === 'a')).toBeUndefined();
    });

    it('auto-removes server after too many failures', () => {
      const lb = new LoadBalancer({
        strategy: LoadBalancerStrategy.ROUND_ROBIN,
        unhealthyRemoveThreshold: 3,
      });
      lb.addServer(makeServer('a'));
      lb.setHealth('a', false);
      lb.setHealth('a', false);
      lb.setHealth('a', false);
      expect(lb.getServers().find((s) => s.id === 'a')).toBeUndefined();
    });

    it('resets failure count on healthy check', () => {
      const lb = new LoadBalancer({
        strategy: LoadBalancerStrategy.ROUND_ROBIN,
        unhealthyRemoveThreshold: 3,
      });
      lb.addServer(makeServer('a'));
      lb.setHealth('a', false);
      lb.setHealth('a', false);
      lb.setHealth('a', true); // reset
      lb.setHealth('a', false);
      lb.setHealth('a', false);
      // Only 2 consecutive failures after reset — should still be present
      expect(lb.getServers().find((s) => s.id === 'a')).toBeDefined();
    });

    it('updates server weight', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.WEIGHTED });
      lb.addServer(makeServer('a'));
      lb.setWeight('a', 10);
      expect(lb.getServers().find((s) => s.id === 'a')?.weight).toBe(10);
    });

    it('changes strategy at runtime', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      lb.addServer(makeServer('a'));
      lb.setStrategy(LoadBalancerStrategy.RANDOM);
      expect(lb.pick()).not.toBeNull();
    });
  });

  describe('stats', () => {
    it('reports correct counts', () => {
      const lb = new LoadBalancer({ strategy: LoadBalancerStrategy.ROUND_ROBIN });
      lb.addServer(makeServer('a'));
      lb.addServer(makeServer('b'));
      lb.setHealth('b', false);
      const stats = lb.stats();
      expect(stats.total).toBe(2);
      expect(stats.healthy).toBe(1);
      expect(stats.unhealthy).toBe(1);
    });
  });
});
