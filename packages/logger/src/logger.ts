// Main Logger class with structured logging, child loggers, transports, and utilities

import {
  LogLevel,
  LOG_LEVEL_NAMES,
  type LogEntry,
  type LogTransport,
  type LogFormatter,
  type LoggerConfig,
  type RedactionConfig,
} from './types.js';
import { JsonFormatter } from './formatters/json.js';

type MessageFn = () => string;
type ContextValue = Record<string, unknown>;

export interface TimerResult {
  elapsed: number;
  stop: () => number;
}

export interface RequestContext {
  traceId: string;
  spanId: string;
  method?: string;
  path?: string;
  userId?: string;
}

const SENSITIVE_DEFAULTS = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];

function redactValue(value: unknown, fields: string[], replacement: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, fields, replacement));
  }
  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (fields.some((f) => k.toLowerCase().includes(f.toLowerCase()))) {
      result[k] = replacement;
    } else if (typeof v === 'object' && v !== null) {
      result[k] = redactValue(v, fields, replacement);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function mergeContext(
  base: ContextValue,
  extra: ContextValue,
  redaction?: RedactionConfig,
): ContextValue {
  const merged = { ...base, ...extra };
  if (!redaction) return merged;
  return redactValue(merged, redaction.fields, redaction.replacement) as ContextValue;
}

export class Logger {
  private readonly config: LoggerConfig;
  private readonly boundContext: ContextValue;
  private readonly redaction: RedactionConfig;
  private requestCtx: RequestContext | undefined;

  constructor(config: LoggerConfig) {
    this.config = {
      propagate: true,
      ...config,
    };
    this.boundContext = config.context ?? {};
    this.redaction = config.redaction ?? {
      fields: SENSITIVE_DEFAULTS,
      replacement: '[REDACTED]',
    };
  }

  // ── Level checks ──────────────────────────────────────────────────────────

  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  // ── Core log method ───────────────────────────────────────────────────────

  log(
    level: LogLevel,
    message: string | MessageFn,
    context: ContextValue = {},
    error?: Error,
  ): void {
    if (!this.isLevelEnabled(level)) return;

    const resolvedMessage = typeof message === 'function' ? message() : message;
    const mergedCtx = mergeContext(this.boundContext, context, this.redaction);

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: resolvedMessage,
      context: mergedCtx,
      error,
      service: this.config.service,
      version: this.config.version,
      traceId: this.requestCtx?.traceId,
      spanId: this.requestCtx?.spanId,
    };

    const formatted = this.config.formatter.format(entry);

    for (const transport of this.config.transports) {
      if (level >= transport.minLevel) {
        const result = transport.write(entry, formatted);
        // Fire-and-forget async transports; errors are swallowed to avoid cascading
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.error(`[Logger] Transport "${transport.name}" write error:`, err);
          });
        }
      }
    }
  }

  // ── Convenience methods ───────────────────────────────────────────────────

  trace(message: string | MessageFn, context?: ContextValue): void {
    this.log(LogLevel.Trace, message, context);
  }

  debug(message: string | MessageFn, context?: ContextValue): void {
    this.log(LogLevel.Debug, message, context);
  }

  info(message: string | MessageFn, context?: ContextValue): void {
    this.log(LogLevel.Info, message, context);
  }

  warn(message: string | MessageFn, context?: ContextValue, error?: Error): void {
    this.log(LogLevel.Warn, message, context, error);
  }

  error(message: string | MessageFn, error?: Error, context?: ContextValue): void {
    this.log(LogLevel.Error, message, context, error);
  }

  fatal(message: string | MessageFn, error?: Error, context?: ContextValue): void {
    this.log(LogLevel.Fatal, message, context, error);
  }

  // ── Child logger ──────────────────────────────────────────────────────────

  /**
   * Creates a child logger that inherits this logger's context and transports.
   * Additional context is merged on top of the parent's context.
   */
  child(name: string, context: ContextValue = {}): Logger {
    const childContext = { ...this.boundContext, ...context };
    return new Logger({
      ...this.config,
      name,
      context: childContext,
      // Child shares same transports and formatter unless overridden
    });
  }

  // ── Context binding ───────────────────────────────────────────────────────

  /** Returns a new logger with additional bound context fields */
  withContext(context: ContextValue): Logger {
    return this.child(this.config.name, context);
  }

  // ── Request context ───────────────────────────────────────────────────────

  setRequestContext(ctx: RequestContext): void {
    this.requestCtx = ctx;
  }

  clearRequestContext(): void {
    this.requestCtx = undefined;
  }

  getRequestContext(): RequestContext | undefined {
    return this.requestCtx;
  }

  // ── Timer utility ─────────────────────────────────────────────────────────

  /**
   * Starts a timer. Call the returned `stop()` function to log the elapsed time.
   */
  startTimer(label: string, context: ContextValue = {}): { stop: (extraCtx?: ContextValue) => number } {
    const start = performance.now();

    return {
      stop: (extraCtx: ContextValue = {}): number => {
        const elapsed = Math.round(performance.now() - start);
        this.info(`${label} completed`, {
          ...context,
          ...extraCtx,
          durationMs: elapsed,
        });
        return elapsed;
      },
    };
  }

  /**
   * Wraps an async function, logging start/end and duration.
   */
  async timed<T>(
    label: string,
    fn: () => Promise<T>,
    context: ContextValue = {},
  ): Promise<T> {
    this.debug(`${label} started`, context);
    const timer = this.startTimer(label, context);
    try {
      const result = await fn();
      timer.stop({ success: true });
      return result;
    } catch (err) {
      const elapsed = Math.round(performance.now());
      this.error(`${label} failed`, err instanceof Error ? err : new Error(String(err)), {
        ...context,
        durationMs: elapsed,
      });
      throw err;
    }
  }

  // ── Config accessors ──────────────────────────────────────────────────────

  get name(): string {
    return this.config.name;
  }

  get level(): LogLevel {
    return this.config.level;
  }

  get levelName(): string {
    return LOG_LEVEL_NAMES[this.config.level] ?? 'unknown';
  }

  // ── Transport management ──────────────────────────────────────────────────

  addTransport(transport: LogTransport): void {
    this.config.transports.push(transport);
  }

  removeTransport(name: string): boolean {
    const idx = this.config.transports.findIndex((t) => t.name === name);
    if (idx === -1) return false;
    this.config.transports.splice(idx, 1);
    return true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    await Promise.all(
      this.config.transports.map((t) => t.flush?.()),
    );
  }

  async close(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.config.transports.map((t) => t.close?.()),
    );
  }
}

// ── Factory helpers ──────────────────────────────────────────────────────────

export function createLogger(partial: Partial<LoggerConfig> & { name: string }): Logger {
  const formatter: LogFormatter = partial.formatter ?? new JsonFormatter();
  return new Logger({
    level: LogLevel.Info,
    transports: [],
    formatter,
    ...partial,
  });
}
