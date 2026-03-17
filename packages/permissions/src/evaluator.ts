// PermissionEvaluator: combines RBAC, ACL, and policy engine

import { Permission, PermissionContext, EvaluationResult, AuditEntry, ResourceType } from "./types.js";
import { RBAC } from "./rbac.js";
import { ACL } from "./acl.js";
import { PolicyEngine } from "./policy-engine.js";

export interface EvaluatorOptions {
  rbac?: RBAC;
  acl?: ACL;
  policyEngine?: PolicyEngine;
  // Evaluation order: first match wins unless overrideOrder specified
  evaluationOrder?: Array<"rbac" | "acl" | "policy">;
  // Cache TTL in milliseconds (0 = no cache)
  cacheTtl?: number;
  auditLog?: boolean;
}

interface CacheEntry {
  result: EvaluationResult;
  expiresAt: number;
}

export class PermissionEvaluator {
  private rbac?: RBAC;
  private acl?: ACL;
  private policyEngine?: PolicyEngine;
  private evaluationOrder: Array<"rbac" | "acl" | "policy">;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtl: number;
  private auditLog: boolean;
  private auditEntries: AuditEntry[] = [];

  constructor(options: EvaluatorOptions = {}) {
    this.rbac = options.rbac;
    this.acl = options.acl;
    this.policyEngine = options.policyEngine;
    this.evaluationOrder = options.evaluationOrder ?? ["policy", "acl", "rbac"];
    this.cacheTtl = options.cacheTtl ?? 5000; // 5 second default
    this.auditLog = options.auditLog ?? true;
  }

  /**
   * Evaluate whether a subject has a permission on a resource.
   */
  evaluate(context: PermissionContext): EvaluationResult {
    const cacheKey = this.buildCacheKey(context);

    // Check cache
    if (this.cacheTtl > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
    }

    const result = this.doEvaluate(context);

    // Store in cache
    if (this.cacheTtl > 0) {
      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.cacheTtl,
      });
    }

    if (this.auditLog) {
      this.auditEntries.push(result.auditLog);
    }

    return result;
  }

  /**
   * Internal evaluation logic, runs through the configured order.
   */
  private doEvaluate(context: PermissionContext): EvaluationResult {
    const { subjectId, action, resourceId, resourceType } = context;

    for (const source of this.evaluationOrder) {
      switch (source) {
        case "policy": {
          if (!this.policyEngine) break;
          const policyResult = this.policyEngine.evaluate(context);
          // Policy engine always returns a decision (allow or deny)
          if (policyResult.effect !== "default") {
            return {
              granted: policyResult.granted,
              reason: policyResult.reason,
              source: "policy",
              matchedRule: policyResult.allowedBy?.id ?? policyResult.deniedBy?.id,
              auditLog: policyResult.auditEntry,
            };
          }
          break;
        }

        case "acl": {
          if (!this.acl) break;
          const aclResult = this.acl.check(subjectId, resourceId, action);
          // ACL returns a definitive result when an entry exists
          if (aclResult.source !== "none") {
            const auditEntry: AuditEntry = {
              timestamp: new Date(),
              subjectId,
              action,
              resourceId,
              resourceType,
              granted: aclResult.granted,
              source: "acl",
              reason: aclResult.reason,
            };
            return {
              granted: aclResult.granted,
              reason: aclResult.reason,
              source: "acl",
              auditLog: auditEntry,
            };
          }
          break;
        }

        case "rbac": {
          if (!this.rbac) break;
          const rbacGranted = this.rbac.hasPermission(subjectId, action);
          if (rbacGranted) {
            const role = this.rbac.getHighestRole(subjectId);
            const auditEntry: AuditEntry = {
              timestamp: new Date(),
              subjectId,
              action,
              resourceId,
              resourceType,
              granted: true,
              source: "rbac",
              reason: `RBAC role '${role ?? "unknown"}' grants ${action}`,
            };
            return {
              granted: true,
              reason: `RBAC role '${role ?? "unknown"}' grants ${action}`,
              source: "rbac",
              matchedRole: role ?? undefined,
              auditLog: auditEntry,
            };
          }
          break;
        }
      }
    }

    // Default deny
    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      subjectId,
      action,
      resourceId,
      resourceType,
      granted: false,
      source: "default",
      reason: "No policy, ACL entry, or RBAC role grants access",
    };

    return {
      granted: false,
      reason: "No policy, ACL entry, or RBAC role grants access",
      source: "default" as EvaluationResult["source"],
      auditLog: auditEntry,
    };
  }

  /**
   * Batch evaluate multiple contexts in one call.
   */
  evaluateBatch(contexts: PermissionContext[]): EvaluationResult[] {
    return contexts.map((ctx) => this.evaluate(ctx));
  }

  /**
   * Evaluate multiple permissions for one subject/resource pair.
   */
  evaluatePermissions(
    subjectId: string,
    resourceId: string,
    resourceType: ResourceType,
    permissions: Permission[],
    contextExtras?: Partial<PermissionContext>,
  ): Record<Permission, EvaluationResult> {
    const results = {} as Record<Permission, EvaluationResult>;

    for (const permission of permissions) {
      const context: PermissionContext = {
        subjectId,
        resourceId,
        resourceType,
        action: permission,
        ...contextExtras,
      };
      results[permission] = this.evaluate(context);
    }

    return results;
  }

  /**
   * Get a human-readable explanation of why access was or wasn't granted.
   */
  explain(context: PermissionContext): string {
    const result = this.evaluate(context);
    const { subjectId, action, resourceId } = context;

    const verdict = result.granted ? "GRANTED" : "DENIED";
    const lines = [
      `Access ${verdict} for subject '${subjectId}' to perform '${action}' on resource '${resourceId}'`,
      `  Source: ${result.source}`,
      `  Reason: ${result.reason}`,
    ];

    if (result.matchedRule) {
      lines.push(`  Matched rule: ${result.matchedRule}`);
    }
    if (result.matchedRole) {
      lines.push(`  Matched role: ${result.matchedRole}`);
    }

    return lines.join("\n");
  }

  /**
   * Build a cache key from context.
   */
  private buildCacheKey(context: PermissionContext): string {
    return [
      context.subjectId,
      context.action,
      context.resourceId,
      context.resourceType,
      JSON.stringify(context.environment ?? {}),
    ].join("|");
  }

  /**
   * Invalidate cache entries for a specific subject or resource.
   */
  invalidateCache(filter?: { subjectId?: string; resourceId?: string }): void {
    if (!filter) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      const parts = key.split("|");
      const [cachedSubjectId, , cachedResourceId] = parts;
      if (
        (filter.subjectId && cachedSubjectId === filter.subjectId) ||
        (filter.resourceId && cachedResourceId === filter.resourceId)
      ) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Prune expired cache entries.
   */
  pruneCache(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Get audit log entries.
   */
  getAuditLog(filter?: {
    subjectId?: string;
    resourceId?: string;
    action?: Permission;
    granted?: boolean;
    since?: Date;
  }): AuditEntry[] {
    let entries = [...this.auditEntries];
    if (!filter) return entries;

    if (filter.subjectId !== undefined) {
      entries = entries.filter((e) => e.subjectId === filter.subjectId);
    }
    if (filter.resourceId !== undefined) {
      entries = entries.filter((e) => e.resourceId === filter.resourceId);
    }
    if (filter.action !== undefined) {
      entries = entries.filter((e) => e.action === filter.action);
    }
    if (filter.granted !== undefined) {
      entries = entries.filter((e) => e.granted === filter.granted);
    }
    if (filter.since !== undefined) {
      entries = entries.filter((e) => e.timestamp >= filter.since!);
    }

    return entries;
  }

  /**
   * Clear audit entries.
   */
  clearAuditLog(): void {
    this.auditEntries = [];
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; ttl: number } {
    return { size: this.cache.size, ttl: this.cacheTtl };
  }
}
