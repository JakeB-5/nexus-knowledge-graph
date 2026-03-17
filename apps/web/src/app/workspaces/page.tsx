"use client";

import React, { useState } from "react";
import Link from "next/link";

const MOCK_WORKSPACES = [
  {
    id: "1",
    name: "AI Research Hub",
    description: "Centralized knowledge base for artificial intelligence research papers, experiments, and findings.",
    nodeCount: 842,
    memberAvatars: ["S", "M", "P", "J", "E"],
    updatedAt: "2h ago",
    role: "owner",
    visibility: "team",
  },
  {
    id: "2",
    name: "Product Roadmap",
    description: "Feature planning, user stories, and strategic product direction for Q1-Q2.",
    nodeCount: 234,
    memberAvatars: ["A", "B", "C"],
    updatedAt: "5h ago",
    role: "editor",
    visibility: "private",
  },
  {
    id: "3",
    name: "Competitive Intelligence",
    description: "Market analysis, competitor profiles, and industry trends curated by the strategy team.",
    nodeCount: 519,
    memberAvatars: ["X", "Y", "Z", "W"],
    updatedAt: "1d ago",
    role: "viewer",
    visibility: "team",
  },
  {
    id: "4",
    name: "Engineering Wiki",
    description: "Architecture decisions, runbooks, coding standards, and infrastructure documentation.",
    nodeCount: 1204,
    memberAvatars: ["D", "E", "F", "G", "H"],
    updatedAt: "2d ago",
    role: "editor",
    visibility: "public",
  },
  {
    id: "5",
    name: "Personal Notes",
    description: "Private knowledge graph for personal research, reading notes, and ideas.",
    nodeCount: 88,
    memberAvatars: ["S"],
    updatedAt: "3d ago",
    role: "owner",
    visibility: "private",
  },
  {
    id: "6",
    name: "Design System",
    description: "Component library documentation, design tokens, UX patterns, and brand guidelines.",
    nodeCount: 312,
    memberAvatars: ["L", "K", "N"],
    updatedAt: "1w ago",
    role: "editor",
    visibility: "team",
  },
];

const FILTERS = ["All", "My Workspaces", "Shared with Me"];
const SORT_OPTIONS = ["Last Updated", "Name", "Node Count"];
const VISIBILITY_COLORS: Record<string, string> = {
  private: "bg-gray-100 text-gray-600",
  team: "bg-blue-100 text-blue-700",
  public: "bg-green-100 text-green-700",
};
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-nexus-100 text-nexus-700",
  editor: "bg-purple-100 text-purple-700",
  viewer: "bg-orange-100 text-orange-700",
};

function MemberAvatars({ avatars }: { avatars: string[] }) {
  const shown = avatars.slice(0, 4);
  const extra = avatars.length - 4;
  return (
    <div className="flex -space-x-2">
      {shown.map((letter, i) => (
        <div
          key={i}
          className="w-7 h-7 rounded-full bg-nexus-200 border-2 border-white flex items-center justify-center text-nexus-700 text-[10px] font-bold"
        >
          {letter}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-500 text-[10px] font-bold">
          +{extra}
        </div>
      )}
    </div>
  );
}

function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", visibility: "private" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Create Workspace</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Research Hub"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What is this workspace for?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 bg-white"
            >
              <option value="private">Private - Only invited members</option>
              <option value="team">Team - Everyone in your organization</option>
              <option value="public">Public - Anyone with the link</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            className="flex-1 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
          >
            Create Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Last Updated");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const filtered = MOCK_WORKSPACES.filter((w) => {
    const matchesSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "All" ||
      (filter === "My Workspaces" && w.role === "owner") ||
      (filter === "Shared with Me" && w.role !== "owner");
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sort === "Name") return a.name.localeCompare(b.name);
    if (sort === "Node Count") return b.nodeCount - a.nodeCount;
    return 0;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
            <p className="text-gray-500 text-sm mt-1">
              {MOCK_WORKSPACES.length} workspaces
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-nexus-600 text-white rounded-xl text-sm font-medium hover:bg-nexus-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Workspace
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
            </svg>
            <input
              type="text"
              placeholder="Search workspaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-nexus-600 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Workspace Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No workspaces found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
                className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-nexus-200 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-nexus-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                  </div>
                  <div className="flex gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VISIBILITY_COLORS[workspace.visibility]}`}>
                      {workspace.visibility}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[workspace.role]}`}>
                      {workspace.role}
                    </span>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 group-hover:text-nexus-600 transition-colors mb-1">
                  {workspace.name}
                </h3>
                <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                  {workspace.description}
                </p>

                <div className="flex items-center justify-between">
                  <MemberAvatars avatars={workspace.memberAvatars} />
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="3" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13l-.87.5M4.21 16.5l-.87.5M20.66 16.5l-.87-.5M4.21 7.5l-.87-.5" />
                      </svg>
                      {workspace.nodeCount.toLocaleString()}
                    </span>
                    <span>{workspace.updatedAt}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showModal && <CreateWorkspaceModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
