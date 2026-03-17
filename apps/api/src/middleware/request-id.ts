import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Middleware that assigns a unique request ID to every incoming request.
 * The ID is read from the incoming X-Request-Id header when present (e.g.
 * forwarded by a load balancer), otherwise a new UUID v4 is generated.
 * The ID is stored in the Hono context as "requestId" and echoed back in
 * the X-Request-Id response header.
 */
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const id = c.req.header(REQUEST_ID_HEADER) ?? randomUUID();

    // Make it available to downstream handlers via c.get("requestId")
    c.set("requestId" as never, id as never);

    // Attach to response
    c.header(REQUEST_ID_HEADER, id);

    await next();
  };
}
