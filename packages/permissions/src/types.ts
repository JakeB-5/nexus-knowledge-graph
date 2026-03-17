// Permission types for the Nexus ACL system

export enum Permission {
  Read = "read",
  Write = "write",
  Delete = "delete",
  Admin = "admin",
  Share = "share",
  Comment = "comment",
}

export type ResourceType = "node" | "edge" | "collection" | "workspace";

export type Role = "owner" | "editor" | "viewer" | "commenter";

export interface ACLEntry {
  subjectId: string;
  subjectType: "user" | "group" | "role";
  resourceId: string;
  resourceType: ResourceType;
  permissions: Permission[];
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface PolicyCondition {
  type: "time" | "ip" | "attribute" | "custom";
  operator: "eq" | "ne" | "gt" | "lt" | "in" | "contains" | "matches";
  field: string;
  value: unknown;
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  effect: "allow" | "deny";
  subjects: string[];
  actions: Permission[];
  resources: string[];
  resourceTypes?: ResourceType[];
  conditions?: PolicyCondition[];
  priority: number;
  combinator?: "AND" | "OR";
}

export type EvaluationResult = {
  granted: boolean;
  reason: string;
  source: "rbac" | "acl" | "policy" | "default";
  matchedRule?: string;
  matchedRole?: Role;
  auditLog: AuditEntry;
};

export interface AuditEntry {
  timestamp: Date;
  subjectId: string;
  action: Permission;
  resourceId: string;
  resourceType: ResourceType;
  granted: boolean;
  source: string;
  reason: string;
  contextSnapshot?: Record<string, unknown>;
}

export interface PermissionContext {
  subjectId: string;
  subjectGroups?: string[];
  subjectAttributes?: Record<string, unknown>;
  resourceId: string;
  resourceType: ResourceType;
  resourceAttributes?: Record<string, unknown>;
  action: Permission;
  environment?: {
    ip?: string;
    timestamp?: Date;
    userAgent?: string;
    [key: string]: unknown;
  };
}

export interface RoleDefinition {
  name: Role;
  permissions: Permission[];
  inheritsFrom?: Role[];
  description?: string;
}

export interface SubjectPermissions {
  subjectId: string;
  roles: Role[];
  directPermissions: Permission[];
}
