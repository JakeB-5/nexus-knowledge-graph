// ResponseTransformer: CORS, security headers, compression, envelope, pagination

export interface ResponseTransformOptions {
  corsOrigins?: string[];
  enableSecurityHeaders?: boolean;
  envelope?: boolean;
  envelopeKey?: string;
}

export interface OutgoingResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EnvelopedResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export class ResponseTransformer {
  private corsOrigins: string[];
  private securityHeaders: boolean;
  private envelopeEnabled: boolean;
  private envelopeKey: string;

  constructor(options: ResponseTransformOptions = {}) {
    this.corsOrigins = options.corsOrigins ?? ['*'];
    this.securityHeaders = options.enableSecurityHeaders ?? true;
    this.envelopeEnabled = options.envelope ?? false;
    this.envelopeKey = options.envelopeKey ?? 'data';
  }

  /**
   * Apply all configured transformations to an outgoing response.
   */
  transform(res: OutgoingResponse, origin?: string): OutgoingResponse {
    let result = { ...res, headers: { ...res.headers } };

    if (this.securityHeaders) {
      result = this.applySecurityHeaders(result);
    }

    result = this.applyCorsHeaders(result, origin);

    if (this.envelopeEnabled && result.statusCode < 400) {
      result = this.wrapInEnvelope(result);
    }

    return result;
  }

  /**
   * Add CORS headers based on allowed origins.
   */
  applyCorsHeaders(res: OutgoingResponse, origin?: string): OutgoingResponse {
    const headers = { ...res.headers };
    const allowedOrigin = this.resolveOrigin(origin);

    headers['access-control-allow-origin'] = allowedOrigin;
    headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    headers['access-control-allow-headers'] =
      'Content-Type, Authorization, X-Request-ID, X-API-Version';
    headers['access-control-max-age'] = '86400';

    if (allowedOrigin !== '*') {
      headers['vary'] = 'Origin';
    }

    return { ...res, headers };
  }

  /**
   * Add standard security headers (CSP, HSTS, etc.).
   */
  applySecurityHeaders(res: OutgoingResponse): OutgoingResponse {
    const headers = { ...res.headers };

    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['x-xss-protection'] = '1; mode=block';
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
    headers['referrer-policy'] = 'strict-origin-when-cross-origin';
    headers['permissions-policy'] = 'geolocation=(), microphone=(), camera=()';

    return { ...res, headers };
  }

  /**
   * Wrap the response body in a standard envelope.
   */
  wrapInEnvelope<T>(res: OutgoingResponse): OutgoingResponse {
    const envelope: EnvelopedResponse<T> = {
      success: res.statusCode < 400,
      timestamp: new Date().toISOString(),
    };

    if (res.statusCode < 400) {
      (envelope as Record<string, unknown>)[this.envelopeKey] = res.body;
    } else {
      envelope.error =
        typeof res.body === 'string'
          ? res.body
          : (res.body as { message?: string } | undefined)?.message ?? 'Internal Server Error';
    }

    return { ...res, body: envelope };
  }

  /**
   * Standardize error responses to a consistent shape.
   */
  standardizeError(
    statusCode: number,
    message: string,
    details?: unknown
  ): OutgoingResponse {
    const body: Record<string, unknown> = {
      success: false,
      error: {
        code: statusCode,
        message,
        timestamp: new Date().toISOString(),
      },
    };

    if (details !== undefined) {
      (body['error'] as Record<string, unknown>)['details'] = details;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (this.securityHeaders) {
      return this.applySecurityHeaders({ statusCode, headers, body });
    }

    return { statusCode, headers, body };
  }

  /**
   * Inject pagination headers into a response.
   */
  injectPaginationHeaders(
    res: OutgoingResponse,
    meta: PaginationMeta
  ): OutgoingResponse {
    const headers = { ...res.headers };

    headers['x-total-count'] = String(meta.total);
    headers['x-page'] = String(meta.page);
    headers['x-page-size'] = String(meta.pageSize);
    headers['x-total-pages'] = String(meta.totalPages);

    // Build Link header
    const links: string[] = [];
    if (meta.page > 1) {
      links.push(`<page=${meta.page - 1}>; rel="prev"`);
      links.push(`<page=1>; rel="first"`);
    }
    if (meta.page < meta.totalPages) {
      links.push(`<page=${meta.page + 1}>; rel="next"`);
      links.push(`<page=${meta.totalPages}>; rel="last"`);
    }

    if (links.length > 0) {
      headers['link'] = links.join(', ');
    }

    return { ...res, headers };
  }

  /**
   * Attempt gzip compression of response body (placeholder — real impl needs zlib).
   */
  compress(res: OutgoingResponse, acceptEncoding: string): OutgoingResponse {
    if (!acceptEncoding.includes('gzip')) return res;

    // Signal that we would compress; actual compression requires Node stream APIs
    const headers = { ...res.headers };
    headers['content-encoding'] = 'gzip';
    headers['vary'] = headers['vary'] ? `${headers['vary']}, Accept-Encoding` : 'Accept-Encoding';

    return { ...res, headers };
  }

  // ── Internals ──────────────────────────────────────────────────

  private resolveOrigin(requestOrigin?: string): string {
    if (this.corsOrigins.includes('*')) return '*';
    if (requestOrigin && this.corsOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    return this.corsOrigins[0] ?? '*';
  }
}
