import {
  defaultFieldResolver,
  GraphQLSchema,
  type GraphQLFieldResolver,
} from "graphql";
import { mapSchema, getDirective, MapperKind } from "@graphql-tools/utils";
import { requireAuth, requireRole, type GraphQLContext } from "../context.js";

// ─── @auth Directive ──────────────────────────────────────────────────────────

/**
 * Wraps any field annotated with @auth to enforce authentication.
 * If the current user is not authenticated, a NexusError.unauthorized is thrown.
 */
export function applyAuthDirective(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD](fieldConfig) {
      const authDirective = getDirective(schema, fieldConfig, "auth")?.[0];
      if (!authDirective) return fieldConfig;

      const { resolve = defaultFieldResolver } = fieldConfig;

      return {
        ...fieldConfig,
        resolve: async (
          source: unknown,
          args: Record<string, unknown>,
          context: GraphQLContext,
          info,
        ) => {
          requireAuth(context);
          return (resolve as GraphQLFieldResolver<unknown, GraphQLContext>)(
            source,
            args,
            context,
            info,
          );
        },
      };
    },
  });
}

// ─── @requireRole Directive ───────────────────────────────────────────────────

type RoleValue = "admin" | "editor" | "viewer";

/**
 * Wraps any field annotated with @requireRole(role: UserRole!) to enforce
 * a minimum role level. Roles are ordered: viewer < editor < admin.
 */
export function applyRequireRoleDirective(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD](fieldConfig) {
      const directive = getDirective(
        schema,
        fieldConfig,
        "requireRole",
      )?.[0] as { role?: RoleValue } | undefined;

      if (!directive?.role) return fieldConfig;

      const requiredRole = directive.role;
      const { resolve = defaultFieldResolver } = fieldConfig;

      return {
        ...fieldConfig,
        resolve: async (
          source: unknown,
          args: Record<string, unknown>,
          context: GraphQLContext,
          info,
        ) => {
          requireRole(context, requiredRole);
          return (resolve as GraphQLFieldResolver<unknown, GraphQLContext>)(
            source,
            args,
            context,
            info,
          );
        },
      };
    },
  });
}

// ─── Combined Application ─────────────────────────────────────────────────────

export function applyDirectives(schema: GraphQLSchema): GraphQLSchema {
  let s = applyAuthDirective(schema);
  s = applyRequireRoleDirective(s);
  return s;
}
