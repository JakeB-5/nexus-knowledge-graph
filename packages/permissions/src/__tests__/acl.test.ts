import { describe, it, expect, beforeEach } from "vitest";
import { ACL } from "../acl.js";
import { RBAC } from "../rbac.js";
import { Permission } from "../types.js";

describe("ACL", () => {
  let acl: ACL;

  beforeEach(() => {
    acl = new ACL();
  });

  describe("grant and check", () => {
    it("should grant permissions and check access", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      const result = acl.check("user1", "resource1", Permission.Read);
      expect(result.granted).toBe(true);
      expect(result.source).toBe("acl");
    });

    it("should deny access when no entry exists", () => {
      const result = acl.check("user1", "resource1", Permission.Read);
      expect(result.granted).toBe(false);
      expect(result.source).toBe("none");
    });

    it("should deny access when entry exists but permission not included", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      const result = acl.check("user1", "resource1", Permission.Write);
      expect(result.granted).toBe(false);
      expect(result.source).toBe("acl");
    });

    it("should grant multiple permissions at once", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read, Permission.Write], "admin");
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(true);
      expect(acl.check("user1", "resource1", Permission.Write).granted).toBe(true);
    });

    it("should merge permissions on repeated grants", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user1", "user", "resource1", "node", [Permission.Write], "admin");
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(true);
      expect(acl.check("user1", "resource1", Permission.Write).granted).toBe(true);
    });
  });

  describe("revoke", () => {
    it("should revoke specific permissions", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read, Permission.Write], "admin");
      acl.revoke("user1", "resource1", [Permission.Write]);
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(true);
      expect(acl.check("user1", "resource1", Permission.Write).granted).toBe(false);
    });

    it("should remove entry when all permissions revoked", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.revoke("user1", "resource1", [Permission.Read]);
      expect(acl.getEntry("user1", "resource1")).toBeUndefined();
    });

    it("should remove entire entry when no permissions specified", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read, Permission.Write], "admin");
      acl.revoke("user1", "resource1");
      expect(acl.getEntry("user1", "resource1")).toBeUndefined();
    });

    it("should not error when revoking from nonexistent entry", () => {
      expect(() => acl.revoke("user1", "resource1")).not.toThrow();
    });
  });

  describe("expiry", () => {
    it("should respect entry expiry", () => {
      const past = new Date(Date.now() - 1000);
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin", past);
      expect(acl.getEntry("user1", "resource1")).toBeUndefined();
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(false);
    });

    it("should allow access for non-expired entry", () => {
      const future = new Date(Date.now() + 60000);
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin", future);
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(true);
    });

    it("should prune expired entries", () => {
      const past = new Date(Date.now() - 1000);
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin", past);
      acl.grant("user2", "user", "resource1", "node", [Permission.Read], "admin");
      const pruned = acl.pruneExpired();
      expect(pruned).toBe(1);
      expect(acl.getResourceEntries("resource1")).toHaveLength(1);
    });
  });

  describe("RBAC fallback", () => {
    it("should fall back to RBAC when no ACL entry", () => {
      const rbac = new RBAC();
      rbac.assignRole("user1", "editor");
      const aclWithRbac = new ACL({ rbac });
      const result = aclWithRbac.check("user1", "resource1", Permission.Write);
      expect(result.granted).toBe(true);
      expect(result.source).toBe("rbac");
    });

    it("should not use RBAC fallback when ACL entry exists", () => {
      const rbac = new RBAC();
      rbac.assignRole("user1", "owner");
      const aclWithRbac = new ACL({ rbac });
      // ACL entry exists with only read
      aclWithRbac.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      // Even though RBAC would grant write, ACL entry takes precedence
      const result = aclWithRbac.check("user1", "resource1", Permission.Write);
      expect(result.granted).toBe(false);
      expect(result.source).toBe("acl");
    });
  });

  describe("inheritance", () => {
    it("should inherit permissions from parent resource", () => {
      const aclWithInherit = new ACL({ inheritFromParent: true });
      aclWithInherit.grant("user1", "user", "workspace1", "workspace", [Permission.Read], "admin");
      aclWithInherit.setParent("node1", "workspace1");
      const result = aclWithInherit.check("user1", "node1", Permission.Read);
      expect(result.granted).toBe(true);
      expect(result.source).toBe("inherited");
    });

    it("should not inherit when inheritFromParent is false", () => {
      acl.grant("user1", "user", "workspace1", "workspace", [Permission.Read], "admin");
      acl.setParent("node1", "workspace1");
      const result = acl.check("user1", "node1", Permission.Read);
      expect(result.granted).toBe(false);
    });

    it("should remove parent relationship", () => {
      const aclWithInherit = new ACL({ inheritFromParent: true });
      aclWithInherit.grant("user1", "user", "workspace1", "workspace", [Permission.Read], "admin");
      aclWithInherit.setParent("node1", "workspace1");
      aclWithInherit.removeParent("node1");
      const result = aclWithInherit.check("user1", "node1", Permission.Read);
      expect(result.granted).toBe(false);
    });
  });

  describe("bulk operations", () => {
    it("should bulk grant to multiple subjects", () => {
      const entries = acl.bulkGrant(
        [
          { subjectId: "user1", subjectType: "user" },
          { subjectId: "user2", subjectType: "user" },
        ],
        "resource1",
        "node",
        [Permission.Read],
        "admin",
      );
      expect(entries).toHaveLength(2);
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(true);
      expect(acl.check("user2", "resource1", Permission.Read).granted).toBe(true);
    });

    it("should bulk revoke from multiple subjects", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user2", "user", "resource1", "node", [Permission.Read], "admin");
      acl.bulkRevoke(["user1", "user2"], "resource1");
      expect(acl.check("user1", "resource1", Permission.Read).granted).toBe(false);
      expect(acl.check("user2", "resource1", Permission.Read).granted).toBe(false);
    });
  });

  describe("entry queries", () => {
    it("should get all entries for a resource", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user2", "user", "resource1", "node", [Permission.Write], "admin");
      expect(acl.getResourceEntries("resource1")).toHaveLength(2);
    });

    it("should get all entries for a subject", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user1", "user", "resource2", "node", [Permission.Write], "admin");
      expect(acl.getSubjectEntries("user1")).toHaveLength(2);
    });

    it("should get subject summary", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user1", "user", "resource2", "node", [Permission.Write], "admin");
      const summary = acl.getSubjectSummary("user1");
      expect(summary["resource1"]).toContain(Permission.Read);
      expect(summary["resource2"]).toContain(Permission.Write);
    });
  });

  describe("copy entries", () => {
    it("should copy entries from one resource to another", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read, Permission.Write], "admin");
      acl.copyEntries("resource1", "resource2", "node");
      expect(acl.check("user1", "resource2", Permission.Read).granted).toBe(true);
      expect(acl.check("user1", "resource2", Permission.Write).granted).toBe(true);
    });
  });

  describe("clearResource", () => {
    it("should clear all entries for a resource", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      acl.grant("user2", "user", "resource1", "node", [Permission.Read], "admin");
      acl.clearResource("resource1");
      expect(acl.getResourceEntries("resource1")).toHaveLength(0);
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize entries", () => {
      acl.grant("user1", "user", "resource1", "node", [Permission.Read], "admin");
      const data = acl.serialize();
      expect(data.entries).toHaveLength(1);

      const acl2 = new ACL();
      acl2.deserialize({
        entries: data.entries.map((e) => ({
          ...e,
          grantedAt: e.grantedAt.toISOString(),
        })),
      });
      expect(acl2.check("user1", "resource1", Permission.Read).granted).toBe(true);
    });
  });
});
