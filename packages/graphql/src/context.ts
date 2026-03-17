import type { PgDatabase } from "drizzle-orm/pg-core";
import { createLoaders, type DataLoaders } from "./dataloaders.js";
import { NexusError } from "@nexus/shared";

type Db = PgDatabase<any, any, any>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
}

export interface GraphQLContext {
  db: Db;
  loaders: DataLoaders;
  currentUser: AuthenticatedUser | null;
  requestId: string;
  startTime: number;
}

export interface ContextCreationOptions {
  db: Db;
  getUser: (token: string) => Promise<AuthenticatedUser | null>;
  request: {
    headers: Record<string, string | string[] | undefined>;
  };
}

// ─── Token Extraction ─────────────────────────────────────────────────────────

function extractBearerToken(
  authHeader: string | string[] | undefined,
): string | null {
  if (!authHeader) return null;
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") return null;
  return parts[1] ?? null;
}

// ─── Context Factory ──────────────────────────────────────────────────────────

export async function createContext(
  opts: ContextCreationOptions,
): Promise<GraphQLContext> {
  const { db, getUser, request } = opts;

  const token = extractBearerToken(request.headers["authorization"]);
  let currentUser: AuthenticatedUser | null = null;

  if (token) {
    try {
      currentUser = await getUser(token);
    } catch {
      // Invalid token - currentUser stays null; resolvers enforce auth via @auth directive
    }
  }

  return {
    db,
    loaders: createLoaders(db),
    currentUser,
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
  };
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

export function requireAuth(ctx: GraphQLContext): AuthenticatedUser {
  if (!ctx.currentUser) {
    throw NexusError.unauthorized("Authentication required");
  }
  return ctx.currentUser;
}

export function requireRole(
  ctx: GraphQLContext,
  role: "admin" | "editor" | "viewer",
): AuthenticatedUser {
  const user = requireAuth(ctx);
  const hierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
  const userLevel = hierarchy[user.role] ?? 0;
  const requiredLevel = hierarchy[role] ?? 0;
  if (userLevel < requiredLevel) {
    throw NexusError.forbidden(
      `Role '${role}' required, but user has role '${user.role}'`,
    );
  }
  return user;
}
