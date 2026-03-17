import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { NexusError } from "@nexus/shared";

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * JWT authentication middleware.
 */
export function authMiddleware(secret?: string): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw NexusError.unauthorized("Missing or invalid Authorization header");
    }

    const token = authHeader.slice(7);
    const jwtSecret = secret ?? process.env["JWT_SECRET"];

    if (!jwtSecret) {
      throw new Error("JWT_SECRET not configured");
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(jwtSecret),
      );

      const authPayload: AuthPayload = {
        userId: payload["sub"] as string,
        email: payload["email"] as string,
        role: payload["role"] as string,
      };

      c.set("auth" as never, authPayload as never);
      await next();
    } catch {
      throw NexusError.unauthorized("Invalid or expired token");
    }
  };
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth" as never) as AuthPayload | undefined;
    if (!auth) {
      throw NexusError.unauthorized();
    }

    if (!roles.includes(auth.role)) {
      throw NexusError.forbidden(`Required role: ${roles.join(" or ")}`);
    }

    await next();
  };
}
