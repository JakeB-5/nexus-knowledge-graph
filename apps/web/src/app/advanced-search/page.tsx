"use client";

import React, { useState } from "react";

const NODE_TYPES = ["Concept", "Paper", "Person", "Organization", "Event", "Method", "Tool", "Place"];
const EDGE_TYPES = ["Cites", "Supports", "Contradicts", "Builds On", "Related To", "Created By", "Part Of"];
const ALL_TAGS = ["AI", "NLP", "Research", "Design", "Engineering", "Science", "History", "Philosophy", "Business"];
const OWNERS = ["Sarah Chen", "Marcus Williams", "Priya Patel", "James Rodriguez", "Emma Thompson"];
const SORT_OPTIONS = ["Relevance", "Date Created", "Last Updated", "Title A-Z", "Most Connections"];

const MOCK_RESULTS = [
  { id: "r1", title: "Transformer Architecture", type: "Concept", owner: "Sarah Chen", tags: ["AI", "NLP"], connections: 34, updatedAt: "1h ago", excerpt: "The transformer architecture is a deep learning model that adopts the mechanism of self-attention..." },
  { id: "r2", title: "Attention Mechanism", type: "Concept", owner: "Sarah Chen", tags: ["AI", "Deep Learning"], connections: 28, updatedAt: "3h ago", excerpt: "The attention mechanism allows models to focus on relevant parts of the input sequence..." },
  { id: "r3", title: "GPT-4 Technical Report", type: "Paper", owner: "Marcus Williams", tags: ["LLM", "AI"], connections: 19, updatedAt: "5h ago", excerpt: "GPT-4 is a large multimodal model that accepts image and text inputs and produces text outputs..." },
  { id: "r4", title: "Scaling Laws for Neural Language Models", type: "Paper", owner: "Priya Patel", tags: ["Research", "AI"], connections: 42, updatedAt: "1d ago", excerpt: "We study empirical scaling laws for language model performance on the cross-entropy loss..." },
  { id: "r5", title: "Constitutional AI: Harmlessness from AI Feedback", type: "Method", owner: "James Rodriguez", tags: ["AI", "Safety"], connections: 15, updatedAt: "2d ago", excerpt: "We propose a method to make AI systems more helpful, harmless, and honest..." },
  { id: "r6", title: "Retrieval Augmented Generation", type: "Method", owner: "Emma Thompson", tags: ["RAG", "LLM"], connections: 22, updatedAt: "3d ago", excerpt: "RAG combines the parametric knowledge of language models with non-parametric retrieval..." },
];

const TYPE_COLORS: Record<string, string> = {
  Concept: "bg-blue-100 text-blue-700",
  Paper: "bg-purple-100 text-purple-700",
  Method: "bg-green-100 text-green-700",
  Person: "bg-orange-100 text-orange-700",
  Organization: "bg-red-100 text-red-700",
  Event: "bg-yellow-100 text-yellow-700",
  Tool: "bg-teal-100 text-teal-700",
  Place: "bg-pink-100 text-pink-700",
};

const SAVED_SEARCHES = [
  { id: "s1", name: "Recent AI Papers", description: "Papers tagged AI from last 7 days" },
  { id: "s2", name: "My Concepts", description: "Concepts owned by me" },
];

function TagMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer flex items-center justify-between min-h-[38px]"
      >
        {selected.length === 0 ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selected.map((s) => (
              <span key={s} className="text-xs bg-nexus-100 text-nexus-700 px-2 py-0.5 rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-2 max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => {
                  onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
                }}
                className="accent-nexus-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdvancedSearchPage() {
  const [titleContains, setTitleContains] = useState("");
  const [contentContains, setContentContains] = useState("");
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
  const [selectedEdgeTypes, setSelectedEdgeTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minConnections, setMinConnections] = useState("");
  const [maxConnections, setMaxConnections] = useState("");
  const [sortBy, setSortBy] = useState("Relevance");
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");

  const PER_PAGE = 4;
  const totalPages = Math.ceil(MOCK_RESULTS.length / PER_PAGE);
  const pagedResults = MOCK_RESULTS.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleSearch() {
    setSearched(true);
    setPage(1);
  }

  function handleReset() {
    setTitleContains("");
    setContentContains("");
    setSelectedNodeTypes([]);
    setSelectedEdgeTypes([]);
    setSelectedTags([]);
    setSelectedOwners([]);
    setDateFrom("");
    setDateTo("");
    setMinConnections("");
    setMaxConnections("");
    setSortBy("Relevance");
    setSearched(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Advanced Search</h1>
            <p className="text-gray-500 text-sm mt-1">Build precise queries across your entire knowledge graph</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Query Builder Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Query Builder</h2>

              {/* Title */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Title contains</label>
                <input
                  type="text"
                  value={titleContains}
                  onChange={(e) => setTitleContains(e.target.value)}
                  placeholder="e.g. neural network"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
                />
              </div>

              {/* Content */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Content contains</label>
                <input
                  type="text"
                  value={contentContains}
                  onChange={(e) => setContentContains(e.target.value)}
                  placeholder="e.g. attention mechanism"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
                />
              </div>

              {/* Node Types */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">Node Types</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {NODE_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedNodeTypes.includes(type)}
                        onChange={() =>
                          setSelectedNodeTypes((prev) =>
                            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                          )
                        }
                        className="accent-nexus-600"
                      />
                      <span className="text-xs text-gray-600">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">Date Range</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-nexus-500"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-nexus-500"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
                <TagMultiSelect
                  options={ALL_TAGS}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="Select tags..."
                />
              </div>

              {/* Owner */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                <TagMultiSelect
                  options={OWNERS}
                  selected={selectedOwners}
                  onChange={setSelectedOwners}
                  placeholder="Any owner"
                />
              </div>

              {/* Edge Type */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Connected via edge type</label>
                <TagMultiSelect
                  options={EDGE_TYPES}
                  selected={selectedEdgeTypes}
                  onChange={setSelectedEdgeTypes}
                  placeholder="Any edge type"
                />
              </div>

              {/* Connection Count */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-600 mb-2">Connection Count</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minConnections}
                    onChange={(e) => setMinConnections(e.target.value)}
                    placeholder="Min"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <input
                    type="number"
                    value={maxConnections}
                    onChange={(e) => setMaxConnections(e.target.value)}
                    placeholder="Max"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSearch}
                className="w-full py-2.5 bg-nexus-600 text-white rounded-xl text-sm font-semibold hover:bg-nexus-700 transition-colors mb-2"
              >
                Search
              </button>
              <button
                onClick={handleReset}
                className="w-full py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Reset Filters
              </button>
            </div>

            {/* Saved Searches */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Saved Searches</h2>
              {SAVED_SEARCHES.length === 0 ? (
                <p className="text-xs text-gray-400">No saved searches yet</p>
              ) : (
                <div className="space-y-2">
                  {SAVED_SEARCHES.map((s) => (
                    <button
                      key={s.id}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-700">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-3">
            {!searched ? (
              <div className="flex flex-col items-center justify-center h-80 bg-white border border-gray-100 rounded-2xl">
                <div className="w-16 h-16 bg-nexus-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-nexus-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium">Build your query</p>
                <p className="text-gray-400 text-sm mt-1">Use the filters on the left to search your knowledge graph</p>
              </div>
            ) : (
              <div>
                {/* Results header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-500">
                      <span className="font-semibold text-gray-900">{MOCK_RESULTS.length}</span> results found
                    </p>
                    <button
                      onClick={() => setShowSaveModal(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-nexus-600 hover:text-nexus-800 font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                      </svg>
                      Save Search
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Sort */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                    >
                      {SORT_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    {/* View toggle */}
                    <div className="flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
                      <button
                        onClick={() => setViewMode("list")}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-nexus-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setViewMode("graph")}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === "graph" ? "bg-nexus-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="6" cy="12" r="2" />
                          <circle cx="18" cy="6" r="2" />
                          <circle cx="18" cy="18" r="2" />
                          <path strokeLinecap="round" d="M8 12h4m2-4.5l2 3m0 3l-2 3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {viewMode === "graph" ? (
                  <div className="flex flex-col items-center justify-center h-64 bg-gradient-to-br from-nexus-50 to-purple-50 border border-nexus-100 rounded-2xl">
                    <p className="text-gray-600 font-medium">Graph view</p>
                    <p className="text-gray-400 text-sm mt-1">Showing {MOCK_RESULTS.length} result nodes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagedResults.map((result) => (
                      <div key={result.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-nexus-200 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h3 className="font-semibold text-gray-900 truncate">{result.title}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_COLORS[result.type] ?? "bg-gray-100 text-gray-600"}`}>
                                {result.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{result.excerpt}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                              <span>{result.owner}</span>
                              <span>{result.connections} connections</span>
                              <span>{result.updatedAt}</span>
                              {result.tags.map((tag) => (
                                <span key={tag} className="text-nexus-500">#{tag}</span>
                              ))}
                            </div>
                          </div>
                          <button className="flex-shrink-0 px-3 py-1.5 text-xs text-nexus-600 border border-nexus-200 rounded-lg hover:bg-nexus-50 transition-colors font-medium">
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && viewMode === "list" && (
                  <div className="flex items-center justify-between mt-5">
                    <p className="text-sm text-gray-500">
                      Page {page} of {totalPages}
                    </p>
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
            )}
          </div>
        </div>
      </div>

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Save Search</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Name</label>
              <input
                type="text"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                placeholder="e.g. My AI Research Query"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
