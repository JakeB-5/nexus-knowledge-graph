import { describe, it, expect, beforeEach, vi } from "vitest";
import { PermissionEvaluator } from "../evaluator.js";
import { RBAC } from "../rbac.js";
import { ACL } from "../acl.js";
import { PolicyEngine } from "../policy-engine.js";
import { Permission, PermissionContext } from "../types.js";

function makeContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    subjectId: "user1",
    resourceId: "resource1",
    resourceType: "node",
    action: Permission.Read,
    ...overrides,
  };
}

describe("PermissionEvaluator", () => {
  let rbac: RBAC;
  let acl: ACL;
  let policyEngine: PolicyEngine;
  let evaluator: PermissionEvaluator;

  beforeEach(() => {
    rbac = new RBAC();
    acl = new ACL();
    policyEngine = new PolicyEngine({ defaultEffect: "deny" });
    evaluator = new PermissionEvaluator({ rbac, acl, policyEngine, cacheTtl: 0 });
  });

  describe("policy source", () => {
    it("should grant when policy allows", () => {
      policyEngine.addPolicy({
        id: "p1",
        name: "Allow read",
        effect: "allow",
        subjects: ["user1"],
        actions: [Permission.Read],
        resources: ["resource1"],
        priority: 10,
      });
      const result = evaluator.evaluate(makeContext());
      expect(result.granted).toBe(true);
      expect(result.source).toBe("policy");
    });

    it("should deny when policy denies", () => {
      policyEngine.addPolicy({
        id: "p1",
        name: "Deny read",
        effect: "deny",
        subjects: ["user1"],
        actions: [Permission.Read],
        resources: ["resource1"],
        priority: 10,
      });
      const result = evaluator.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.source).toBe("policy");
    });
  });

  describe("ACL source", () => {
    it("should grant when ACL allows (no policy match)", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      const result = evaluator.evaluate(makeContext());
      expect(result.granted).toBe(true);
      expect(result.source).toBe("acl");
    });

    it("should deny when ACL entry exists but lacks permission", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Comment], "admin");
      const result = evaluator.evaluate(makeContext({ action: Permission.Write }));
      expect(result.granted).toBe(false);
      expect(result.source).toBe("acl");
    });
  });

  describe("RBAC source", () => {
    it("should grant when RBAC role allows (no policy or ACL match)", () => {
      rbac.assignRole("user1", "viewer");
      const result = evaluator.evaluate(makeContext());
      expect(result.granted).toBe(true);
      expect(result.source).toBe("rbac");
    });

    it("should deny when RBAC has no matching role", () => {
      const result = evaluator.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.source).toBe("default");
    });
  });

  describe("evaluation order", () => {
    it("should follow default order: policy > acl > rbac", () => {
      // All three would grant
      policyEngine.addPolicy({
        id: "p1",
        name: "Allow",
        effect: "allow",
        subjects: ["*"],
        actions: [Permission.Read],
        resources: ["*"],
        priority: 10,
      });
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      rbac.assignRole("user1", "viewer");

      const result = evaluator.evaluate(makeContext());
      expect(result.source).toBe("policy"); // policy wins
    });

    it("should support custom evaluation order", () => {
      rbac.assignRole("user1", "viewer");
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");

      const customEvaluator = new PermissionEvaluator({
        rbac,
        acl,
        evaluationOrder: ["rbac", "acl"],
        cacheTtl: 0,
      });

      const result = customEvaluator.evaluate(makeContext());
      expect(result.source).toBe("rbac"); // rbac checked first
    });
  });

  describe("caching", () => {
    it("should cache results and return cached on second call", () => {
      rbac.assignRole("user1", "viewer");
      const cachedEvaluator = new PermissionEvaluator({ rbac, cacheTtl: 5000 });

      const result1 = cachedEvaluator.evaluate(makeContext());
      // Now revoke (but cached result should persist)
      rbac.revokeRole("user1", "viewer");
      const result2 = cachedEvaluator.evaluate(makeContext());

      expect(result1.granted).toBe(true);
      expect(result2.granted).toBe(true); // cached
    });

    it("should bypass cache when cacheTtl is 0", () => {
      rbac.assignRole("user1", "viewer");
      evaluator.evaluate(makeContext()); // first call
      rbac.revokeRole("user1", "viewer");
      const result = evaluator.evaluate(makeContext()); // second call, no cache
      expect(result.granted).toBe(false);
    });

    it("should invalidate cache by subjectId", () => {
      rbac.assignRole("user1", "viewer");
      const cachedEvaluator = new PermissionEvaluator({ rbac, cacheTtl: 60000 });
      cachedEvaluator.evaluate(makeContext());
      rbac.revokeRole("user1", "viewer");
      cachedEvaluator.invalidateCache({ subjectId: "user1" });
      const result = cachedEvaluator.evaluate(makeContext());
      expect(result.granted).toBe(false);
    });

    it("should get cache stats", () => {
      const cachedEvaluator = new PermissionEvaluator({ rbac, cacheTtl: 5000 });
      cachedEvaluator.evaluate(makeContext());
      const stats = cachedEvaluator.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.ttl).toBe(5000);
    });
  });

  describe("batch evaluation", () => {
    it("should evaluate multiple contexts", () => {
      rbac.assignRole("user1", "owner");
      const contexts: PermissionContext[] = [
        makeContext({ action: Permission.Read }),
        makeContext({ action: Permission.Write }),
        makeContext({ action: Permission.Delete }),
      ];
      const results = evaluator.evaluateBatch(contexts);
      expect(results).toHaveLength(3);
      expect(results[0]?.granted).toBe(true);
      expect(results[1]?.granted).toBe(true);
      expect(results[2]?.granted).toBe(true);
    });
  });

  describe("evaluatePermissions", () => {
    it("should evaluate multiple permissions for one subject/resource", () => {
      rbac.assignRole("user1", "editor");
      const results = evaluator.evaluatePermissions("user1", "resource1", "node", [
        Permission.Read,
        Permission.Write,
        Permission.Delete,
      ]);
      expect(results[Permission.Read]?.granted).toBe(true);
      expect(results[Permission.Write]?.granted).toBe(true);
      expect(results[Permission.Delete]?.granted).toBe(false);
    });
  });

  describe("explain", () => {
    it("should produce a human-readable explanation", () => {
      rbac.assignRole("user1", "viewer");
      const explanation = evaluator.explain(makeContext());
      expect(explanation).toContain("GRANTED");
      expect(explanation).toContain("user1");
      expect(explanation).toContain("read");
      expect(explanation).toContain("resource1");
    });

    it("should explain denied access", () => {
      const explanation = evaluator.explain(makeContext({ action: Permission.Delete }));
      expect(explanation).toContain("DENIED");
    });
  });

  describe("audit log", () => {
    it("should record audit entries", () => {
      rbac.assignRole("user1", "viewer");
      evaluator.evaluate(makeContext());
      const log = evaluator.getAuditLog();
      expect(log.length).toBeGreaterThan(0);
    });

    it("should filter audit log by granted status", () => {
      rbac.assignRole("user1", "viewer");
      evaluator.evaluate(makeContext({ action: Permission.Read }));
      evaluator.evaluate(makeContext({ action: Permission.Delete }));
      const granted = evaluator.getAuditLog({ granted: true });
      const denied = evaluator.getAuditLog({ granted: false });
      expect(granted.every((e) => e.granted)).toBe(true);
      expect(denied.every((e) => !e.granted)).toBe(true);
    });

    it("should clear audit log", () => {
      evaluator.evaluate(makeContext());
      evaluator.clearAuditLog();
      expect(evaluator.getAuditLog()).toHaveLength(0);
    });
  });

  describe("default deny with no providers", () => {
    it("should default to deny with no rbac/acl/policy", () => {
      const empty = new PermissionEvaluator({ cacheTtl: 0 });
      const result = empty.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.source).toBe("default");
    });
  });
});
