// RequestTransformer: headers, query params, body, size limits, API versioning

import type { TransformRule, VersioningConfig } from './types.js';

export interface RequestTransformOptions {
  maxBodySize?: number;      // bytes
  versioning?: VersioningConfig;
  transformRules?: TransformRule[];
}

export interface IncomingRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  rawBody?: Buffer;
}

export interface TransformedRequest extends IncomingRequest {
  version?: string;
  bodySize?: number;
}

export class RequestTransformer {
  private headerRules: TransformRule[] = [];
  private queryRules: TransformRule[] = [];
  private versioning?: VersioningConfig;
  private maxBodySize?: number;

  constructor(options: RequestTransformOptions = {}) {
    this.maxBodySize = options.maxBodySize;
    this.versioning = options.versioning;

    for (const rule of options.transformRules ?? []) {
      if (rule.key.startsWith('query:')) {
        this.queryRules.push({ ...rule, key: rule.key.slice(6) });
      } else {
        this.headerRules.push(rule);
      }
    }
  }

  /**
   * Transform an incoming request: apply all rules and extract version.
   */
  transform(req: IncomingRequest): TransformedRequest {
    const result: TransformedRequest = {
      ...req,
      headers: { ...req.headers },
      query: { ...req.query },
    };

    // Enforce body size limit
    if (this.maxBodySize !== undefined && req.rawBody) {
      result.bodySize = req.rawBody.byteLength;
      if (req.rawBody.byteLength > this.maxBodySize) {
        throw new RequestTooLargeError(req.rawBody.byteLength, this.maxBodySize);
      }
    }

    // Apply header transform rules
    result.headers = this.applyRules(result.headers, this.headerRules);

    // Apply query transform rules
    result.query = this.applyRules(result.query, this.queryRules);

    // Extract API version
    if (this.versioning) {
      result.version = this.extractVersion(result);
    }

    return result;
  }

  /**
   * Add a rule to add/remove/rename/rewrite a header.
   */
  addHeaderRule(rule: TransformRule): void {
    this.headerRules.push(rule);
  }

  /**
   * Add a rule to transform a query parameter.
   */
  addQueryRule(rule: TransformRule): void {
    this.queryRules.push(rule);
  }

  /**
   * Perform JSON body transformation using a mapping function.
   */
  transformBody<T = unknown, U = unknown>(
    req: IncomingRequest,
    transformFn: (body: T) => U
  ): IncomingRequest {
    if (!req.body) return req;
    return { ...req, body: transformFn(req.body as T) };
  }

  /**
   * Negotiate content type from Accept header.
   */
  negotiateContentType(
    acceptHeader: string,
    supported: string[]
  ): string | null {
    const accepted = acceptHeader
      .split(',')
      .map((part) => {
        const [type, q] = part.trim().split(';q=');
        return { type: (type ?? '').trim(), q: parseFloat(q ?? '1') };
      })
      .sort((a, b) => b.q - a.q);

    for (const { type } of accepted) {
      if (type === '*/*') return supported[0] ?? null;
      const match = supported.find(
        (s) => s === type || s.startsWith(type.replace('*', ''))
      );
      if (match) return match;
    }

    return null;
  }

  /**
   * Inject a standard X-Request-ID header if not present.
   */
  ensureRequestId(req: IncomingRequest): IncomingRequest {
    const headers = { ...req.headers };
    if (!headers['x-request-id']) {
      headers['x-request-id'] = generateRequestId();
    }
    return { ...req, headers };
  }

  // ── Internals ──────────────────────────────────────────────────

  private applyRules(
    map: Record<string, string>,
    rules: TransformRule[]
  ): Record<string, string> {
    const result = { ...map };

    for (const rule of rules) {
      switch (rule.type) {
        case 'add':
          if (rule.value !== undefined) result[rule.key] = rule.value;
          break;
        case 'remove':
          delete result[rule.key];
          break;
        case 'rename':
          if (rule.target && result[rule.key] !== undefined) {
            result[rule.target] = result[rule.key]!;
            delete result[rule.key];
          }
          break;
        case 'rewrite':
          if (rule.value !== undefined && result[rule.key] !== undefined) {
            result[rule.key] = result[rule.key]!.replace(
              new RegExp(rule.key),
              rule.value
            );
          }
          break;
      }
    }

    return result;
  }

  private extractVersion(req: TransformedRequest): string | undefined {
    if (!this.versioning) return undefined;

    switch (this.versioning.strategy) {
      case 'header': {
        const headerName = this.versioning.headerName ?? 'x-api-version';
        return req.headers[headerName] ?? this.versioning.defaultVersion;
      }
      case 'path': {
        const match = /\/v(\d+)/.exec(req.path);
        return match?.[1] ? `v${match[1]}` : this.versioning.defaultVersion;
      }
      case 'query': {
        const param = this.versioning.queryParam ?? 'version';
        return req.query[param] ?? this.versioning.defaultVersion;
      }
      default:
        return this.versioning.defaultVersion;
    }
  }
}

export class RequestTooLargeError extends Error {
  constructor(
    public readonly actual: number,
    public readonly limit: number
  ) {
    super(`Request body too large: ${actual} bytes exceeds limit of ${limit} bytes`);
    this.name = 'RequestTooLargeError';
  }
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
