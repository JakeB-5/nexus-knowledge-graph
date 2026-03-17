import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditPolicyEngine, createDefaultPolicy, createCompliancePolicy } from "../audit-policy.js";
import { AuditAction } from "../types.js";
import type { AuditEntry, AlertRule } from "../types.js";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "e-1",
    action: AuditAction.Login,
    actor: { id: "user-1", type: "user" },
    resource: { type: "auth", id: "auth-1" },
    timestamp: new Date(),
    metadata: {},
    outcome: "failure",
    ...overrides,
  };
}

describe("AuditPolicyEngine", () => {
  describe("shouldAudit()", () => {
    it("uses default level for unknown resource", () => {
      const engine = new AuditPolicyEngine({ policy: createDefaultPolicy() });
      const result = engine.shouldAudit(AuditAction.Read, "node");
      expect(result.audit).toBe(true);
      expect(result.level).toBe("basic");
    });

    it("returns none when default level is none", () => {
      const policy = { ...createDefaultPolicy(), defaultLevel: "none" as const };
      const engine = new AuditPolicyEngine({ policy });
      const result = engine.shouldAudit(AuditAction.Read, "node");
      expect(result.audit).toBe(false);
    });

    it("matches resource-specific policy", () => {
      const policy = createDefaultPolicy();
      const engine = new AuditPolicyEngine({ policy });
      engine.addResourcePolicy({
        resourceType: "node",
        actions: [AuditAction.Read],
        level: "detailed",
      });

      const result = engine.shouldAudit(AuditAction.Read, "node");
      expect(result.level).toBe("detailed");
    });

    it("falls back to default when action not in resource policy", () => {
      const policy = createDefaultPolicy();
      const engine = new AuditPolicyEngine({ policy });
      engine.addResourcePolicy({
        resourceType: "node",
        actions: [AuditAction.Delete],
        level: "detailed",
      });

      // Read is not in the node policy → should use default
      const result = engine.shouldAudit(AuditAction.Read, "node");
      expect(result.level).toBe("basic");
    });

    it("excludes matching patterns", () => {
      const policy = createDefaultPolicy();
      const engine = new AuditPolicyEngine({ policy });
      engine.addExcludePattern({ resourceType: "health", action: AuditAction.Read });

      const result = engine.shouldAudit(AuditAction.Read, "health");
      expect(result.audit).toBe(false);
    });

    it("excludes when only resourceType matches", () => {
      const policy = createDefaultPolicy();
      const engine = new AuditPolicyEngine({ policy });
      engine.addExcludePattern({ resourceType: "health" });

      expect(engine.shouldAudit(AuditAction.Read, "health").audit).toBe(false);
      expect(engine.shouldAudit(AuditAction.Create, "health").audit).toBe(false);
    });

    it("does not exclude when only action matches partial pattern", () => {
      const policy = createDefaultPolicy();
      const engine = new AuditPolicyEngine({ policy });
      engine.addExcludePattern({ resourceType: "health", action: AuditAction.Read });

      // Different resourceType should not be excluded
      expect(engine.shouldAudit(AuditAction.Read, "node").audit).toBe(true);
    });

    it("compliance mode overrides everything", () => {
      const engine = new AuditPolicyEngine({ policy: createCompliancePolicy() });
      engine.addExcludePattern({ resourceType: "health" });

      // Even excluded resources must be audited in compliance mode
      const result = engine.shouldAudit(AuditAction.Read, "health");
      expect(result.audit).toBe(true);
      expect(result.level).toBe("detailed");
    });
  });

  describe("checkAlerts()", () => {
    it("triggers alert when threshold exceeded", () => {
      const onAlert = vi.fn();
      const rule: AlertRule = {
        action: AuditAction.Login,
        outcome: "failure",
        windowMs: 60_000,
        threshold: 3,
        onAlert,
      };
      const policy = { ...createDefaultPolicy(), alertRules: [rule] };
      const engine = new AuditPolicyEngine({ policy });

      const entries: AuditEntry[] = [];
      for (let i = 0; i < 3; i++) {
        const entry = makeEntry({ id: `e-${i}` });
        entries.push(entry);
        engine.checkAlerts(entry, entries);
      }

      expect(onAlert).toHaveBeenCalledTimes(1);
    });

    it("does not trigger alert below threshold", () => {
      const onAlert = vi.fn();
      const rule: AlertRule = {
        action: AuditAction.Login,
        outcome: "failure",
        windowMs: 60_000,
        threshold: 5,
        onAlert,
      };
      const policy = { ...createDefaultPolicy(), alertRules: [rule] };
      const engine = new AuditPolicyEngine({ policy });

      const entries: AuditEntry[] = [];
      for (let i = 0; i < 4; i++) {
        const entry = makeEntry({ id: `e-${i}` });
        entries.push(entry);
        engine.checkAlerts(entry, entries);
      }

      expect(onAlert).not.toHaveBeenCalled();
    });

    it("ignores entries not matching rule action", () => {
      const onAlert = vi.fn();
      const rule: AlertRule = {
        action: AuditAction.Login,
        outcome: "failure",
        windowMs: 60_000,
        threshold: 2,
        onAlert,
      };
      const policy = { ...createDefaultPolicy(), alertRules: [rule] };
      const engine = new AuditPolicyEngine({ policy });

      const deleteEntry = makeEntry({ action: AuditAction.Delete });
      engine.checkAlerts(deleteEntry, [deleteEntry]);
      engine.checkAlerts(deleteEntry, [deleteEntry]);

      expect(onAlert).not.toHaveBeenCalled();
    });
  });

  describe("policy management", () => {
    it("updates policy at runtime", () => {
      const engine = new AuditPolicyEngine({ policy: createDefaultPolicy() });
      engine.updatePolicy({ defaultLevel: "detailed" });
      expect(engine.getPolicy().defaultLevel).toBe("detailed");
    });

    it("replaces existing resource policy", () => {
      const engine = new AuditPolicyEngine({ policy: createDefaultPolicy() });
      engine.addResourcePolicy({ resourceType: "node", actions: [AuditAction.Read], level: "basic" });
      engine.addResourcePolicy({ resourceType: "node", actions: [AuditAction.Read], level: "detailed" });

      const result = engine.shouldAudit(AuditAction.Read, "node");
      expect(result.level).toBe("detailed");
    });

    it("isComplianceMode() reflects policy", () => {
      const engine = new AuditPolicyEngine({ policy: createCompliancePolicy() });
      expect(engine.isComplianceMode()).toBe(true);

      const defaultEngine = new AuditPolicyEngine({ policy: createDefaultPolicy() });
      expect(defaultEngine.isComplianceMode()).toBe(false);
    });

    it("getRetentionDays() returns configured value", () => {
      const policy = { ...createDefaultPolicy(), retentionDays: 180 };
      const engine = new AuditPolicyEngine({ policy });
      expect(engine.getRetentionDays()).toBe(180);
    });
  });
});
