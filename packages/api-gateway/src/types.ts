// Types for the API gateway package

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface Route {
  path: string;
  method: HttpMethod | '*';
  target: string;
  middleware: MiddlewareFn[];
  name?: string;
  priority?: number;
}

export interface RouteGroup {
  prefix: string;
  middleware: MiddlewareFn[];
  routes: Route[];
}

export interface GatewayConfig {
  port: number;
  host: string;
  routes: Route[];
  globalMiddleware?: MiddlewareFn[];
  timeout?: number;
  maxBodySize?: number;
  corsOrigins?: string[];
  trustProxy?: boolean;
}

export interface ProxyOptions {
  target: string;
  pathRewrite?: Record<string, string>;
  headers?: Record<string, string>;
  removeHeaders?: string[];
  timeout?: number;
  followRedirects?: boolean;
  secure?: boolean;
  changeOrigin?: boolean;
  onProxyReq?: (req: ProxyRequest) => void;
  onProxyRes?: (res: ProxyResponse) => void;
}

export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ProxyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

export enum LoadBalancerStrategy {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  LEAST_CONNECTIONS = 'least-connections',
  WEIGHTED = 'weighted',
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors?: string[];
}

export interface HealthCheckConfig {
  path: string;
  intervalMs: number;
  timeoutMs: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
  expectedStatus?: number;
  expectedBody?: string;
}

export interface ServerInstance {
  id: string;
  url: string;
  weight: number;
  connections: number;
  healthy: boolean;
  lastHealthCheck?: Date;
}

export interface CircuitBreakerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  stateChanges: number;
  lastStateChange?: Date;
  currentState: CircuitBreakerState;
}

export interface MiddlewareContext {
  request: ProxyRequest;
  response?: ProxyResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  metadata: Record<string, unknown>;
}

export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

export interface TransformRule {
  type: 'add' | 'remove' | 'rename' | 'rewrite';
  key: string;
  value?: string;
  target?: string;
}

export interface VersioningConfig {
  strategy: 'header' | 'path' | 'query';
  headerName?: string;
  queryParam?: string;
  defaultVersion?: string;
}
