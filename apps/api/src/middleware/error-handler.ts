import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { NexusError, ErrorCode } from "@nexus/shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface ErrorResponse {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
  requestId?: string;
}

// ── Zod error formatting ───────────────────────────────────────────────────

function formatZodError(err: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_root";
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path]!.push(issue.message);
  }
  return fieldErrors;
}

// ── Main error handler ─────────────────────────────────────────────────────

/**
 * Global Hono error handler. Register with app.onError().
 *
 * Handles:
 *   - NexusError   → structured domain error response
 *   - ZodError     → 400 validation response with field details
 *   - Everything else → 500, with full detail in dev, minimal in prod
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const isDev = (process.env["NODE_ENV"] ?? "development") !== "production";
  const requestId = c.get("requestId" as never) as string | undefined;

  // ── NexusError ──
  if (err instanceof NexusError) {
    const body: ErrorResponse = {
      ...err.toJSON(),
      ...(requestId && { requestId }),
    };
    return c.json(body, err.statusCode as Parameters<typeof c.json>[1]);
  }

  // ── Zod validation error ──
  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      code: ErrorCode.VALIDATION_ERROR,
      message: "Validation failed",
      statusCode: 400,
      details: formatZodError(err),
      ...(requestId && { requestId }),
    };
    return c.json(body, 400);
  }

  // ── Unhandled error ──
  // Always log with full detail server-side
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    requestId,
    method: c.req.method,
    path: c.req.path,
    timestamp: new Date().toISOString(),
  };
  console.error("[unhandled-error]", JSON.stringify(errorInfo));

  const body: ErrorResponse = {
    code: ErrorCode.INTERNAL_ERROR,
    message: isDev ? err.message : "Internal server error",
    statusCode: 500,
    ...(isDev && { details: { stack: err.stack } }),
    ...(requestId && { requestId }),
  };

  return c.json(body, 500);
};

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(c: Parameters<ErrorHandler>[1]) {
  const requestId = c.get("requestId" as never) as string | undefined;
  return c.json(
    {
      code: ErrorCode.NOT_FOUND,
      message: `Route not found: ${c.req.method} ${c.req.path}`,
      statusCode: 404,
      ...(requestId && { requestId }),
    } satisfies ErrorResponse,
    404,
  );
}
