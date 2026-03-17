import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "../policy-engine.js";
import { Permission, PermissionContext, PolicyRule } from "../types.js";

function makeContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    subjectId: "user1",
    resourceId: "resource1",
    resourceType: "node",
    action: Permission.Read,
    ...overrides,
  };
}

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "rule1",
    name: "Test Rule",
    effect: "allow",
    subjects: ["user1"],
    actions: [Permission.Read],
    resources: ["resource1"],
    priority: 10,
    ...overrides,
  };
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine({ defaultEffect: "deny" });
  });

  describe("basic allow/deny", () => {
    it("should allow when matching allow rule exists", () => {
      engine.addPolicy(makeRule());
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(true);
      expect(result.effect).toBe("allow");
    });

    it("should deny when no rule matches", () => {
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.effect).toBe("default");
    });

    it("should deny when deny rule matches", () => {
      engine.addPolicy(makeRule({ effect: "deny", id: "deny1", name: "Deny Rule" }));
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.effect).toBe("deny");
    });

    it("should deny-override: deny wins over allow", () => {
      engine.addPolicy(makeRule({ effect: "allow", id: "allow1", priority: 5 }));
      engine.addPolicy(makeRule({ effect: "deny", id: "deny1", priority: 10, name: "Deny" }));
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.deniedBy?.id).toBe("deny1");
    });

    it("should use default allow when no rules and defaultEffect is allow", () => {
      const allowEngine = new PolicyEngine({ defaultEffect: "allow" });
      const result = allowEngine.evaluate(makeContext());
      expect(result.granted).toBe(true);
      expect(result.effect).toBe("default");
    });
  });

  describe("subject matching", () => {
    it("should match wildcard subject", () => {
      engine.addPolicy(makeRule({ subjects: ["*"] }));
      const result = engine.evaluate(makeContext({ subjectId: "anyuser" }));
      expect(result.granted).toBe(true);
    });

    it("should match group membership", () => {
      engine.addPolicy(makeRule({ subjects: ["group:admins"] }));
      const result = engine.evaluate(makeContext({ subjectGroups: ["group:admins"] }));
      expect(result.granted).toBe(true);
    });

    it("should not match when subject not in list", () => {
      engine.addPolicy(makeRule({ subjects: ["user2"] }));
      const result = engine.evaluate(makeContext({ subjectId: "user1" }));
      expect(result.granted).toBe(false);
    });
  });

  describe("resource matching", () => {
    it("should match wildcard resource", () => {
      engine.addPolicy(makeRule({ resources: ["*"] }));
      const result = engine.evaluate(makeContext({ resourceId: "any-resource" }));
      expect(result.granted).toBe(true);
    });

    it("should match glob pattern resource", () => {
      engine.addPolicy(makeRule({ resources: ["workspace/*"] }));
      const result = engine.evaluate(makeContext({ resourceId: "workspace/node1" }));
      expect(result.granted).toBe(true);
    });

    it("should not match unrelated resource", () => {
      engine.addPolicy(makeRule({ resources: ["resource2"] }));
      const result = engine.evaluate(makeContext({ resourceId: "resource1" }));
      expect(result.granted).toBe(false);
    });
  });

  describe("resource type filter", () => {
    it("should match when resourceType matches", () => {
      engine.addPolicy(makeRule({ resourceTypes: ["node"] }));
      const result = engine.evaluate(makeContext({ resourceType: "node" }));
      expect(result.granted).toBe(true);
    });

    it("should not match when resourceType does not match", () => {
      engine.addPolicy(makeRule({ resourceTypes: ["workspace"] }));
      const result = engine.evaluate(makeContext({ resourceType: "node" }));
      expect(result.granted).toBe(false);
    });
  });

  describe("time-based conditions", () => {
    it("should allow during business hours (hour condition)", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "time", field: "hour", operator: "gt", value: 8 }],
        }),
      );
      const ctx = makeContext({
        environment: { timestamp: new Date("2024-01-15T10:00:00") },
      });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });

    it("should deny outside business hours", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "time", field: "hour", operator: "gt", value: 8 }],
        }),
      );
      const ctx = makeContext({
        environment: { timestamp: new Date("2024-01-15T07:00:00") },
      });
      expect(engine.evaluate(ctx).granted).toBe(false);
    });
  });

  describe("IP-based conditions", () => {
    it("should allow matching IP", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "ip", field: "ip", operator: "eq", value: "192.168.1.1" }],
        }),
      );
      const ctx = makeContext({ environment: { ip: "192.168.1.1" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });

    it("should deny non-matching IP", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "ip", field: "ip", operator: "eq", value: "192.168.1.1" }],
        }),
      );
      const ctx = makeContext({ environment: { ip: "10.0.0.1" } });
      expect(engine.evaluate(ctx).granted).toBe(false);
    });

    it("should match IP prefix", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "ip", field: "ipPrefix", operator: "eq", value: "192.168." }],
        }),
      );
      const ctx = makeContext({ environment: { ip: "192.168.100.5" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });
  });

  describe("attribute-based conditions", () => {
    it("should check subject attributes", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "attribute", field: "subject.department", operator: "eq", value: "engineering" }],
        }),
      );
      const ctx = makeContext({ subjectAttributes: { department: "engineering" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });

    it("should check resource attributes", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "attribute", field: "resource.sensitivity", operator: "eq", value: "public" }],
        }),
      );
      const ctx = makeContext({ resourceAttributes: { sensitivity: "public" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });

    it("should check 'in' operator", () => {
      engine.addPolicy(
        makeRule({
          conditions: [{ type: "attribute", field: "subject.role", operator: "in", value: ["admin", "superuser"] }],
        }),
      );
      const ctx = makeContext({ subjectAttributes: { role: "admin" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });
  });

  describe("condition combinators", () => {
    it("should apply AND combinator (all conditions must pass)", () => {
      engine.addPolicy(
        makeRule({
          combinator: "AND",
          conditions: [
            { type: "attribute", field: "subject.dept", operator: "eq", value: "eng" },
            { type: "ip", field: "ip", operator: "eq", value: "10.0.0.1" },
          ],
        }),
      );
      // Both match
      let ctx = makeContext({ subjectAttributes: { dept: "eng" }, environment: { ip: "10.0.0.1" } });
      expect(engine.evaluate(ctx).granted).toBe(true);

      // Only one matches
      ctx = makeContext({ subjectAttributes: { dept: "eng" }, environment: { ip: "1.2.3.4" } });
      expect(engine.evaluate(ctx).granted).toBe(false);
    });

    it("should apply OR combinator (any condition passes)", () => {
      engine.addPolicy(
        makeRule({
          combinator: "OR",
          conditions: [
            { type: "attribute", field: "subject.dept", operator: "eq", value: "eng" },
            { type: "ip", field: "ip", operator: "eq", value: "10.0.0.1" },
          ],
        }),
      );
      const ctx = makeContext({ subjectAttributes: { dept: "other" }, environment: { ip: "10.0.0.1" } });
      expect(engine.evaluate(ctx).granted).toBe(true);
    });
  });

  describe("policy priority ordering", () => {
    it("should evaluate higher priority rules first", () => {
      engine.addPolicy(makeRule({ id: "low", priority: 1, effect: "allow", name: "Low" }));
      engine.addPolicy(makeRule({ id: "high", priority: 100, effect: "deny", name: "High" }));
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(false);
      expect(result.deniedBy?.id).toBe("high");
    });
  });

  describe("audit logging", () => {
    it("should record audit entries", () => {
      engine.addPolicy(makeRule());
      engine.evaluate(makeContext());
      const log = engine.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0]?.granted).toBe(true);
    });

    it("should filter audit log by subject", () => {
      engine.addPolicy(makeRule({ subjects: ["*"] }));
      engine.evaluate(makeContext({ subjectId: "user1" }));
      engine.evaluate(makeContext({ subjectId: "user2" }));
      const log = engine.getAuditLog({ subjectId: "user1" });
      expect(log).toHaveLength(1);
    });

    it("should clear audit log", () => {
      engine.evaluate(makeContext());
      engine.clearAuditLog();
      expect(engine.getAuditLog()).toHaveLength(0);
    });
  });

  describe("policy management", () => {
    it("should remove a policy", () => {
      engine.addPolicy(makeRule());
      engine.removePolicy("rule1");
      const result = engine.evaluate(makeContext());
      expect(result.granted).toBe(false);
    });

    it("should export and import policies", () => {
      engine.addPolicy(makeRule());
      const exported = engine.exportPolicies();

      const engine2 = new PolicyEngine({ defaultEffect: "deny" });
      engine2.importPolicies(exported);
      expect(engine2.evaluate(makeContext()).granted).toBe(true);
    });

    it("should batch evaluate", () => {
      engine.addPolicy(makeRule({ subjects: ["*"], resources: ["*"] }));
      const results = engine.evaluateBatch([makeContext(), makeContext({ subjectId: "user2" })]);
      expect(results).toHaveLength(2);
      expect(results[0]?.granted).toBe(true);
      expect(results[1]?.granted).toBe(true);
    });
  });
});
