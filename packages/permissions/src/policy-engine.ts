// Attribute-Based Access Control (ABAC) policy engine

import { Permission, PolicyCondition, PolicyRule, ResourceType, AuditEntry, PermissionContext } from "./types.js";

export interface PolicyEngineOptions {
  defaultEffect?: "allow" | "deny";
  auditLog?: boolean;
  maxAuditEntries?: number;
}

export interface PolicyEvaluation {
  granted: boolean;
  effect: "allow" | "deny" | "default";
  matchedRules: PolicyRule[];
  deniedBy?: PolicyRule;
  allowedBy?: PolicyRule;
  reason: string;
  auditEntry: AuditEntry;
}

type ConditionEvaluator = (condition: PolicyCondition, context: PermissionContext) => boolean;

export class PolicyEngine {
  private policies: Map<string, PolicyRule> = new Map();
  private auditEntries: AuditEntry[] = [];
  private readonly defaultEffect: "allow" | "deny";
  private readonly auditEnabled: boolean;
  private readonly maxAuditEntries: number;

  constructor(options: PolicyEngineOptions = {}) {
    this.defaultEffect = options.defaultEffect ?? "deny";
    this.auditEnabled = options.auditLog ?? true;
    this.maxAuditEntries = options.maxAuditEntries ?? 10000;
  }

  /**
   * Add or update a policy rule.
   */
  addPolicy(rule: PolicyRule): void {
    this.policies.set(rule.id, { ...rule });
  }

  /**
   * Remove a policy by id.
   */
  removePolicy(id: string): boolean {
    return this.policies.delete(id);
  }

  /**
   * Get a policy by id.
   */
  getPolicy(id: string): PolicyRule | undefined {
    return this.policies.get(id);
  }

  /**
   * List all policies sorted by priority (higher = evaluated first).
   */
  listPolicies(): PolicyRule[] {
    return Array.from(this.policies.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate a permission request against all policies.
   * Uses deny-override: any deny rule overrides all allow rules.
   */
  evaluate(context: PermissionContext): PolicyEvaluation {
    const { subjectId, action, resourceId, resourceType } = context;
    const matchedRules: PolicyRule[] = [];
    let allowRule: PolicyRule | undefined;
    let denyRule: PolicyRule | undefined;

    const sortedPolicies = this.listPolicies();

    for (const rule of sortedPolicies) {
      if (this.matchesRule(rule, context)) {
        matchedRules.push(rule);
        if (rule.effect === "deny") {
          denyRule = rule;
          break; // deny-override: stop at first deny
        } else if (!allowRule) {
          allowRule = rule;
        }
      }
    }

    // Deny-override strategy
    const granted = denyRule ? false : allowRule ? true : this.defaultEffect === "allow";
    const effect: PolicyEvaluation["effect"] = denyRule ? "deny" : allowRule ? "allow" : "default";

    const reason = denyRule
      ? `Denied by policy: ${denyRule.name}`
      : allowRule
        ? `Allowed by policy: ${allowRule.name}`
        : `No matching policy; default effect is ${this.defaultEffect}`;

    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      subjectId,
      action,
      resourceId,
      resourceType,
      granted,
      source: "policy",
      reason,
      contextSnapshot: {
        matchedRuleIds: matchedRules.map((r) => r.id),
        subjectAttributes: context.subjectAttributes,
        resourceAttributes: context.resourceAttributes,
        environment: context.environment,
      },
    };

    if (this.auditEnabled) {
      this.recordAudit(auditEntry);
    }

    return {
      granted,
      effect,
      matchedRules,
      deniedBy: denyRule,
      allowedBy: allowRule,
      reason,
      auditEntry,
    };
  }

  /**
   * Check if a rule matches the given context.
   */
  private matchesRule(rule: PolicyRule, context: PermissionContext): boolean {
    const { subjectId, action, resourceId, resourceType, subjectGroups } = context;

    // Check subjects (wildcard "*" matches all)
    const subjectMatch =
      rule.subjects.includes("*") ||
      rule.subjects.includes(subjectId) ||
      (subjectGroups?.some((g) => rule.subjects.includes(g)) ?? false);
    if (!subjectMatch) return false;

    // Check actions
    if (!rule.actions.includes(action)) return false;

    // Check resources (wildcard "*" matches all)
    const resourceMatch =
      rule.resources.includes("*") ||
      rule.resources.includes(resourceId) ||
      rule.resources.some((r) => this.matchesPattern(r, resourceId));
    if (!resourceMatch) return false;

    // Check resource types if specified
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      if (!rule.resourceTypes.includes(resourceType)) return false;
    }

    // Check conditions
    if (rule.conditions && rule.conditions.length > 0) {
      return this.evaluateConditions(rule.conditions, rule.combinator ?? "AND", context);
    }

    return true;
  }

  /**
   * Evaluate conditions with AND/OR combinator.
   */
  private evaluateConditions(
    conditions: PolicyCondition[],
    combinator: "AND" | "OR",
    context: PermissionContext,
  ): boolean {
    if (combinator === "AND") {
      return conditions.every((c) => this.evaluateCondition(c, context));
    } else {
      return conditions.some((c) => this.evaluateCondition(c, context));
    }
  }

  /**
   * Evaluate a single condition against the context.
   */
  private evaluateCondition(condition: PolicyCondition, context: PermissionContext): boolean {
    const evaluator = this.getConditionEvaluator(condition.type);
    return evaluator(condition, context);
  }

  /**
   * Get the evaluator function for a condition type.
   */
  private getConditionEvaluator(type: PolicyCondition["type"]): ConditionEvaluator {
    switch (type) {
      case "time":
        return this.evaluateTimeCondition.bind(this);
      case "ip":
        return this.evaluateIpCondition.bind(this);
      case "attribute":
        return this.evaluateAttributeCondition.bind(this);
      case "custom":
        return this.evaluateCustomCondition.bind(this);
      default: {
        const _exhaustive: never = type;
        return () => false;
      }
    }
  }

  /**
   * Time-based condition: check if current time is within bounds.
   * field: "hour", "dayOfWeek", "timestamp"
   */
  private evaluateTimeCondition(condition: PolicyCondition, context: PermissionContext): boolean {
    const now = context.environment?.timestamp ?? new Date();

    if (condition.field === "hour") {
      const hour = now.getHours();
      return this.compareValues(hour, condition.operator, condition.value);
    }
    if (condition.field === "dayOfWeek") {
      const day = now.getDay(); // 0=Sunday
      return this.compareValues(day, condition.operator, condition.value);
    }
    if (condition.field === "timestamp") {
      return this.compareValues(now.getTime(), condition.operator, new Date(condition.value as string).getTime());
    }
    return false;
  }

  /**
   * IP-based condition.
   * field: "ip", "ipPrefix"
   */
  private evaluateIpCondition(condition: PolicyCondition, context: PermissionContext): boolean {
    const ip = context.environment?.ip;
    if (!ip) return false;

    if (condition.field === "ip") {
      return this.compareValues(ip, condition.operator, condition.value);
    }
    if (condition.field === "ipPrefix") {
      const prefix = condition.value as string;
      return ip.startsWith(prefix);
    }
    return false;
  }

  /**
   * Attribute-based condition: check subject or resource attributes.
   * field format: "subject.<attr>", "resource.<attr>", "env.<attr>"
   */
  private evaluateAttributeCondition(condition: PolicyCondition, context: PermissionContext): boolean {
    const [scope, ...fieldParts] = condition.field.split(".");
    const fieldName = fieldParts.join(".");
    let actualValue: unknown;

    if (scope === "subject") {
      actualValue = context.subjectAttributes?.[fieldName];
    } else if (scope === "resource") {
      actualValue = context.resourceAttributes?.[fieldName];
    } else if (scope === "env") {
      actualValue = context.environment?.[fieldName];
    } else {
      return false;
    }

    return this.compareValues(actualValue, condition.operator, condition.value);
  }

  /**
   * Custom condition: always returns true (can be overridden by extending class).
   */
  protected evaluateCustomCondition(_condition: PolicyCondition, _context: PermissionContext): boolean {
    return true;
  }

  /**
   * Compare values based on operator.
   */
  private compareValues(actual: unknown, operator: PolicyCondition["operator"], expected: unknown): boolean {
    switch (operator) {
      case "eq":
        return actual === expected;
      case "ne":
        return actual !== expected;
      case "gt":
        return (actual as number) > (expected as number);
      case "lt":
        return (actual as number) < (expected as number);
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
      case "contains":
        if (typeof actual === "string" && typeof expected === "string") {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      case "matches":
        if (typeof actual === "string" && typeof expected === "string") {
          return new RegExp(expected).test(actual);
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Simple glob-like pattern matching for resource IDs.
   * Supports "*" as wildcard.
   */
  private matchesPattern(pattern: string, value: string): boolean {
    if (!pattern.includes("*")) return pattern === value;
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(value);
  }

  /**
   * Record an audit entry, pruning old entries if necessary.
   */
  private recordAudit(entry: AuditEntry): void {
    this.auditEntries.push(entry);
    if (this.auditEntries.length > this.maxAuditEntries) {
      this.auditEntries.splice(0, this.auditEntries.length - this.maxAuditEntries);
    }
  }

  /**
   * Get all audit entries, optionally filtered.
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

    if (filter.subjectId) entries = entries.filter((e) => e.subjectId === filter.subjectId);
    if (filter.resourceId) entries = entries.filter((e) => e.resourceId === filter.resourceId);
    if (filter.action) entries = entries.filter((e) => e.action === filter.action);
    if (filter.granted !== undefined) entries = entries.filter((e) => e.granted === filter.granted);
    if (filter.since) entries = entries.filter((e) => e.timestamp >= filter.since!);

    return entries;
  }

  /**
   * Clear all audit entries.
   */
  clearAuditLog(): void {
    this.auditEntries = [];
  }

  /**
   * Compose two condition sets with NOT logic (negate all conditions).
   */
  negateConditions(conditions: PolicyCondition[]): PolicyCondition[] {
    return conditions.map((c) => ({
      ...c,
      operator: this.negateOperator(c.operator),
    }));
  }

  private negateOperator(op: PolicyCondition["operator"]): PolicyCondition["operator"] {
    const map: Record<PolicyCondition["operator"], PolicyCondition["operator"]> = {
      eq: "ne",
      ne: "eq",
      gt: "lt",
      lt: "gt",
      in: "ne",      // simplified
      contains: "ne", // simplified
      matches: "ne",  // simplified
    };
    return map[op];
  }

  /**
   * Bulk evaluate multiple permission contexts.
   */
  evaluateBatch(contexts: PermissionContext[]): PolicyEvaluation[] {
    return contexts.map((ctx) => this.evaluate(ctx));
  }

  /**
   * Export policies for persistence.
   */
  exportPolicies(): PolicyRule[] {
    return Array.from(this.policies.values());
  }

  /**
   * Import policies (replaces existing).
   */
  importPolicies(rules: PolicyRule[]): void {
    this.policies.clear();
    for (const rule of rules) {
      this.policies.set(rule.id, rule);
    }
  }
}
