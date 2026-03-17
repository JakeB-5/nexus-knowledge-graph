// Access Control List (ACL) implementation with per-resource entries

import { ACLEntry, Permission, ResourceType, Role } from "./types.js";
import { RBAC } from "./rbac.js";

export interface ACLCheckResult {
  granted: boolean;
  source: "acl" | "rbac" | "inherited" | "none";
  entry?: ACLEntry;
  reason: string;
}

export interface ACLOptions {
  rbac?: RBAC;
  // If true, check parent resource ACLs when no direct entry found
  inheritFromParent?: boolean;
}

export interface ResourceHierarchy {
  resourceId: string;
  parentId?: string;
}

export class ACL {
  // resourceId -> subjectId -> ACLEntry
  private entries: Map<string, Map<string, ACLEntry>> = new Map();
  private rbac?: RBAC;
  private inheritFromParent: boolean;
  // resource hierarchy for inheritance
  private hierarchy: Map<string, string> = new Map(); // childId -> parentId

  constructor(options: ACLOptions = {}) {
    this.rbac = options.rbac;
    this.inheritFromParent = options.inheritFromParent ?? false;
  }

  /**
   * Register a parent-child relationship for inheritance.
   */
  setParent(childResourceId: string, parentResourceId: string): void {
    this.hierarchy.set(childResourceId, parentResourceId);
  }

  /**
   * Remove a parent-child relationship.
   */
  removeParent(childResourceId: string): void {
    this.hierarchy.delete(childResourceId);
  }

  /**
   * Grant permissions to a subject on a resource.
   */
  grant(
    subjectId: string,
    subjectType: ACLEntry["subjectType"],
    resourceId: string,
    resourceType: ResourceType,
    permissions: Permission[],
    grantedBy: string,
    expiresAt?: Date,
  ): ACLEntry {
    if (!this.entries.has(resourceId)) {
      this.entries.set(resourceId, new Map());
    }

    const existing = this.entries.get(resourceId)!.get(subjectId);
    const mergedPermissions = existing
      ? Array.from(new Set([...existing.permissions, ...permissions]))
      : permissions;

    const entry: ACLEntry = {
      subjectId,
      subjectType,
      resourceId,
      resourceType,
      permissions: mergedPermissions,
      grantedBy,
      grantedAt: new Date(),
      expiresAt,
    };

    this.entries.get(resourceId)!.set(subjectId, entry);
    return entry;
  }

  /**
   * Revoke specific permissions from a subject on a resource.
   * If no permissions specified, removes the entry entirely.
   */
  revoke(subjectId: string, resourceId: string, permissions?: Permission[]): void {
    const resourceEntries = this.entries.get(resourceId);
    if (!resourceEntries) return;

    const entry = resourceEntries.get(subjectId);
    if (!entry) return;

    if (!permissions || permissions.length === 0) {
      resourceEntries.delete(subjectId);
    } else {
      const remaining = entry.permissions.filter((p) => !permissions.includes(p));
      if (remaining.length === 0) {
        resourceEntries.delete(subjectId);
      } else {
        resourceEntries.set(subjectId, { ...entry, permissions: remaining });
      }
    }

    if (resourceEntries.size === 0) {
      this.entries.delete(resourceId);
    }
  }

  /**
   * Check if an entry has expired.
   */
  private isExpired(entry: ACLEntry): boolean {
    if (!entry.expiresAt) return false;
    return entry.expiresAt < new Date();
  }

  /**
   * Get the ACL entry for a subject on a resource.
   */
  getEntry(subjectId: string, resourceId: string): ACLEntry | undefined {
    const entry = this.entries.get(resourceId)?.get(subjectId);
    if (!entry || this.isExpired(entry)) return undefined;
    return entry;
  }

  /**
   * Get all ACL entries for a resource.
   */
  getResourceEntries(resourceId: string): ACLEntry[] {
    const resourceEntries = this.entries.get(resourceId);
    if (!resourceEntries) return [];
    return Array.from(resourceEntries.values()).filter((e) => !this.isExpired(e));
  }

  /**
   * Get all ACL entries for a subject across all resources.
   */
  getSubjectEntries(subjectId: string): ACLEntry[] {
    const result: ACLEntry[] = [];
    for (const resourceEntries of this.entries.values()) {
      const entry = resourceEntries.get(subjectId);
      if (entry && !this.isExpired(entry)) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Check access for a subject on a resource with ACL + optional RBAC fallback + inheritance.
   */
  check(subjectId: string, resourceId: string, permission: Permission): ACLCheckResult {
    // Direct ACL check
    const directEntry = this.getEntry(subjectId, resourceId);
    if (directEntry) {
      if (directEntry.permissions.includes(permission)) {
        return {
          granted: true,
          source: "acl",
          entry: directEntry,
          reason: `Direct ACL entry grants ${permission}`,
        };
      } else {
        // Entry exists but doesn't include permission - explicit deny from direct entry
        return {
          granted: false,
          source: "acl",
          entry: directEntry,
          reason: `Direct ACL entry does not include ${permission}`,
        };
      }
    }

    // Inherited ACL check
    if (this.inheritFromParent) {
      const inheritedResult = this.checkInherited(subjectId, resourceId, permission);
      if (inheritedResult) return inheritedResult;
    }

    // RBAC fallback
    if (this.rbac) {
      const rbacGranted = this.rbac.hasPermission(subjectId, permission);
      if (rbacGranted) {
        return {
          granted: true,
          source: "rbac",
          reason: `RBAC role grants ${permission}`,
        };
      }
    }

    return {
      granted: false,
      source: "none",
      reason: `No ACL entry or RBAC role grants ${permission} on resource ${resourceId}`,
    };
  }

  /**
   * Walk up the resource hierarchy to find inherited permissions.
   */
  private checkInherited(
    subjectId: string,
    resourceId: string,
    permission: Permission,
    visited = new Set<string>(),
  ): ACLCheckResult | null {
    if (visited.has(resourceId)) return null;
    visited.add(resourceId);

    const parentId = this.hierarchy.get(resourceId);
    if (!parentId) return null;

    const parentEntry = this.getEntry(subjectId, parentId);
    if (parentEntry && parentEntry.permissions.includes(permission)) {
      return {
        granted: true,
        source: "inherited",
        entry: parentEntry,
        reason: `Inherited permission ${permission} from parent resource ${parentId}`,
      };
    }

    return this.checkInherited(subjectId, parentId, permission, visited);
  }

  /**
   * Bulk grant: grant the same permissions to multiple subjects on one resource.
   */
  bulkGrant(
    subjects: Array<{ subjectId: string; subjectType: ACLEntry["subjectType"] }>,
    resourceId: string,
    resourceType: ResourceType,
    permissions: Permission[],
    grantedBy: string,
  ): ACLEntry[] {
    return subjects.map(({ subjectId, subjectType }) =>
      this.grant(subjectId, subjectType, resourceId, resourceType, permissions, grantedBy),
    );
  }

  /**
   * Bulk revoke: revoke permissions from multiple subjects on one resource.
   */
  bulkRevoke(subjectIds: string[], resourceId: string, permissions?: Permission[]): void {
    for (const subjectId of subjectIds) {
      this.revoke(subjectId, resourceId, permissions);
    }
  }

  /**
   * Copy all ACL entries from one resource to another.
   */
  copyEntries(sourceResourceId: string, targetResourceId: string, targetResourceType: ResourceType): void {
    const sourceEntries = this.getResourceEntries(sourceResourceId);
    for (const entry of sourceEntries) {
      this.grant(
        entry.subjectId,
        entry.subjectType,
        targetResourceId,
        targetResourceType,
        entry.permissions,
        entry.grantedBy,
        entry.expiresAt,
      );
    }
  }

  /**
   * Remove all ACL entries for a resource.
   */
  clearResource(resourceId: string): void {
    this.entries.delete(resourceId);
  }

  /**
   * Remove all expired entries across all resources.
   */
  pruneExpired(): number {
    let pruned = 0;
    for (const [resourceId, resourceEntries] of this.entries.entries()) {
      for (const [subjectId, entry] of resourceEntries.entries()) {
        if (this.isExpired(entry)) {
          resourceEntries.delete(subjectId);
          pruned++;
        }
      }
      if (resourceEntries.size === 0) {
        this.entries.delete(resourceId);
      }
    }
    return pruned;
  }

  /**
   * Serialize ACL state for persistence.
   */
  serialize(): { entries: ACLEntry[] } {
    const allEntries: ACLEntry[] = [];
    for (const resourceEntries of this.entries.values()) {
      for (const entry of resourceEntries.values()) {
        allEntries.push(entry);
      }
    }
    return { entries: allEntries };
  }

  /**
   * Restore ACL state from serialized data.
   */
  deserialize(data: { entries: Array<Omit<ACLEntry, "grantedAt" | "expiresAt"> & { grantedAt: string; expiresAt?: string }> }): void {
    this.entries.clear();
    for (const raw of data.entries) {
      const entry: ACLEntry = {
        ...raw,
        grantedAt: new Date(raw.grantedAt),
        expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
      };
      if (!this.entries.has(entry.resourceId)) {
        this.entries.set(entry.resourceId, new Map());
      }
      this.entries.get(entry.resourceId)!.set(entry.subjectId, entry);
    }
  }

  /**
   * Get a summary of permissions a subject has across all resources.
   */
  getSubjectSummary(subjectId: string): Record<string, Permission[]> {
    const result: Record<string, Permission[]> = {};
    for (const entry of this.getSubjectEntries(subjectId)) {
      result[entry.resourceId] = entry.permissions;
    }
    return result;
  }
}
