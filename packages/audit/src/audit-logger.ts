/**
 * AuditLogger - core logging class with buffering, redaction, and context propagation
 */

import { randomUUID } from "crypto";
import type {
  AuditAction,
  AuditActor,
  AuditDiff,
  AuditEntry,
  AuditResource,
  AuditStore,
} from "./types.js";

export interface AuditLoggerOptions {
  store: AuditStore;
  /** Flush buffer after this many entries */
  bufferSize?: number;
  /** Flush buffer after this many milliseconds */
  flushIntervalMs?: number;
  /** Field names whose values should be redacted */
  sensitiveFields?: string[];
  /** Retention period in days (informational, enforced by store) */
  retentionDays?: number;
  /** Called when a flush error occurs */
  onError?: (err: unknown) => void;
}

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

export interface LogEventOptions {
  metadata?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  outcome?: AuditEntry["outcome"];
  errorMessage?: string;
  context?: LogContext;
}

// Middleware hook types for integration
export type AuditMiddlewareHook = (entry: AuditEntry) => AuditEntry | Promise<AuditEntry>;

const REDACT_PLACEHOLDER = "[REDACTED]";

const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
  "creditCard",
  "credit_card",
  "ssn",
  "privateKey",
  "private_key",
];

export class AuditLogger {
  private readonly store: AuditStore;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;
  private readonly sensitiveFields: Set<string>;
  private readonly onError: (err: unknown) => void;
  private buffer: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private middlewareHooks: AuditMiddlewareHook[] = [];
  private globalContext: LogContext = {};

  constructor(options: AuditLoggerOptions) {
    this.store = options.store;
    this.bufferSize = options.bufferSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.sensitiveFields = new Set([
      ...DEFAULT_SENSITIVE_FIELDS,
      ...(options.sensitiveFields ?? []),
    ]);
    this.onError = options.onError ?? ((err) => console.error("[AuditLogger] flush error:", err));
    this.startFlushInterval();
  }

  /** Set global context applied to all subsequent log calls */
  setContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /** Clear global context */
  clearContext(): void {
    this.globalContext = {};
  }

  /** Add a middleware hook applied before each entry is stored */
  use(hook: AuditMiddlewareHook): void {
    this.middlewareHooks.push(hook);
  }

  /** Log an audit event */
  async log(
    action: AuditAction,
    actor: AuditActor,
    resource: AuditResource,
    options: LogEventOptions = {}
  ): Promise<void> {
    const context = { ...this.globalContext, ...options.context };
    const diff = this.buildDiff(options.oldValue, options.newValue);
    const metadata = this.redactMetadata(options.metadata ?? {});

    let entry: AuditEntry = {
      id: randomUUID(),
      action,
      actor,
      resource,
      timestamp: new Date(),
      metadata,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      sessionId: context.sessionId,
      diff: diff.length > 0 ? diff : undefined,
      outcome: options.outcome ?? "success",
      errorMessage: options.errorMessage,
    };

    // Run middleware hooks
    for (const hook of this.middlewareHooks) {
      entry = await hook(entry);
    }

    this.buffer.push(entry);

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /** Log a successful event (convenience) */
  async success(
    action: AuditAction,
    actor: AuditActor,
    resource: AuditResource,
    options: Omit<LogEventOptions, "outcome"> = {}
  ): Promise<void> {
    return this.log(action, actor, resource, { ...options, outcome: "success" });
  }

  /** Log a failed event (convenience) */
  async failure(
    action: AuditAction,
    actor: AuditActor,
    resource: AuditResource,
    errorMessage: string,
    options: Omit<LogEventOptions, "outcome" | "errorMessage"> = {}
  ): Promise<void> {
    return this.log(action, actor, resource, { ...options, outcome: "failure", errorMessage });
  }

  /** Get a human-readable description of an action */
  static describeAction(entry: AuditEntry): string {
    const actorName = entry.actor.name ?? entry.actor.email ?? entry.actor.id;
    const resourceName = entry.resource.name ?? entry.resource.id;
    const resourceType = entry.resource.type;

    const actionDescriptions: Record<string, string> = {
      create: `${actorName} created ${resourceType} '${resourceName}'`,
      read: `${actorName} read ${resourceType} '${resourceName}'`,
      update: `${actorName} updated ${resourceType} '${resourceName}'`,
      delete: `${actorName} deleted ${resourceType} '${resourceName}'`,
      login: `${actorName} logged in`,
      logout: `${actorName} logged out`,
      export: `${actorName} exported ${resourceType} '${resourceName}'`,
      import: `${actorName} imported ${resourceType} '${resourceName}'`,
      share: `${actorName} shared ${resourceType} '${resourceName}'`,
      permission_change: `${actorName} changed permissions on ${resourceType} '${resourceName}'`,
    };

    const description = actionDescriptions[entry.action];
    if (!description) {
      return `${actorName} performed ${entry.action} on ${resourceType} '${resourceName}'`;
    }

    if (entry.outcome === "failure") {
      return `${description} (FAILED: ${entry.errorMessage ?? "unknown error"})`;
    }

    return description;
  }

  /** Generate a diff between old and new values */
  private buildDiff(
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): AuditDiff[] {
    if (!oldValue && !newValue) return [];

    const diff: AuditDiff[] = [];
    const allKeys = new Set([
      ...Object.keys(oldValue ?? {}),
      ...Object.keys(newValue ?? {}),
    ]);

    for (const key of allKeys) {
      const old = oldValue?.[key];
      const next = newValue?.[key];

      if (JSON.stringify(old) !== JSON.stringify(next)) {
        diff.push({
          field: key,
          oldValue: this.isSensitiveField(key) ? REDACT_PLACEHOLDER : old,
          newValue: this.isSensitiveField(key) ? REDACT_PLACEHOLDER : next,
        });
      }
    }

    return diff;
  }

  /** Redact sensitive fields from metadata */
  private redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (this.isSensitiveField(key)) {
        result[key] = REDACT_PLACEHOLDER;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = this.redactMetadata(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private isSensitiveField(field: string): boolean {
    const lowerField = field.toLowerCase();
    for (const sensitive of this.sensitiveFields) {
      if (lowerField.includes(sensitive.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /** Flush buffered entries to store */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toFlush = this.buffer.splice(0, this.buffer.length);

    try {
      for (const entry of toFlush) {
        await this.store.append(entry);
      }
    } catch (err) {
      this.onError(err);
      // Re-add failed entries to front of buffer
      this.buffer.unshift(...toFlush);
    }
  }

  /** Start the periodic flush interval */
  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  /** Stop the flush interval and flush remaining entries */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
