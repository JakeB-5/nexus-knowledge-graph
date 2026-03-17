import { describe, it, expect, beforeEach } from "vitest";
import { RBAC } from "../rbac.js";
import { Permission } from "../types.js";

describe("RBAC", () => {
  let rbac: RBAC;

  beforeEach(() => {
    rbac = new RBAC();
  });

  describe("default roles", () => {
    it("should define owner with all permissions", () => {
      rbac.assignRole("user1", "owner");
      expect(rbac.hasPermission("user1", Permission.Read)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Write)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Delete)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Admin)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Share)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Comment)).toBe(true);
    });

    it("should define editor with read, write, comment", () => {
      rbac.assignRole("user1", "editor");
      expect(rbac.hasPermission("user1", Permission.Read)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Write)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Comment)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Delete)).toBe(false);
      expect(rbac.hasPermission("user1", Permission.Admin)).toBe(false);
    });

    it("should define viewer with read only", () => {
      rbac.assignRole("user1", "viewer");
      expect(rbac.hasPermission("user1", Permission.Read)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Write)).toBe(false);
      expect(rbac.hasPermission("user1", Permission.Comment)).toBe(false);
    });

    it("should define commenter with read and comment", () => {
      rbac.assignRole("user1", "commenter");
      expect(rbac.hasPermission("user1", Permission.Read)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Comment)).toBe(true);
      expect(rbac.hasPermission("user1", Permission.Write)).toBe(false);
    });
  });

  describe("role assignment", () => {
    it("should assign role to user", () => {
      rbac.assignRole("user1", "editor");
      expect(rbac.getRoles("user1")).toContain("editor");
    });

    it("should assign multiple roles to user", () => {
      rbac.assignRole("user1", "editor");
      rbac.assignRole("user1", "commenter");
      const roles = rbac.getRoles("user1");
      expect(roles).toContain("editor");
      expect(roles).toContain("commenter");
    });

    it("should revoke role from user", () => {
      rbac.assignRole("user1", "editor");
      rbac.revokeRole("user1", "editor");
      expect(rbac.getRoles("user1")).not.toContain("editor");
    });

    it("should not error when revoking nonexistent role", () => {
      expect(() => rbac.revokeRole("user1", "editor")).not.toThrow();
    });

    it("should return empty roles for unknown user", () => {
      expect(rbac.getRoles("unknown")).toEqual([]);
    });
  });

  describe("role hierarchy", () => {
    it("should include inherited roles in getRoles", () => {
      rbac.assignRole("user1", "editor");
      const roles = rbac.getRoles("user1");
      // editor inheritsFrom viewer
      expect(roles).toContain("viewer");
    });

    it("should include permissions from inherited roles", () => {
      rbac.assignRole("user1", "commenter");
      // commenter inheritsFrom viewer, viewer has read
      expect(rbac.hasPermission("user1", Permission.Read)).toBe(true);
    });

    it("should get highest role correctly", () => {
      rbac.assignRole("user1", "viewer");
      rbac.assignRole("user1", "editor");
      expect(rbac.getHighestRole("user1")).toBe("editor");
    });

    it("should return null highest role for user with no roles", () => {
      expect(rbac.getHighestRole("user1")).toBeNull();
    });

    it("should correctly check isHigherOrEqual", () => {
      rbac.assignRole("user1", "editor");
      expect(rbac.isHigherOrEqual("user1", "viewer")).toBe(true);
      expect(rbac.isHigherOrEqual("user1", "editor")).toBe(true);
      expect(rbac.isHigherOrEqual("user1", "owner")).toBe(false);
    });
  });

  describe("custom roles", () => {
    it("should define a custom role", () => {
      rbac.defineRole({
        name: "viewer", // reuse existing key for custom override
        permissions: [Permission.Read, Permission.Share],
        description: "Custom viewer",
      });
      rbac.assignRole("user1", "viewer");
      expect(rbac.hasPermission("user1", Permission.Share)).toBe(true);
    });

    it("should support custom roles at constructor time", () => {
      const customRbac = new RBAC({
        customRoles: [
          {
            name: "owner", // override owner
            permissions: [Permission.Read],
            description: "Read-only owner",
          },
        ],
      });
      customRbac.assignRole("user1", "owner");
      expect(customRbac.hasPermission("user1", Permission.Write)).toBe(false);
      expect(customRbac.hasPermission("user1", Permission.Read)).toBe(true);
    });

    it("should support roleHasPermission without assignment", () => {
      expect(rbac.roleHasPermission("editor", Permission.Write)).toBe(true);
      expect(rbac.roleHasPermission("viewer", Permission.Write)).toBe(false);
    });
  });

  describe("permissions aggregation", () => {
    it("should aggregate permissions from multiple roles", () => {
      rbac.assignRole("user1", "viewer");
      rbac.assignRole("user1", "commenter");
      const perms = rbac.getPermissions("user1");
      expect(perms).toContain(Permission.Read);
      expect(perms).toContain(Permission.Comment);
    });

    it("should not duplicate permissions from overlapping roles", () => {
      rbac.assignRole("user1", "editor");
      rbac.assignRole("user1", "viewer");
      const perms = rbac.getPermissions("user1");
      const readCount = perms.filter((p) => p === Permission.Read).length;
      expect(readCount).toBe(1);
    });
  });

  describe("subject management", () => {
    it("should remove subject", () => {
      rbac.assignRole("user1", "editor");
      rbac.removeSubject("user1");
      expect(rbac.getRoles("user1")).toEqual([]);
    });

    it("should get subjects with role", () => {
      rbac.assignRole("user1", "editor");
      rbac.assignRole("user2", "editor");
      rbac.assignRole("user3", "viewer");
      const editors = rbac.getSubjectsWithRole("editor");
      expect(editors).toContain("user1");
      expect(editors).toContain("user2");
      expect(editors).not.toContain("user3");
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize state", () => {
      rbac.assignRole("user1", "editor");
      rbac.assignRole("user2", "viewer");
      const data = rbac.serialize();

      const rbac2 = new RBAC();
      rbac2.deserialize(data);

      expect(rbac2.hasPermission("user1", Permission.Write)).toBe(true);
      expect(rbac2.hasPermission("user2", Permission.Write)).toBe(false);
    });
  });

  describe("strict mode", () => {
    it("should throw on unknown role in strict mode", () => {
      const strictRbac = new RBAC({ strictMode: true });
      expect(() => strictRbac.assignRole("user1", "nonexistent")).toThrow("Unknown role");
    });
  });
});
