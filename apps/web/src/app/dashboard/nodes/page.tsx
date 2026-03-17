"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type ColumnDef, type SortDirection } from "@/components/data-table";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { Modal } from "@/components/modal";
import { formatDate, getNodeTypeColor, cn } from "@/lib/utils";

interface NodeRow {
  id: string;
  title: string;
  type: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  connectionCount: number;
}

// Mock data
const NODE_TITLES = [
  "Quantum Computing", "Machine Learning", "Neural Networks", "Graph Theory",
  "Natural Language Processing", "Computer Vision", "Distributed Systems",
  "Blockchain Technology", "Cryptography", "Data Structures",
];
const NODE_TYPES_LIST = ["concept", "person", "organization", "event", "document"] as const;
const OWNER_NAMES = ["Sarah Chen", "Marcus W.", "Priya P.", "James R.", "Emma T."] as const;

const MOCK_NODES: NodeRow[] = Array.from({ length: 48 }, (_, i) => ({
  id: `node_${i + 1}`,
  title: (NODE_TITLES[i % 10] ?? "Unknown") + (i >= 10 ? ` (${Math.floor(i / 10) + 1})` : ""),
  type: NODE_TYPES_LIST[i % 5] ?? "concept",
  ownerName: OWNER_NAMES[i % 5] ?? "Unknown",
  createdAt: new Date(Date.now() - (i + 1) * 24 * 3600_000).toISOString(),
  updatedAt: new Date(Date.now() - i * 3600_000).toISOString(),
  connectionCount: Math.floor(Math.random() * 50) + 1,
}));

const NODE_TYPES = ["all", "concept", "person", "organization", "event", "document"];
const PAGE_SIZE = 10;

const COLUMNS: ColumnDef<NodeRow>[] = [
  {
    key: "title",
    header: "Title",
    sortable: true,
    render: (row) => (
      <Link
        href={`/dashboard/nodes/${row.id}`}
        className="font-medium text-gray-900 hover:text-nexus-700 transition-colors"
      >
        {row.title}
      </Link>
    ),
  },
  {
    key: "type",
    header: "Type",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", getNodeTypeColor(row.type))}>
        {row.type}
      </span>
    ),
  },
  {
    key: "ownerName",
    header: "Owner",
    sortable: true,
    width: "140px",
    render: (row) => <span className="text-gray-600">{row.ownerName}</span>,
  },
  {
    key: "connectionCount",
    header: "Connections",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="tabular-nums text-gray-600">{row.connectionCount}</span>
    ),
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    width: "130px",
    render: (row) => <span className="text-gray-500 text-xs">{formatDate(row.createdAt)}</span>,
  },
  {
    key: "updatedAt",
    header: "Updated",
    sortable: true,
    width: "130px",
    render: (row) => <span className="text-gray-500 text-xs">{formatDate(row.updatedAt)}</span>,
  },
  {
    key: "actions",
    header: "",
    width: "80px",
    render: (row) => (
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/dashboard/nodes/${row.id}`}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="View"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>
    ),
  },
];

export default function NodesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("concept");

  // Filter + sort
  const filtered = MOCK_NODES.filter((n) => {
    const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.ownerName.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || n.type === typeFilter;
    return matchesSearch && matchesType;
  }).sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const av = a[sortKey as keyof NodeRow];
    const bv = b[sortKey as keyof NodeRow];
    if (av === undefined || bv === undefined) return 0;
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: string, dir: SortDirection) {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  }

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  function handleBulkDelete() {
    // In production, call nodesApi.bulkDelete([...selectedIds])
    setSelectedIds(new Set());
  }

  function handleCreate() {
    // In production, call nodesApi.create({ title: newTitle, type: newType })
    setCreateOpen(false);
    setNewTitle("");
    setNewType("concept");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nodes</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length.toLocaleString()} nodes in the knowledge graph
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-nexus-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nexus-700 transition-colors self-start sm:self-auto"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Node
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search nodes…"
          onSearch={handleSearch}
          className="sm:w-72"
        />

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={paginated}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onSort={handleSort}
        sortKey={sortKey}
        sortDirection={sortDir}
        emptyMessage="No nodes match your filters."
      />

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
      />

      {/* Create node modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Node"
        description="Add a new node to your knowledge graph."
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
              disabled={!newTitle.trim()}
              className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Node
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="node-title" className="mb-1.5 block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="node-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter node title…"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
          <div>
            <label htmlFor="node-type" className="mb-1.5 block text-sm font-medium text-gray-700">
              Type
            </label>
            <select
              id="node-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            >
              {NODE_TYPES.filter((t) => t !== "all").map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="node-content" className="mb-1.5 block text-sm font-medium text-gray-700">
              Content <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="node-content"
              rows={3}
              placeholder="Add initial content…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100 resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
