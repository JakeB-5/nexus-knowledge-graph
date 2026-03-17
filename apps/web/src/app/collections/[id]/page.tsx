"use client";

import React, { useState } from "react";
import Link from "next/link";

const MOCK_COLLECTION = {
  id: "1",
  title: "AI Research",
  description: "Papers and notes on artificial intelligence and machine learning concepts, research findings, and emerging trends.",
  nodeCount: 142,
  color: "bg-nexus-500",
  createdAt: "Jan 15, 2024",
  updatedAt: "2 hours ago",
};

const MOCK_COLLABORATORS = [
  { id: "u1", name: "Jane Smith", role: "Owner", initial: "J" },
  { id: "u2", name: "Alex Chen", role: "Editor", initial: "A" },
  { id: "u3", name: "Maria Garcia", role: "Viewer", initial: "M" },
  { id: "u4", name: "Sam Lee", role: "Editor", initial: "S" },
];

const MOCK_NODES = [
  { id: "n1", title: "Transformer Architecture", type: "Article", tags: ["ml", "nlp"], connections: 12 },
  { id: "n2", title: "Attention Mechanism", type: "Concept", tags: ["ml", "deep-learning"], connections: 8 },
  { id: "n3", title: "GPT-4 Technical Report", type: "Paper", tags: ["llm", "openai"], connections: 21 },
  { id: "n4", title: "Reinforcement Learning from Human Feedback", type: "Concept", tags: ["rlhf", "alignment"], connections: 15 },
  { id: "n5", title: "Constitutional AI", type: "Paper", tags: ["safety", "anthropic"], connections: 9 },
  { id: "n6", title: "Scaling Laws for Neural Language Models", type: "Paper", tags: ["scaling", "research"], connections: 17 },
];

const ROLE_COLORS: Record<string, string> = {
  Owner: "bg-nexus-100 text-nexus-700",
  Editor: "bg-green-100 text-green-700",
  Viewer: "bg-gray-100 text-gray-600",
};

const TYPE_COLORS: Record<string, string> = {
  Article: "bg-blue-100 text-blue-700",
  Concept: "bg-purple-100 text-purple-700",
  Paper: "bg-orange-100 text-orange-700",
  Note: "bg-yellow-100 text-yellow-700",
};

export default function CollectionDetailPage() {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(MOCK_COLLECTION.title);
  const [description, setDescription] = useState(MOCK_COLLECTION.description);
  const [tempTitle, setTempTitle] = useState(title);
  const [tempDesc, setTempDesc] = useState(description);
  const [showAddNode, setShowAddNode] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("Viewer");

  const saveEdit = () => {
    setTitle(tempTitle);
    setDescription(tempDesc);
    setEditing(false);
  };

  const cancelEdit = () => {
    setTempTitle(title);
    setTempDesc(description);
    setEditing(false);
  };

  const filteredNodes = MOCK_NODES.filter((n) =>
    n.title.toLowerCase().includes(nodeSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/collections" className="hover:text-gray-600 transition">Collections</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-700 font-medium">{title}</span>
        </div>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl ${MOCK_COLLECTION.color} flex items-center justify-center text-white font-bold text-xl shrink-0`}>
              {title.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-3">
                  <input
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    className="w-full text-lg font-semibold border border-nexus-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-900"
                  />
                  <textarea
                    value={tempDesc}
                    onChange={(e) => setTempDesc(e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-600 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="px-4 py-1.5 bg-nexus-500 text-white text-sm rounded-lg hover:bg-nexus-600 transition">Save</button>
                    <button onClick={cancelEdit} className="px-4 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                    <button onClick={() => { setEditing(true); setTempTitle(title); setTempDesc(description); }} className="text-gray-400 hover:text-gray-600 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-3">{description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{MOCK_COLLECTION.nodeCount} nodes</span>
                    <span>Created {MOCK_COLLECTION.createdAt}</span>
                    <span>Updated {MOCK_COLLECTION.updatedAt}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Nodes list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800">Nodes ({filteredNodes.length})</h2>
                <button
                  onClick={() => setShowAddNode(true)}
                  className="flex items-center gap-1.5 text-xs text-nexus-600 hover:text-nexus-800 font-medium transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add node
                </button>
              </div>

              <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                  placeholder="Search nodes..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-nexus-400"
                />
              </div>

              <div className="space-y-2">
                {filteredNodes.map((node) => (
                  <div key={node.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-nexus-50 flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-nexus-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{node.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}>
                          {node.type}
                        </span>
                        {node.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-xs text-gray-400">#{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {node.connections}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini graph preview */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Graph preview</h2>
              <div className="h-40 rounded-xl bg-gradient-to-br from-nexus-50 to-nexus-100 flex items-center justify-center border border-nexus-100">
                <div className="text-center">
                  <svg className="w-10 h-10 text-nexus-300 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="4" cy="6" r="2" />
                    <circle cx="20" cy="6" r="2" />
                    <circle cx="4" cy="18" r="2" />
                    <circle cx="20" cy="18" r="2" />
                    <line x1="12" y1="9" x2="5.5" y2="7" />
                    <line x1="12" y1="9" x2="18.5" y2="7" />
                    <line x1="12" y1="15" x2="5.5" y2="17" />
                    <line x1="12" y1="15" x2="18.5" y2="17" />
                  </svg>
                  <p className="text-xs text-nexus-400">Graph visualization</p>
                  <button className="mt-2 text-xs text-nexus-600 hover:text-nexus-800 font-medium transition">
                    Open full graph
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Collaborators */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800">Collaborators</h2>
                <span className="text-xs text-gray-400">{MOCK_COLLABORATORS.length} members</span>
              </div>
              <div className="space-y-3">
                {MOCK_COLLABORATORS.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-sm font-semibold shrink-0">
                      {c.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ROLE_COLORS[c.role]}`}>
                      {c.role}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowShare(true)}
                className="mt-4 w-full py-2 text-sm text-nexus-600 border border-nexus-200 rounded-xl hover:bg-nexus-50 font-medium transition"
              >
                Invite member
              </button>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Details</h2>
              <div className="space-y-3">
                {[
                  { label: "Total nodes", value: "142" },
                  { label: "Total edges", value: "387" },
                  { label: "Node types", value: "4" },
                  { label: "Last activity", value: "2h ago" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-gray-400">{label}</span>
                    <span className="text-xs font-semibold text-gray-700">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Share collection</h2>
              <button onClick={() => setShowShare(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-2 mb-5">
              <input
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-nexus-400"
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-700"
              >
                <option>Viewer</option>
                <option>Editor</option>
              </select>
              <button
                disabled={!shareEmail.trim()}
                className="px-4 py-2 bg-nexus-500 text-white text-sm rounded-xl hover:bg-nexus-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Invite
              </button>
            </div>
            <div className="space-y-2">
              {MOCK_COLLABORATORS.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50">
                  <div className="w-7 h-7 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-xs font-semibold">
                    {c.initial}
                  </div>
                  <p className="flex-1 text-sm text-gray-700">{c.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[c.role]}`}>{c.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
