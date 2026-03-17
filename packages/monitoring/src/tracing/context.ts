// TraceContext: manages async context propagation for distributed tracing
import { AsyncLocalStorage } from "node:async_hooks";
import type { SpanContext } from "../types.js";
import { Span } from "./span.js";

interface ContextValue {
  span: Span | null;
  baggage: Map<string, string>;
  traceId?: string;
}

const TRACE_FLAG_SAMPLED = 0x01;

/**
 * W3C TraceContext header format:
 * traceparent: 00-<traceId>-<spanId>-<flags>
 * tracestate:  vendor=value,...
 */
export interface PropagationHeaders {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export class TraceContext {
  private static readonly storage = new AsyncLocalStorage<ContextValue>();

  // ─── Current span access ──────────────────────────────────────────────────

  /**
   * Get the currently active span in this async context, or null if none.
   */
  static getCurrentSpan(): Span | null {
    return TraceContext.storage.getStore()?.span ?? null;
  }

  /**
   * Set the active span in the current async context.
   * Returns a cleanup function to restore the previous span.
   */
  static setCurrentSpan(span: Span | null): () => void {
    const store = TraceContext.storage.getStore();
    if (store) {
      const previous = store.span;
      store.span = span;
      return () => { store.span = previous; };
    }
    // No store exists — nothing to restore
    return () => {};
  }

  // ─── Context lifecycle ────────────────────────────────────────────────────

  /**
   * Run a function within a new context where the given span is active.
   * The span is automatically ended when the function completes (if not already ended).
   */
  static runWithSpan<T>(span: Span, fn: () => T): T {
    const store: ContextValue = {
      span,
      baggage: new Map(TraceContext.storage.getStore()?.baggage ?? []),
    };
    return TraceContext.storage.run(store, fn);
  }

  /**
   * Run an async function within a context where the given span is active.
   */
  static async runWithSpanAsync<T>(span: Span, fn: () => Promise<T>): Promise<T> {
    const store: ContextValue = {
      span,
      baggage: new Map(TraceContext.storage.getStore()?.baggage ?? []),
    };
    return TraceContext.storage.run(store, fn);
  }

  /**
   * Fork the current context for a parallel branch of execution.
   * The forked context shares baggage but not the active span.
   */
  static fork(span?: Span): ContextValue {
    const current = TraceContext.storage.getStore();
    return {
      span: span ?? null,
      baggage: new Map(current?.baggage ?? []),
      traceId: current?.traceId,
    };
  }

  /**
   * Run a function in an explicitly provided context snapshot.
   */
  static runInContext<T>(ctx: ContextValue, fn: () => T): T {
    return TraceContext.storage.run(ctx, fn);
  }

  // ─── Baggage ─────────────────────────────────────────────────────────────

  /**
   * Set a baggage key-value in the current context (propagates downstream).
   */
  static setBaggage(key: string, value: string): void {
    const store = TraceContext.storage.getStore();
    if (store) {
      store.baggage.set(key, value);
    }
  }

  /**
   * Get a baggage value from the current context.
   */
  static getBaggage(key: string): string | undefined {
    return TraceContext.storage.getStore()?.baggage.get(key);
  }

  /**
   * Get all baggage entries from the current context.
   */
  static getAllBaggage(): Record<string, string> {
    const baggage = TraceContext.storage.getStore()?.baggage;
    if (!baggage) return {};
    return Object.fromEntries(baggage);
  }

  // ─── Context serialization ────────────────────────────────────────────────

  /**
   * Serialize the current context to W3C Trace Context propagation headers.
   */
  static inject(): PropagationHeaders {
    const store = TraceContext.storage.getStore();
    if (!store?.span) return {};

    const ctx = store.span.spanContext;
    const flags = TRACE_FLAG_SAMPLED.toString(16).padStart(2, "0");
    const traceparent = `00-${ctx.traceId}-${ctx.spanId}-${flags}`;

    const headers: PropagationHeaders = { traceparent };

    if (store.baggage.size > 0) {
      headers.baggage = [...store.baggage.entries()]
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join(",");
    }

    return headers;
  }

  /**
   * Deserialize propagation headers into a SpanContext.
   * Returns null if the headers are missing or malformed.
   */
  static extract(headers: PropagationHeaders): SpanContext | null {
    const traceparent = headers.traceparent;
    if (!traceparent) return null;

    const parts = traceparent.split("-");
    if (parts.length < 4) return null;

    const [version, traceId, spanId, flagsHex] = parts;
    if (version !== "00") return null;
    if (!traceId || traceId.length !== 32) return null;
    if (!spanId || spanId.length !== 16) return null;

    const traceFlags = parseInt(flagsHex ?? "00", 16);

    return {
      traceId,
      spanId,
      traceFlags,
      isRemote: true,
    };
  }

  /**
   * Extract baggage from a baggage header string.
   */
  static extractBaggage(baggageHeader: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const entry of baggageHeader.split(",")) {
      const [k, v] = entry.split("=");
      if (k && v) {
        try {
          result[decodeURIComponent(k.trim())] = decodeURIComponent(v.trim());
        } catch {
          // Skip malformed entries
        }
      }
    }
    return result;
  }

  /**
   * Get the current context snapshot (useful for passing to worker threads).
   */
  static snapshot(): ContextValue | null {
    const store = TraceContext.storage.getStore();
    if (!store) return null;
    return {
      span: store.span,
      baggage: new Map(store.baggage),
      traceId: store.traceId,
    };
  }

  /**
   * Check if there is an active context in the current async execution.
   */
  static isActive(): boolean {
    return TraceContext.storage.getStore() !== undefined;
  }
}

export type { ContextValue };
