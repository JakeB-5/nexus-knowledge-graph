/**
 * Audit package types
 */

// Actions that can be audited
export enum AuditAction {
  Create = "create",
  Read = "read",
  Update = "update",
  Delete = "delete",
  Login = "login",
  Logout = "logout",
  Export = "export",
  Import = "import",
  Share = "share",
  PermissionChange = "permission_change",
}

// The actor who performed the action
export interface AuditActor {
  id: string;
  type: "user" | "system" | "api_key" | "service";
  name?: string;
  email?: string;
}

// The resource the action was performed on
export interface AuditResource {
  type: string; // e.g. "node", "edge", "user", "workspace"
  id: string;
  name?: string;
}

// A diff entry for update actions
export interface AuditDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

// A single audit log entry
export interface AuditEntry {
  id: string;
  action: AuditAction;
  actor: AuditActor;
  resource: AuditResource;
  timestamp: Date;
  metadata: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  diff?: AuditDiff[];
  outcome: "success" | "failure";
  errorMessage?: string;
}

// Query filters for retrieving audit entries
export interface AuditQuery {
  actorId?: string;
  actorType?: AuditActor["type"];
  action?: AuditAction | AuditAction[];
  resourceType?: string;
  resourceId?: string;
  startTime?: Date;
  endTime?: Date;
  outcome?: AuditEntry["outcome"];
  requestId?: string;
  sessionId?: string;
  limit?: number;
  cursor?: string;
}

// Paginated result from a query
export interface AuditQueryResult {
  entries: AuditEntry[];
  nextCursor?: string;
  total?: number;
}

// Aggregation result
export interface AuditAggregation {
  eventsPerDay: Record<string, number>;
  eventsPerUser: Record<string, number>;
  eventsPerAction: Record<string, number>;
}

// Storage backend interface
export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  query(query: AuditQuery): Promise<AuditQueryResult>;
  aggregate(query: Omit<AuditQuery, "limit" | "cursor">): Promise<AuditAggregation>;
  export(format: "json" | "csv", query?: AuditQuery): Promise<string>;
  compact(olderThan: Date): Promise<number>;
  size(): Promise<number>;
}

// Audit level for a given resource/action
export type AuditLevel = "none" | "basic" | "detailed";

// Per-resource policy configuration
export interface ResourcePolicy {
  resourceType: string;
  actions: AuditAction[];
  level: AuditLevel;
}

// Alert rule triggered by rate conditions
export interface AlertRule {
  action: AuditAction;
  outcome: AuditEntry["outcome"];
  windowMs: number; // time window in ms
  threshold: number; // number of events to trigger alert
  onAlert: (entries: AuditEntry[]) => void;
}

// Policy interface for controlling audit behavior
export interface AuditPolicy {
  defaultLevel: AuditLevel;
  resourcePolicies: ResourcePolicy[];
  excludePatterns: Array<{ resourceType?: string; action?: AuditAction }>;
  alertRules: AlertRule[];
  complianceMode: boolean; // if true, audit everything regardless of other settings
  retentionDays: number;
}
