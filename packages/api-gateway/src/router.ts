// Router: path pattern matching, middleware chains, route groups

import type {
  Route,
  RouteGroup,
  MiddlewareFn,
  MiddlewareContext,
  HttpMethod,
} from './types.js';

interface ParsedRoute {
  route: Route;
  pattern: RegExp;
  paramNames: string[];
}

interface MatchResult {
  route: Route;
  params: Record<string, string>;
}

/**
 * Convert a path pattern like /api/:version/nodes/:id to a RegExp
 * and extract parameter names.
 */
function parsePattern(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  // Escape special regex chars except : and *
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    })
    .replace(/\*/g, '(.*)');

  const pattern = new RegExp(`^${escaped}(?:/)?$`);
  return { pattern, paramNames };
}

export class Router {
  private parsedRoutes: ParsedRoute[] = [];
  private namedRoutes: Map<string, Route> = new Map();
  private globalMiddleware: MiddlewareFn[] = [];

  /**
   * Register a route with a specific HTTP method.
   */
  addRoute(route: Route): void {
    this.validateRoute(route);
    const { pattern, paramNames } = parsePattern(route.path);
    this.parsedRoutes.push({ route, pattern, paramNames });

    if (route.name) {
      if (this.namedRoutes.has(route.name)) {
        throw new Error(`Route name "${route.name}" is already registered`);
      }
      this.namedRoutes.set(route.name, route);
    }

    // Keep sorted by priority (higher first), then by specificity
    this.parsedRoutes.sort((a, b) => {
      const pa = a.route.priority ?? 0;
      const pb = b.route.priority ?? 0;
      if (pa !== pb) return pb - pa;
      // More specific paths (fewer params) sort first
      return a.paramNames.length - b.paramNames.length;
    });
  }

  /**
   * Register a wildcard catch-all route.
   */
  addWildcard(target: string, middleware: MiddlewareFn[] = []): void {
    this.addRoute({
      path: '*',
      method: '*',
      target,
      middleware,
      priority: -100,
    });
  }

  /**
   * Register a group of routes sharing a prefix and middleware.
   */
  addGroup(group: RouteGroup): void {
    for (const route of group.routes) {
      const fullPath = group.prefix.replace(/\/$/, '') + '/' + route.path.replace(/^\//, '');
      this.addRoute({
        ...route,
        path: fullPath,
        middleware: [...group.middleware, ...route.middleware],
      });
    }
  }

  /**
   * Add middleware that runs before all routes.
   */
  use(middleware: MiddlewareFn): void {
    this.globalMiddleware.push(middleware);
  }

  /**
   * Match a request path and method to a registered route.
   */
  match(path: string, method: string): MatchResult | null {
    const normalizedMethod = method.toUpperCase() as HttpMethod;

    for (const { route, pattern, paramNames } of this.parsedRoutes) {
      if (route.method !== '*' && route.method !== normalizedMethod) {
        continue;
      }

      const match = pattern.exec(path);
      if (!match) continue;

      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        const value = match[i + 1];
        if (value !== undefined) {
          params[name] = decodeURIComponent(value);
        }
      });

      return { route, params };
    }

    return null;
  }

  /**
   * Execute the middleware chain for a matched route.
   */
  async execute(ctx: MiddlewareContext, route: Route): Promise<void> {
    const chain: MiddlewareFn[] = [
      ...this.globalMiddleware,
      ...route.middleware,
    ];

    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= chain.length) return;
      const middleware = chain[index++];
      if (middleware) {
        await middleware(ctx, next);
      }
    };

    await next();
  }

  /**
   * Generate a URL for a named route with given parameters.
   */
  generateUrl(name: string, params: Record<string, string> = {}): string {
    const route = this.namedRoutes.get(name);
    if (!route) {
      throw new Error(`No route named "${name}"`);
    }

    let url = route.path;
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }

    // Check for unfilled params
    if (/:([a-zA-Z_][a-zA-Z0-9_]*)/.test(url)) {
      throw new Error(`Missing parameters in route "${name}": ${url}`);
    }

    return url;
  }

  /**
   * Return all registered routes for inspection.
   */
  getRoutes(): Route[] {
    return this.parsedRoutes.map((pr) => pr.route);
  }

  /**
   * Check whether a named route exists.
   */
  hasNamedRoute(name: string): boolean {
    return this.namedRoutes.has(name);
  }

  /**
   * Remove a route by name.
   */
  removeRoute(name: string): boolean {
    const route = this.namedRoutes.get(name);
    if (!route) return false;

    this.namedRoutes.delete(name);
    const idx = this.parsedRoutes.findIndex((pr) => pr.route === route);
    if (idx !== -1) {
      this.parsedRoutes.splice(idx, 1);
    }
    return true;
  }

  /**
   * Remove all registered routes.
   */
  clear(): void {
    this.parsedRoutes = [];
    this.namedRoutes.clear();
  }

  /**
   * Convenience methods for common HTTP verbs.
   */
  get(path: string, target: string, middleware: MiddlewareFn[] = [], name?: string): void {
    this.addRoute({ path, method: 'GET', target, middleware, name });
  }

  post(path: string, target: string, middleware: MiddlewareFn[] = [], name?: string): void {
    this.addRoute({ path, method: 'POST', target, middleware, name });
  }

  put(path: string, target: string, middleware: MiddlewareFn[] = [], name?: string): void {
    this.addRoute({ path, method: 'PUT', target, middleware, name });
  }

  patch(path: string, target: string, middleware: MiddlewareFn[] = [], name?: string): void {
    this.addRoute({ path, method: 'PATCH', target, middleware, name });
  }

  delete(path: string, target: string, middleware: MiddlewareFn[] = [], name?: string): void {
    this.addRoute({ path, method: 'DELETE', target, middleware, name });
  }

  /**
   * Validate a route definition before registering it.
   */
  private validateRoute(route: Route): void {
    if (!route.path) {
      throw new Error('Route path is required');
    }
    if (!route.target) {
      throw new Error('Route target is required');
    }
    if (!route.method) {
      throw new Error('Route method is required');
    }

    const validMethods = new Set<string>([
      'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', '*',
    ]);
    if (!validMethods.has(route.method)) {
      throw new Error(`Invalid HTTP method: ${route.method}`);
    }
  }
}
