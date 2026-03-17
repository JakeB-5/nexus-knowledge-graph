"use client";

import React, { useState } from "react";
import Link from "next/link";

const WORKSPACE = {
  id: "1",
  name: "AI Research Hub",
  description: "Centralized knowledge base for artificial intelligence research papers, experiments, and findings.",
  createdAt: "January 12, 2025",
  owner: "Sarah Chen",
  nodeCount: 842,
  edgeCount: 2341,
  memberCount: 12,
  visibility: "team",
};

const MOCK_NODES = [
  { id: "n1", title: "Transformer Architecture", type: "Concept", tags: ["AI", "NLP"], updatedAt: "1h ago" },
  { id: "n2", title: "Attention Mechanism", type: "Concept", tags: ["AI", "Deep Learning"], updatedAt: "3h ago" },
  { id: "n3", title: "GPT-4 Technical Report", type: "Paper", tags: ["LLM", "OpenAI"], updatedAt: "5h ago" },
  { id: "n4", title: "Scaling Laws for Neural Networks", type: "Paper", tags: ["Research"], updatedAt: "1d ago" },
  { id: "n5", title: "RLHF: Learning from Human Feedback", type: "Method", tags: ["Training"], updatedAt: "2d ago" },
  { id: "n6", title: "Constitutional AI", type: "Method", tags: ["Safety", "Anthropic"], updatedAt: "3d ago" },
  { id: "n7", title: "Vector Databases Overview", type: "Concept", tags: ["Infrastructure"], updatedAt: "4d ago" },
  { id: "n8", title: "Retrieval Augmented Generation", type: "Method", tags: ["RAG", "LLM"], updatedAt: "5d ago" },
];

const MOCK_MEMBERS = [
  { id: "m1", name: "Sarah Chen", email: "sarah@example.com", role: "Owner", avatar: "S", joinedAt: "Jan 12, 2025" },
  { id: "m2", name: "Marcus Williams", email: "marcus@example.com", role: "Editor", avatar: "M", joinedAt: "Jan 15, 2025" },
  { id: "m3", name: "Priya Patel", email: "priya@example.com", role: "Editor", avatar: "P", joinedAt: "Jan 18, 2025" },
  { id: "m4", name: "James Rodriguez", email: "james@example.com", role: "Viewer", avatar: "J", joinedAt: "Feb 1, 2025" },
  { id: "m5", name: "Emma Thompson", email: "emma@example.com", role: "Editor", avatar: "E", joinedAt: "Feb 8, 2025" },
];

const ACTIVITY_ITEMS = [
  { id: "a1", actor: "Sarah Chen", action: "created node", target: "Constitutional AI", time: "1h ago", type: "create" },
  { id: "a2", actor: "Marcus Williams", action: "linked", target: "GPT-4 → Transformer Architecture", time: "3h ago", type: "edge" },
  { id: "a3", actor: "Priya Patel", action: "updated node", target: "Attention Mechanism", time: "5h ago", type: "update" },
  { id: "a4", actor: "Emma Thompson", action: "added comment on", target: "Scaling Laws", time: "1d ago", type: "comment" },
  { id: "a5", actor: "James Rodriguez", action: "joined workspace", target: "", time: "2d ago", type: "join" },
  { id: "a6", actor: "Sarah Chen", action: "deleted node", target: "Old Research Notes", time: "3d ago", type: "delete" },
];

const TYPE_COLORS: Record<string, string> = {
  Concept: "bg-blue-100 text-blue-700",
  Paper: "bg-purple-100 text-purple-700",
  Method: "bg-green-100 text-green-700",
  Tool: "bg-orange-100 text-orange-700",
};

const ACTIVITY_ICONS: Record<string, string> = {
  create: "bg-green-100 text-green-600",
  edge: "bg-nexus-100 text-nexus-600",
  update: "bg-blue-100 text-blue-600",
  comment: "bg-purple-100 text-purple-600",
  join: "bg-yellow-100 text-yellow-600",
  delete: "bg-red-100 text-red-600",
};

const TABS = ["Nodes", "Graph", "Members", "Activity", "Settings"] as const;
type Tab = (typeof TABS)[number];

const ROLE_COLORS: Record<string, string> = {
  Owner: "bg-nexus-100 text-nexus-700",
  Editor: "bg-purple-100 text-purple-700",
  Viewer: "bg-gray-100 text-gray-600",
};

function NodesTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 5;

  const filtered = MOCK_NODES.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
          </svg>
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-3 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Node
        </button>
      </div>

      <div className="space-y-2">
        {paged.map((node) => (
          <div key={node.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-nexus-200 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-nexus-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{node.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
                    {node.type}
                  </span>
                  {node.tags.map((tag) => (
                    <span key={tag} className="text-xs text-gray-400">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>
            <span className="text-xs text-gray-400">{node.updatedAt}</span>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">{total} nodes</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GraphTab() {
  return (
    <div className="flex flex-col items-center justify-center h-80 bg-gradient-to-br from-nexus-50 to-purple-50 rounded-2xl border border-nexus-100">
      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-nexus-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      </div>
      <p className="text-gray-700 font-medium mb-1">Graph Visualization</p>
      <p className="text-gray-400 text-sm mb-4">Interactive graph view coming soon</p>
      <Link
        href="/visualize"
        className="inline-flex items-center gap-2 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
      >
        Open in Explorer
      </Link>
    </div>
  );
}

function MembersTab() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{MOCK_MEMBERS.length} members</p>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
          Invite Member
        </button>
      </div>

      {showInvite && (
        <div className="mb-4 p-4 bg-nexus-50 border border-nexus-200 rounded-xl">
          <p className="text-sm font-medium text-gray-700 mb-2">Invite by email</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
            <button className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
              Send
            </button>
            <button onClick={() => setShowInvite(false)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {MOCK_MEMBERS.map((member) => (
          <div key={member.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-sm font-bold">
                {member.avatar}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{member.name}</p>
                <p className="text-xs text-gray-400">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:block">Joined {member.joinedAt}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role]}`}>
                {member.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="space-y-3">
      {ACTIVITY_ITEMS.map((item) => (
        <div key={item.id} className="flex items-start gap-3 p-4 bg-white border border-gray-100 rounded-xl">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${ACTIVITY_ICONS[item.type]}`}>
            {item.actor[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{item.actor}</span>{" "}
              {item.action}{" "}
              {item.target && <span className="font-medium text-nexus-600">{item.target}</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Nodes");

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/workspaces" className="hover:text-nexus-600 transition-colors">Workspaces</Link>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-gray-700 font-medium">{WORKSPACE.name}</span>
        </nav>

        {/* Header */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-nexus-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{WORKSPACE.name}</h1>
                <p className="text-gray-500 text-sm mt-1 max-w-xl">{WORKSPACE.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>Owner: <span className="text-gray-600 font-medium">{WORKSPACE.owner}</span></span>
                  <span>Created {WORKSPACE.createdAt}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/workspaces/${WORKSPACE.id}/settings`}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
            {[
              { label: "Nodes", value: WORKSPACE.nodeCount.toLocaleString() },
              { label: "Edges", value: WORKSPACE.edgeCount.toLocaleString() },
              { label: "Members", value: WORKSPACE.memberCount },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "bg-nexus-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "Nodes" && <NodesTab />}
          {activeTab === "Graph" && <GraphTab />}
          {activeTab === "Members" && <MembersTab />}
          {activeTab === "Activity" && <ActivityTab />}
          {activeTab === "Settings" && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <p className="text-gray-500 text-sm">
                Go to{" "}
                <Link href={`/workspaces/${WORKSPACE.id}/settings`} className="text-nexus-600 hover:underline">
                  workspace settings
                </Link>{" "}
                to manage this workspace.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
