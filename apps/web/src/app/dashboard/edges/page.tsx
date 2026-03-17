"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { Modal } from "@/components/modal";
import { formatDate, cn } from "@/lib/utils";

interface EdgeRow {
  id: string;
  sourceId: string;
  sourceTitle: string;
  targetId: string;
  targetTitle: string;
  type: string;
  weight: number;
  createdAt: string;
}

const EDGE_TYPES = [
  "related_to", "enables", "foundation_of", "uses", "researches",
  "applied_to", "contradicts", "extends", "part_of", "created_by",
];

const EDGE_TYPE_COLORS: Record<string, string> = {
  related_to: "bg-gray-100 text-gray-600",
  enables: "bg-green-100 text-green-700",
  foundation_of: "bg-nexus-100 text-nexus-700",
  uses: "bg-purple-100 text-purple-700",
  researches: "bg-yellow-100 text-yellow-700",
  applied_to: "bg-orange-100 text-orange-700",
  contradicts: "bg-red-100 text-red-700",
  extends: "bg-teal-100 text-teal-700",
  part_of: "bg-pink-100 text-pink-700",
  created_by: "bg-indigo-100 text-indigo-700",
};

const SOURCE_NODES = [
  "Quantum Computing", "Machine Learning", "Neural Networks", "Graph Theory",
  "NLP", "Computer Vision", "Distributed Systems", "Blockchain", "Cryptography",
];
const TARGET_NODES = [
  "Drug Discovery", "AI Ethics", "Deep Learning", "Superposition",
  "Optimization", "Data Mining", "Robotics", "Climate Science", "Genomics",
];

const MOCK_EDGES: EdgeRow[] = Array.from({ length: 56 }, (_, i) => ({
  id: `edge_${i + 1}`,
  sourceId: `node_${i + 1}`,
  sourceTitle: SOURCE_NODES[i % SOURCE_NODES.length] ?? "Unknown",
  targetId: `node_${i + 100}`,
  targetTitle: TARGET_NODES[i % TARGET_NODES.length] ?? "Unknown",
  type: EDGE_TYPES[i % EDGE_TYPES.length] ?? "related_to",
  weight: Math.round((0.5 + Math.random() * 0.5) * 100) / 100,
  createdAt: new Date(Date.now() - (i + 1) * 8 * 3600_000).toISOString(),
}));

const PAGE_SIZE = 12;
const ALL_TYPES = ["all", ...EDGE_TYPES];

export default function EdgesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newType, setNewType] = useState("related_to");
  const [newWeight, setNewWeight] = useState("0.8");

  const filtered = MOCK_EDGES.filter((e) => {
    const matchesSearch =
      e.sourceTitle.toLowerCase().includes(search.toLowerCase()) ||
      e.targetTitle.toLowerCase().includes(search.toLowerCase()) ||
      e.type.includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || e.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleCreate() {
    setCreateOpen(false);
    setNewSource("");
    setNewTarget("");
    setNewType("related_to");
    setNewWeight("0.8");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edges</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length.toLocaleString()} connections in the knowledge graph
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-nexus-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nexus-700 transition-colors self-start sm:self-auto"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Edge
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search edges…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          className="sm:w-72"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
        >
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Edge list */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No edges match your filters.</p>
          </div>
        ) : (
          paginated.map((edge) => (
            <div key={edge.id} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
              {/* Source */}
              <Link
                href={`/dashboard/nodes/${edge.sourceId}`}
                className="min-w-0 flex-1 text-sm font-medium text-gray-900 hover:text-nexus-700 transition-colors truncate"
              >
                {edge.sourceTitle}
              </Link>

              {/* Arrow + type */}
              <div className="flex shrink-0 items-center gap-2">
                <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                    EDGE_TYPE_COLORS[edge.type] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {edge.type.replace(/_/g, " ")}
                </span>
                <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>

              {/* Target */}
              <Link
                href={`/dashboard/nodes/${edge.targetId}`}
                className="min-w-0 flex-1 text-sm font-medium text-gray-900 hover:text-nexus-700 transition-colors truncate"
              >
                {edge.targetTitle}
              </Link>

              {/* Weight bar */}
              <div className="hidden sm:flex items-center gap-2 shrink-0 w-28" title={`Weight: ${edge.weight}`}>
                <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-nexus-500"
                    style={{ width: `${edge.weight * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-gray-400 w-8 text-right">{edge.weight.toFixed(2)}</span>
              </div>

              {/* Date */}
              <span className="hidden lg:block text-xs text-gray-400 shrink-0 w-24 text-right">
                {formatDate(edge.createdAt)}
              </span>

              {/* Delete */}
              <button
                className="hidden group-hover:flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Delete edge"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
      />

      {/* Create edge modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Edge"
        description="Connect two nodes in the knowledge graph."
        footer={
          <>
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newSource.trim() || !newTarget.trim()}
              className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Edge
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Source Node <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Source node title or ID…"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Relationship Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            >
              {EDGE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Target Node <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="Target node title or ID…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Weight <span className="text-gray-400 font-normal">(0.0 – 1.0)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="flex-1 accent-nexus-600"
              />
              <span className="w-10 text-right text-sm font-mono text-gray-700 tabular-nums">{parseFloat(newWeight).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
