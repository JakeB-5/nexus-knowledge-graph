"use client";

import React, { useState } from "react";
import Link from "next/link";

const MOCK_COLLECTIONS = [
  { id: "1", title: "AI Research", description: "Papers and notes on artificial intelligence and machine learning.", nodeCount: 142, collaborators: ["A", "B", "C"], color: "bg-nexus-500", updatedAt: "2h ago" },
  { id: "2", title: "Philosophy", description: "Classical and contemporary philosophical texts and concepts.", nodeCount: 89, collaborators: ["D", "E"], color: "bg-purple-500", updatedAt: "1d ago" },
  { id: "3", title: "Project Atlas", description: "Internal project planning and documentation nodes.", nodeCount: 57, collaborators: ["A", "F", "G", "H"], color: "bg-green-500", updatedAt: "3d ago" },
  { id: "4", title: "Reading List", description: "Books, articles, and papers I want to read.", nodeCount: 201, collaborators: ["A"], color: "bg-orange-500", updatedAt: "5d ago" },
  { id: "5", title: "History of Science", description: "Timeline of scientific discoveries and key figures.", nodeCount: 315, collaborators: ["B", "C", "I"], color: "bg-red-500", updatedAt: "1w ago" },
  { id: "6", title: "Design Systems", description: "UI patterns, components, and design principles.", nodeCount: 74, collaborators: ["J", "K"], color: "bg-pink-500", updatedAt: "2w ago" },
];

const SORT_OPTIONS = ["Recently updated", "Most nodes", "Alphabetical", "Created date"];

function CollaboratorAvatars({ initials }: { initials: string[] }) {
  const shown = initials.slice(0, 4);
  const extra = initials.length - 4;
  return (
    <div className="flex -space-x-2">
      {shown.map((init, i) => (
        <div
          key={i}
          className="w-6 h-6 rounded-full bg-nexus-200 border-2 border-white flex items-center justify-center text-nexus-700 text-[10px] font-semibold"
        >
          {init}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-500 text-[10px] font-semibold">
          +{extra}
        </div>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [showModal, setShowModal] = useState(false);
  const [newCollection, setNewCollection] = useState({ title: "", description: "" });

  const filtered = MOCK_COLLECTIONS.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
            <p className="text-gray-500 text-sm mt-1">{MOCK_COLLECTIONS.length} collections</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-nexus-500 hover:bg-nexus-600 text-white text-sm font-medium rounded-xl transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New collection
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search collections..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-nexus-400"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-700"
          >
            {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((col) => (
            <Link key={col.id} href={`/collections/${col.id}`} className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-nexus-200 transition-all p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${col.color} flex items-center justify-center text-white font-bold text-lg`}>
                  {col.title.charAt(0)}
                </div>
                <span className="text-xs text-gray-400">{col.updatedAt}</span>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-nexus-700 transition mb-1">
                {col.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-4 line-clamp-2">
                {col.description}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="4" cy="6" r="2" />
                    <circle cx="20" cy="6" r="2" />
                    <line x1="12" y1="9" x2="5.5" y2="7" />
                    <line x1="12" y1="9" x2="18.5" y2="7" />
                  </svg>
                  {col.nodeCount} nodes
                </div>
                <CollaboratorAvatars initials={col.collaborators} />
              </div>
            </Link>
          ))}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm font-medium">No collections found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">New collection</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input
                  value={newCollection.title}
                  onChange={(e) => setNewCollection((c) => ({ ...c, title: e.target.value }))}
                  placeholder="e.g. Research Papers"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-nexus-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={newCollection.description}
                  onChange={(e) => setNewCollection((c) => ({ ...c, description: e.target.value }))}
                  placeholder="What is this collection about?"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-nexus-400 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={!newCollection.title.trim()}
                className="flex-1 py-2 text-sm bg-nexus-500 text-white font-medium rounded-xl hover:bg-nexus-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
