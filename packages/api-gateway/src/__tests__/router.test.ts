import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../router.js';
import type { MiddlewareContext, MiddlewareFn } from '../types.js';

function makeCtx(path: string, method: string): MiddlewareContext {
  return {
    request: { method, path, headers: {}, body: undefined },
    params: {},
    query: {},
    metadata: {},
  };
}

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('addRoute / match', () => {
    it('matches a static path', () => {
      router.get('/api/nodes', 'http://nodes-service', [], 'list-nodes');
      const result = router.match('/api/nodes', 'GET');
      expect(result).not.toBeNull();
      expect(result?.route.target).toBe('http://nodes-service');
    });

    it('extracts path parameters', () => {
      router.get('/api/nodes/:id', 'http://nodes-service');
      const result = router.match('/api/nodes/abc-123', 'GET');
      expect(result).not.toBeNull();
      expect(result?.params).toEqual({ id: 'abc-123' });
    });

    it('extracts multiple path parameters', () => {
      router.get('/api/:version/nodes/:id', 'http://nodes-service');
      const result = router.match('/api/v2/nodes/xyz', 'GET');
      expect(result?.params).toEqual({ version: 'v2', id: 'xyz' });
    });

    it('returns null for unmatched path', () => {
      router.get('/api/nodes', 'http://nodes-service');
      expect(router.match('/api/edges', 'GET')).toBeNull();
    });

    it('is case-insensitive for method', () => {
      router.get('/api/nodes', 'http://nodes-service');
      expect(router.match('/api/nodes', 'get')).not.toBeNull();
    });

    it('does not match wrong method', () => {
      router.get('/api/nodes', 'http://nodes-service');
      expect(router.match('/api/nodes', 'POST')).toBeNull();
    });

    it('matches wildcard method route', () => {
      router.addRoute({ path: '/health', method: '*', target: 'http://health', middleware: [] });
      expect(router.match('/health', 'GET')).not.toBeNull();
      expect(router.match('/health', 'POST')).not.toBeNull();
    });

    it('matches wildcard path', () => {
      router.addWildcard('http://fallback');
      expect(router.match('/anything/here', 'GET')).not.toBeNull();
    });

    it('URL-decodes path parameters', () => {
      router.get('/api/nodes/:id', 'http://nodes-service');
      const result = router.match('/api/nodes/hello%20world', 'GET');
      expect(result?.params['id']).toBe('hello world');
    });
  });

  describe('route priority', () => {
    it('prefers higher-priority routes', () => {
      router.addRoute({
        path: '/api/nodes/:id',
        method: 'GET',
        target: 'http://generic',
        middleware: [],
        priority: 0,
      });
      router.addRoute({
        path: '/api/nodes/special',
        method: 'GET',
        target: 'http://special',
        middleware: [],
        priority: 10,
      });
      const result = router.match('/api/nodes/special', 'GET');
      expect(result?.route.target).toBe('http://special');
    });
  });

  describe('named routes', () => {
    it('generates URL from named route', () => {
      router.get('/api/nodes/:id', 'http://nodes-service', [], 'node-detail');
      const url = router.generateUrl('node-detail', { id: '42' });
      expect(url).toBe('/api/nodes/42');
    });

    it('throws for unknown named route', () => {
      expect(() => router.generateUrl('nonexistent')).toThrow();
    });

    it('throws when named route has unfilled params', () => {
      router.get('/api/nodes/:id', 'http://nodes-service', [], 'node-detail');
      expect(() => router.generateUrl('node-detail', {})).toThrow();
    });

    it('throws on duplicate route names', () => {
      router.get('/api/nodes', 'http://a', [], 'nodes');
      expect(() => router.get('/api/other', 'http://b', [], 'nodes')).toThrow();
    });

    it('removes a named route', () => {
      router.get('/api/nodes', 'http://a', [], 'nodes');
      expect(router.removeRoute('nodes')).toBe(true);
      expect(router.match('/api/nodes', 'GET')).toBeNull();
    });
  });

  describe('route groups', () => {
    it('prepends group prefix to all routes', () => {
      const sharedMiddleware: MiddlewareFn = async (_ctx, next) => next();
      router.addGroup({
        prefix: '/api/v1',
        middleware: [sharedMiddleware],
        routes: [
          { path: '/nodes', method: 'GET', target: 'http://nodes', middleware: [] },
          { path: '/edges', method: 'GET', target: 'http://edges', middleware: [] },
        ],
      });

      expect(router.match('/api/v1/nodes', 'GET')).not.toBeNull();
      expect(router.match('/api/v1/edges', 'GET')).not.toBeNull();
    });
  });

  describe('middleware chain', () => {
    it('executes middleware in order', async () => {
      const order: number[] = [];
      const m1: MiddlewareFn = async (_ctx, next) => { order.push(1); await next(); };
      const m2: MiddlewareFn = async (_ctx, next) => { order.push(2); await next(); };
      const m3: MiddlewareFn = async (_ctx, next) => { order.push(3); await next(); };

      router.use(m1);
      router.get('/api/nodes', 'http://nodes-service', [m2, m3]);

      const matchResult = router.match('/api/nodes', 'GET')!;
      const ctx = makeCtx('/api/nodes', 'GET');
      ctx.params = matchResult.params;

      await router.execute(ctx, matchResult.route);
      expect(order).toEqual([1, 2, 3]);
    });

    it('stops chain if next is not called', async () => {
      const order: number[] = [];
      const m1: MiddlewareFn = async (_ctx, _next) => { order.push(1); };
      const m2: MiddlewareFn = async (_ctx, next) => { order.push(2); await next(); };

      router.get('/api/nodes', 'http://nodes-service', [m1, m2]);
      const matchResult = router.match('/api/nodes', 'GET')!;
      const ctx = makeCtx('/api/nodes', 'GET');

      await router.execute(ctx, matchResult.route);
      expect(order).toEqual([1]);
    });
  });

  describe('validation', () => {
    it('throws for missing path', () => {
      expect(() =>
        router.addRoute({ path: '', method: 'GET', target: 'http://a', middleware: [] })
      ).toThrow();
    });

    it('throws for invalid method', () => {
      expect(() =>
        // @ts-expect-error testing invalid method
        router.addRoute({ path: '/x', method: 'INVALID', target: 'http://a', middleware: [] })
      ).toThrow();
    });

    it('throws for missing target', () => {
      expect(() =>
        router.addRoute({ path: '/x', method: 'GET', target: '', middleware: [] })
      ).toThrow();
    });
  });

  describe('getRoutes / clear', () => {
    it('returns all registered routes', () => {
      router.get('/a', 'http://a');
      router.post('/b', 'http://b');
      expect(router.getRoutes()).toHaveLength(2);
    });

    it('clears all routes', () => {
      router.get('/a', 'http://a');
      router.clear();
      expect(router.getRoutes()).toHaveLength(0);
      expect(router.match('/a', 'GET')).toBeNull();
    });
  });
});
