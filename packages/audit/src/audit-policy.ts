/**
 * AuditPolicyEngine - controls which events are audited and at what level
 */

import type {
  AlertRule,
  AuditAction,
  AuditEntry,
  AuditLevel,
  AuditPolicy,
  ResourcePolicy,
} from "./types.js";

export interface PolicyEngineOptions {
  policy: AuditPolicy;
  onAlert?: (rule: AlertRule, entries: AuditEntry[]) => void;
}

export interface ShouldAuditResult {
  audit: boolean;
  level: AuditLevel;
}

export class AuditPolicyEngine {
  private policy: AuditPolicy;
  private readonly onAlert: (rule: AlertRule, entries: AuditEntry[]) => void;
  // Sliding window tracking for alert rules: key -> timestamps
  private readonly alertWindows = new Map<string, number[]>();

  constructor(options: PolicyEngineOptions) {
    this.policy = options.policy;
    this.onAlert =
      options.onAlert ??
      ((rule, entries) => {
        console.warn(
          `[AuditPolicy] Alert: ${entries.length} ${rule.action}/${rule.outcome} events in ${rule.windowMs}ms`
        );
        rule.onAlert(entries);
      });
  }

  /** Update the policy at runtime */
  updatePolicy(policy: Partial<AuditPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /** Determine if a given action on a resource should be audited */
  shouldAudit(action: AuditAction, resourceType: string): ShouldAuditResult {
    // Compliance mode overrides everything
    if (this.policy.complianceMode) {
      return { audit: true, level: "detailed" };
    }

    // Check exclusion patterns
    if (this.isExcluded(action, resourceType)) {
      return { audit: false, level: "none" };
    }

    // Find matching resource policy
    const resourcePolicy = this.findResourcePolicy(action, resourceType);
    if (resourcePolicy) {
      return {
        audit: resourcePolicy.level !== "none",
        level: resourcePolicy.level,
      };
    }

    // Fall back to default level
    const level = this.policy.defaultLevel;
    return { audit: level !== "none", level };
  }

  /** Check alert rules after an entry is recorded */
  checkAlerts(entry: AuditEntry, recentEntries: AuditEntry[]): void {
    const now = Date.now();

    for (const rule of this.policy.alertRules) {
      if (rule.action !== entry.action) continue;
      if (rule.outcome !== entry.outcome) continue;

      const windowKey = `${rule.action}:${rule.outcome}`;
      let timestamps = this.alertWindows.get(windowKey) ?? [];

      // Add current timestamp
      timestamps.push(now);

      // Prune timestamps outside window
      timestamps = timestamps.filter((t) => now - t <= rule.windowMs);
      this.alertWindows.set(windowKey, timestamps);

      if (timestamps.length >= rule.threshold) {
        // Gather matching entries within the window
        const windowStart = new Date(now - rule.windowMs);
        const matching = recentEntries.filter(
          (e) =>
            e.action === rule.action &&
            e.outcome === rule.outcome &&
            e.timestamp >= windowStart
        );

        this.onAlert(rule, matching);

        // Reset to avoid repeated alerts
        this.alertWindows.set(windowKey, []);
      }
    }
  }

  /** Check if a compliance mode is active */
  isComplianceMode(): boolean {
    return this.policy.complianceMode;
  }

  /** Get the retention period */
  getRetentionDays(): number {
    return this.policy.retentionDays;
  }

  /** Get the full policy */
  getPolicy(): Readonly<AuditPolicy> {
    return this.policy;
  }

  /** Add a resource-specific policy */
  addResourcePolicy(resourcePolicy: ResourcePolicy): void {
    const existing = this.policy.resourcePolicies.findIndex(
      (p) => p.resourceType === resourcePolicy.resourceType
    );
    if (existing !== -1) {
      this.policy.resourcePolicies[existing] = resourcePolicy;
    } else {
      this.policy.resourcePolicies.push(resourcePolicy);
    }
  }

  /** Add an alert rule */
  addAlertRule(rule: AlertRule): void {
    this.policy.alertRules.push(rule);
  }

  /** Add an exclusion pattern */
  addExcludePattern(pattern: { resourceType?: string; action?: AuditAction }): void {
    this.policy.excludePatterns.push(pattern);
  }

  private isExcluded(action: AuditAction, resourceType: string): boolean {
    for (const pattern of this.policy.excludePatterns) {
      const actionMatch = !pattern.action || pattern.action === action;
      const resourceMatch = !pattern.resourceType || pattern.resourceType === resourceType;
      if (actionMatch && resourceMatch) return true;
    }
    return false;
  }

  private findResourcePolicy(
    action: AuditAction,
    resourceType: string
  ): ResourcePolicy | undefined {
    return this.policy.resourcePolicies.find(
      (p) => p.resourceType === resourceType && p.actions.includes(action)
    );
  }
}

/** Create a default permissive policy */
export function createDefaultPolicy(): AuditPolicy {
  return {
    defaultLevel: "basic",
    resourcePolicies: [],
    excludePatterns: [],
    alertRules: [],
    complianceMode: false,
    retentionDays: 90,
  };
}

/** Create a compliance-mode policy (audit everything) */
export function createCompliancePolicy(): AuditPolicy {
  return {
    defaultLevel: "detailed",
    resourcePolicies: [],
    excludePatterns: [],
    alertRules: [],
    complianceMode: true,
    retentionDays: 365,
  };
}
