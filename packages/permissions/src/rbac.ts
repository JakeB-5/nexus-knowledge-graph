// Role-Based Access Control (RBAC) implementation

import { Permission, Role, RoleDefinition, ResourceType } from "./types.js";

// Default role definitions with permission sets
const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: "owner",
    permissions: [
      Permission.Read,
      Permission.Write,
      Permission.Delete,
      Permission.Admin,
      Permission.Share,
      Permission.Comment,
    ],
    description: "Full control over the resource",
  },
  {
    name: "editor",
    permissions: [Permission.Read, Permission.Write, Permission.Comment],
    inheritsFrom: ["viewer"],
    description: "Can read, write, and comment",
  },
  {
    name: "viewer",
    permissions: [Permission.Read],
    description: "Read-only access",
  },
  {
    name: "commenter",
    permissions: [Permission.Read, Permission.Comment],
    inheritsFrom: ["viewer"],
    description: "Can read and comment",
  },
];

// Role hierarchy: higher index = higher privilege
const ROLE_HIERARCHY: Role[] = ["viewer", "commenter", "editor", "owner"];

export interface RBACOptions {
  customRoles?: RoleDefinition[];
  strictMode?: boolean; // if true, unknown roles throw; else return false
}

export class RBAC {
  private roles: Map<string, RoleDefinition> = new Map();
  private subjectRoles: Map<string, Set<string>> = new Map(); // subjectId -> role names
  private readonly strictMode: boolean;

  constructor(options: RBACOptions = {}) {
    this.strictMode = options.strictMode ?? false;

    // Load default roles
    for (const role of DEFAULT_ROLE_DEFINITIONS) {
      this.roles.set(role.name, { ...role });
    }

    // Merge custom roles
    if (options.customRoles) {
      for (const role of options.customRoles) {
        this.roles.set(role.name, { ...role });
      }
    }
  }

  /**
   * Define or override a role with given permissions.
   */
  defineRole(definition: RoleDefinition): void {
    this.roles.set(definition.name, { ...definition });
  }

  /**
   * Assign a role to a subject (user/group).
   */
  assignRole(subjectId: string, role: string): void {
    if (this.strictMode && !this.roles.has(role)) {
      throw new Error(`Unknown role: ${role}`);
    }
    if (!this.subjectRoles.has(subjectId)) {
      this.subjectRoles.set(subjectId, new Set());
    }
    this.subjectRoles.get(subjectId)!.add(role);
  }

  /**
   * Revoke a role from a subject.
   */
  revokeRole(subjectId: string, role: string): void {
    this.subjectRoles.get(subjectId)?.delete(role);
  }

  /**
   * Get all roles assigned to a subject, including inherited ones.
   */
  getRoles(subjectId: string): string[] {
    const direct = this.subjectRoles.get(subjectId) ?? new Set<string>();
    const all = new Set<string>(direct);

    for (const roleName of direct) {
      for (const inherited of this.resolveInheritedRoles(roleName)) {
        all.add(inherited);
      }
    }

    return Array.from(all);
  }

  /**
   * Resolve all inherited roles recursively.
   */
  private resolveInheritedRoles(roleName: string, visited = new Set<string>()): string[] {
    if (visited.has(roleName)) return [];
    visited.add(roleName);

    const definition = this.roles.get(roleName);
    if (!definition?.inheritsFrom) return [];

    const inherited: string[] = [];
    for (const parent of definition.inheritsFrom) {
      inherited.push(parent);
      inherited.push(...this.resolveInheritedRoles(parent, visited));
    }
    return inherited;
  }

  /**
   * Get all permissions a subject has via their roles.
   */
  getPermissions(subjectId: string): Permission[] {
    const roles = this.getRoles(subjectId);
    const perms = new Set<Permission>();

    for (const roleName of roles) {
      const def = this.roles.get(roleName);
      if (def) {
        for (const p of def.permissions) {
          perms.add(p);
        }
      }
    }

    return Array.from(perms);
  }

  /**
   * Check if a subject has a specific permission via their roles.
   */
  hasPermission(subjectId: string, permission: Permission): boolean {
    return this.getPermissions(subjectId).includes(permission);
  }

  /**
   * Check if a subject has a specific permission for a given role name (without assigning).
   */
  roleHasPermission(roleName: string, permission: Permission): boolean {
    const allRoles = [roleName, ...this.resolveInheritedRoles(roleName)];
    for (const r of allRoles) {
      const def = this.roles.get(r);
      if (def?.permissions.includes(permission)) return true;
    }
    return false;
  }

  /**
   * Get the highest role for a subject based on the hierarchy.
   */
  getHighestRole(subjectId: string): Role | null {
    const roles = this.getRoles(subjectId);
    let highest: Role | null = null;
    let highestIndex = -1;

    for (const roleName of roles) {
      const idx = ROLE_HIERARCHY.indexOf(roleName as Role);
      if (idx > highestIndex) {
        highestIndex = idx;
        highest = roleName as Role;
      }
    }

    return highest;
  }

  /**
   * Check if subjectA has higher or equal privileges than subjectB.
   */
  isHigherOrEqual(subjectId: string, thanRole: Role): boolean {
    const highest = this.getHighestRole(subjectId);
    if (!highest) return false;
    return ROLE_HIERARCHY.indexOf(highest) >= ROLE_HIERARCHY.indexOf(thanRole);
  }

  /**
   * Get role definition.
   */
  getRoleDefinition(roleName: string): RoleDefinition | undefined {
    return this.roles.get(roleName);
  }

  /**
   * List all defined role names.
   */
  listRoles(): string[] {
    return Array.from(this.roles.keys());
  }

  /**
   * Remove a subject and all their role assignments.
   */
  removeSubject(subjectId: string): void {
    this.subjectRoles.delete(subjectId);
  }

  /**
   * Get all subjects assigned to a specific role.
   */
  getSubjectsWithRole(roleName: string): string[] {
    const result: string[] = [];
    for (const [subjectId, roles] of this.subjectRoles.entries()) {
      if (roles.has(roleName)) {
        result.push(subjectId);
      }
    }
    return result;
  }

  /**
   * Get permissions defined directly on a role (without inheritance).
   */
  getDirectRolePermissions(roleName: string): Permission[] {
    return this.roles.get(roleName)?.permissions ?? [];
  }

  /**
   * Serialize RBAC state.
   */
  serialize(): { roles: RoleDefinition[]; assignments: Array<{ subjectId: string; roles: string[] }> } {
    return {
      roles: Array.from(this.roles.values()),
      assignments: Array.from(this.subjectRoles.entries()).map(([subjectId, roles]) => ({
        subjectId,
        roles: Array.from(roles),
      })),
    };
  }

  /**
   * Restore RBAC state from serialized data.
   */
  deserialize(data: ReturnType<RBAC["serialize"]>): void {
    this.roles.clear();
    this.subjectRoles.clear();

    for (const role of data.roles) {
      this.roles.set(role.name, role);
    }
    for (const { subjectId, roles } of data.assignments) {
      this.subjectRoles.set(subjectId, new Set(roles));
    }
  }
}

export { DEFAULT_ROLE_DEFINITIONS, ROLE_HIERARCHY };
