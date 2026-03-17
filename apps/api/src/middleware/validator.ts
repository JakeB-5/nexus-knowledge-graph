import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { NexusError } from "@nexus/shared";

type ValidationTarget = "json" | "query" | "param";

/**
 * Zod validation middleware for Hono.
 */
export function zValidator<T extends z.ZodTypeAny>(
  target: ValidationTarget,
  schema: T,
): MiddlewareHandler {
  return async (c: Context, next) => {
    let data: unknown;

    switch (target) {
      case "json":
        data = await c.req.json();
        break;
      case "query": {
        const url = new URL(c.req.url);
        data = Object.fromEntries(url.searchParams.entries());
        break;
      }
      case "param":
        data = c.req.param();
        break;
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw NexusError.validation("Validation failed", {
        errors: result.error.flatten().fieldErrors,
      });
    }

    // Store validated data for retrieval via c.req.valid()
    c.set("validatedData" as never, result.data as never);

    await next();
  };
}
