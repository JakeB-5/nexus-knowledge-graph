import type { MiddlewareHandler } from "hono";

// ── Log levels ─────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── Sensitive headers to redact ────────────────────────────────────────────

const REDACTED = "[REDACTED]";
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

// ── Structured log entry ───────────────────────────────────────────────────

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  userAgent?: string;
  ip?: string;
  userId?: string;
  requestHeaders?: Record<string, string>;
  responseSize?: number;
  error?: unknown;
  [key: string]: unknown;
}

// ── Logger class ───────────────────────────────────────────────────────────

export class Logger {
  private readonly minLevel: number;
  private readonly pretty: boolean;

  constructor(
    minLevel: LogLevel = "info",
    pretty = process.env["NODE_ENV"] !== "production",
  ) {
    this.minLevel = LEVEL_RANK[minLevel];
    this.pretty = pretty;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= this.minLevel;
  }

  private write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    const output = this.pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (entry.level === "error" || entry.level === "warn") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    this.write({
      level,
      timestamp: new Date().toISOString(),
      message,
      ...meta,
    });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }
}

// Singleton instance
export const logger = new Logger(
  (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info",
);

// ── Hono middleware ────────────────────────────────────────────────────────

export interface LoggerMiddlewareOptions {
  /** Minimum log level to emit request logs (default: "info") */
  level?: LogLevel;
  /** Include request headers in log (default: false) */
  logRequestHeaders?: boolean;
  /** Paths to skip (e.g. ["/api/health"]) */
  skipPaths?: string[];
}

/**
 * Structured JSON request/response logger middleware.
 * Logs: method, path, status, duration, IP, userId, requestId.
 */
export function structuredLogger(options: LoggerMiddlewareOptions = {}): MiddlewareHandler {
  const { level = "info", logRequestHeaders = false, skipPaths = [] } = options;
  const skipSet = new Set(skipPaths);

  return async (c, next) => {
    if (skipSet.has(c.req.path)) {
      await next();
      return;
    }

    const start = Date.now();
    const requestId = c.get("requestId" as never) as string | undefined;
    const ip =
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      c.req.header("X-Real-IP") ??
      "unknown";

    const requestMeta: Record<string, unknown> = {
      requestId,
      method: c.req.method,
      path: c.req.path,
      ip,
      userAgent: c.req.header("User-Agent"),
    };

    if (logRequestHeaders) {
      const rawHeaders: Record<string, string> = {};
      c.req.raw.headers.forEach((v, k) => { rawHeaders[k] = v; });
      requestMeta["requestHeaders"] = redactHeaders(rawHeaders);
    }

    logger.debug("request received", requestMeta);

    try {
      await next();
    } catch (err) {
      const durationMs = Date.now() - start;
      logger.error("request error", {
        ...requestMeta,
        durationMs,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      });
      throw err;
    }

    const durationMs = Date.now() - start;
    const status = c.res.status;

    // Optionally get userId from auth context
    const auth = c.get("auth" as never) as { userId?: string } | undefined;

    const responseMeta: Record<string, unknown> = {
      ...requestMeta,
      status,
      durationMs,
      ...(auth?.userId && { userId: auth.userId }),
    };

    const responseSize = c.res.headers.get("Content-Length");
    if (responseSize) responseMeta["responseSize"] = Number(responseSize);

    if (status >= 500) {
      logger.error("request completed", responseMeta);
    } else if (status >= 400) {
      logger.warn("request completed", responseMeta);
    } else {
      logger[level]("request completed", responseMeta);
    }
  };
}
