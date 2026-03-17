// ReverseProxy: forward requests to upstream services with transformation support

import type { ProxyOptions, ProxyRequest, ProxyResponse } from './types.js';

export interface ProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Buffer;
  duration: number;
}

export interface StreamProxyOptions {
  onData?: (chunk: Buffer) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

function rewritePath(path: string, rules: Record<string, string>): string {
  let result = path;
  for (const [pattern, replacement] of Object.entries(rules)) {
    result = result.replace(new RegExp(pattern), replacement);
  }
  return result;
}

function mergeHeaders(
  base: Record<string, string>,
  additions: Record<string, string>,
  removals: string[]
): Record<string, string> {
  const merged = { ...base, ...additions };
  for (const key of removals) {
    delete merged[key.toLowerCase()];
    delete merged[key];
  }
  return merged;
}

export class ReverseProxy {
  private options: ProxyOptions;

  constructor(options: ProxyOptions) {
    this.options = options;
  }

  /**
   * Forward a request to the upstream target and return the response.
   */
  async forward(req: ProxyRequest): Promise<ProxyResult> {
    const start = Date.now();

    // Build upstream URL
    let upstreamPath = req.path;
    if (this.options.pathRewrite) {
      upstreamPath = rewritePath(upstreamPath, this.options.pathRewrite);
    }

    const targetBase = this.options.target.replace(/\/$/, '');
    const url = `${targetBase}${upstreamPath}`;

    // Build headers
    let headers = mergeHeaders(
      req.headers,
      this.options.headers ?? {},
      this.options.removeHeaders ?? []
    );

    if (this.options.changeOrigin) {
      const targetUrl = new URL(this.options.target);
      headers = { ...headers, host: targetUrl.host };
    }

    // Apply request transform hook
    const transformedReq: ProxyRequest = { ...req, path: upstreamPath, headers };
    this.options.onProxyReq?.(transformedReq);

    const controller = new AbortController();
    const timeoutMs = this.options.timeout ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: headers as HeadersInit,
        signal: controller.signal,
        redirect: this.options.followRedirects ? 'follow' : 'manual',
      };

      if (req.body !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body =
          typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timer);

      // Collect response headers
      const resHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });

      const bodyText = await response.text();

      const proxyRes: ProxyResponse = {
        statusCode: response.status,
        headers: resHeaders,
        body: bodyText,
      };

      this.options.onProxyRes?.(proxyRes);

      return {
        statusCode: response.status,
        headers: resHeaders,
        body: bodyText,
        duration: Date.now() - start,
      };
    } catch (err) {
      clearTimeout(timer);
      const error = err as Error;

      if (error.name === 'AbortError') {
        return this.errorResponse(504, 'Gateway Timeout', start);
      }

      return this.errorResponse(502, 'Bad Gateway', start);
    }
  }

  /**
   * Forward a request and stream the response body chunk by chunk.
   */
  async forwardStream(req: ProxyRequest, streamOpts: StreamProxyOptions): Promise<number> {
    let upstreamPath = req.path;
    if (this.options.pathRewrite) {
      upstreamPath = rewritePath(upstreamPath, this.options.pathRewrite);
    }

    const targetBase = this.options.target.replace(/\/$/, '');
    const url = `${targetBase}${upstreamPath}`;

    let headers = mergeHeaders(
      req.headers,
      this.options.headers ?? {},
      this.options.removeHeaders ?? []
    );

    if (this.options.changeOrigin) {
      const targetUrl = new URL(this.options.target);
      headers = { ...headers, host: targetUrl.host };
    }

    const controller = new AbortController();
    const timeoutMs = this.options.timeout ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: req.method,
        headers: headers as HeadersInit,
        signal: controller.signal,
        body:
          req.body !== undefined && req.method !== 'GET'
            ? typeof req.body === 'string'
              ? req.body
              : JSON.stringify(req.body)
            : undefined,
      });

      clearTimeout(timer);

      if (!response.body) {
        streamOpts.onEnd?.();
        return response.status;
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          streamOpts.onData?.(Buffer.from(value));
        }
      }

      streamOpts.onEnd?.();
      return response.status;
    } catch (err) {
      clearTimeout(timer);
      streamOpts.onError?.(err as Error);
      return 502;
    }
  }

  /**
   * Add or update a header rule.
   */
  setHeader(key: string, value: string): void {
    this.options.headers = { ...this.options.headers, [key]: value };
  }

  /**
   * Remove a header from forwarded requests.
   */
  removeHeader(key: string): void {
    this.options.removeHeaders = [...(this.options.removeHeaders ?? []), key];
  }

  /**
   * Update the path rewrite rules.
   */
  setPathRewrite(rules: Record<string, string>): void {
    this.options.pathRewrite = { ...this.options.pathRewrite, ...rules };
  }

  /**
   * Map upstream error status codes to gateway error responses.
   */
  mapError(upstreamStatus: number): { status: number; message: string } {
    const mapping: Record<number, { status: number; message: string }> = {
      401: { status: 401, message: 'Unauthorized' },
      403: { status: 403, message: 'Forbidden' },
      404: { status: 404, message: 'Not Found' },
      429: { status: 429, message: 'Too Many Requests' },
      500: { status: 502, message: 'Bad Gateway' },
      503: { status: 503, message: 'Service Unavailable' },
    };
    return mapping[upstreamStatus] ?? { status: 502, message: 'Bad Gateway' };
  }

  private errorResponse(status: number, message: string, start: number): ProxyResult {
    return {
      statusCode: status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: message }),
      duration: Date.now() - start,
    };
  }
}
