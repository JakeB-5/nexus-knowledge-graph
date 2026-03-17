"use client";

import { useState } from "react";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { Modal } from "@/components/modal";
import { formatDate, formatRelativeTime, getInitials, cn } from "@/lib/utils";

type Role = "admin" | "editor" | "viewer";
type Status = "active" | "inactive";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  joinedAt: string;
  lastActiveAt: string;
}

const MOCK_USERS: UserRow[] = [
  { id: "u1", name: "Sarah Chen", email: "sarah@nexus.app", role: "admin", status: "active", joinedAt: "2024-01-15T09:00:00Z", lastActiveAt: new Date(Date.now() - 5 * 60_000).toISOString() },
  { id: "u2", name: "Marcus Williams", email: "marcus@nexus.app", role: "editor", status: "active", joinedAt: "2024-02-01T10:30:00Z", lastActiveAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "u3", name: "Priya Patel", email: "priya@nexus.app", role: "editor", status: "active", joinedAt: "2024-02-14T14:00:00Z", lastActiveAt: new Date(Date.now() - 1 * 24 * 3600_000).toISOString() },
  { id: "u4", name: "James Rodriguez", email: "james@nexus.app", role: "viewer", status: "active", joinedAt: "2024-03-01T08:00:00Z", lastActiveAt: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() },
  { id: "u5", name: "Emma Thompson", email: "emma@nexus.app", role: "viewer", status: "inactive", joinedAt: "2024-03-15T16:00:00Z", lastActiveAt: new Date(Date.now() - 14 * 24 * 3600_000).toISOString() },
  { id: "u6", name: "Oliver Kim", email: "oliver@nexus.app", role: "editor", status: "active", joinedAt: "2024-04-01T11:00:00Z", lastActiveAt: new Date(Date.now() - 30 * 60_000).toISOString() },
  { id: "u7", name: "Aisha Johnson", email: "aisha@nexus.app", role: "viewer", status: "active", joinedAt: "2024-04-10T13:00:00Z", lastActiveAt: new Date(Date.now() - 6 * 3600_000).toISOString() },
  { id: "u8", name: "Luca Bianchi", email: "luca@nexus.app", role: "viewer", status: "inactive", joinedAt: "2024-05-01T09:00:00Z", lastActiveAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() },
  { id: "u9", name: "Yuki Tanaka", email: "yuki@nexus.app", role: "editor", status: "active", joinedAt: "2024-05-20T10:00:00Z", lastActiveAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "u10", name: "Ana Müller", email: "ana@nexus.app", role: "admin", status: "active", joinedAt: "2024-06-01T08:00:00Z", lastActiveAt: new Date(Date.now() - 10 * 60_000).toISOString() },
  { id: "u11", name: "David Park", email: "david@nexus.app", role: "viewer", status: "active", joinedAt: "2024-06-15T14:00:00Z", lastActiveAt: new Date(Date.now() - 4 * 24 * 3600_000).toISOString() },
  { id: "u12", name: "Sofia Rossi", email: "sofia@nexus.app", role: "editor", status: "active", joinedAt: "2024-07-01T09:00:00Z", lastActiveAt: new Date(Date.now() - 1 * 3600_000).toISOString() },
];

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-100 text-red-700",
  editor: "bg-nexus-100 text-nexus-700",
  viewer: "bg-gray-100 text-gray-600",
};

const AVATAR_COLORS = [
  "bg-nexus-600", "bg-green-600", "bg-purple-600", "bg-yellow-600",
  "bg-red-600", "bg-teal-600", "bg-pink-600", "bg-orange-600",
];

const PAGE_SIZE = 10;

function RoleSelect({ userId, current, onChange }: { userId: string; current: Role; onChange: (id: string, role: Role) => void }) {
  return (
    <select
      value={current}
      onChange={(e) => onChange(userId, e.target.value as Role)}
      className={cn(
        "rounded-full border-0 py-0.5 pl-2 pr-6 text-xs font-medium focus:ring-2 focus:ring-nexus-300 focus:outline-none",
        ROLE_COLORS[current]
      )}
    >
      <option value="admin">Admin</option>
      <option value="editor">Editor</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleRoleChange(id: string, role: Role) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  function handleToggleStatus(id: string) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u
      )
    );
  }

  function handleInvite() {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("viewer");
  }

  const COLUMNS: ColumnDef<UserRow>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      render: (row) => {
        const colorIdx = parseInt(row.id.replace("u", ""), 10) % AVATAR_COLORS.length;
        return (
          <div className="flex items-center gap-3">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", AVATAR_COLORS[colorIdx])}>
              {getInitials(row.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{row.name}</p>
              <p className="text-xs text-gray-500 truncate">{row.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      width: "130px",
      render: (row) => (
        <RoleSelect userId={row.id} current={row.role} onChange={handleRoleChange} />
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: "110px",
      render: (row) => (
        <button
          onClick={() => handleToggleStatus(row.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            row.status === "active"
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          )}
          title={`Click to mark as ${row.status === "active" ? "inactive" : "active"}`}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", row.status === "active" ? "bg-green-500" : "bg-gray-400")} />
          {row.status}
        </button>
      ),
    },
    {
      key: "joinedAt",
      header: "Joined",
      sortable: true,
      width: "130px",
      render: (row) => <span className="text-xs text-gray-500">{formatDate(row.joinedAt)}</span>,
    },
    {
      key: "lastActiveAt",
      header: "Last Active",
      sortable: true,
      width: "120px",
      render: (row) => <span className="text-xs text-gray-500">{formatRelativeTime(row.lastActiveAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "60px",
      render: (_row) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Remove user"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.filter((u) => u.status === "active").length} active of {users.length} total members
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-nexus-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nexus-700 transition-colors self-start sm:self-auto"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          Invite User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search users…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          className="sm:w-72"
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value as "all" | Role); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as "all" | Status); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={paginated}
        emptyMessage="No users match your filters."
      />

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
      />

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite User"
        description="Send an invitation email to a new team member."
        footer={
          <>
            <button
              onClick={() => setInviteOpen(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim()}
              className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Invitation
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1.5 block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            >
              <option value="viewer">Viewer — read-only access</option>
              <option value="editor">Editor — can create and edit nodes</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          <div className="rounded-lg bg-nexus-50 border border-nexus-100 px-4 py-3">
            <p className="text-xs text-nexus-700">
              The user will receive an email with a link to set up their account. The invitation expires in 7 days.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
