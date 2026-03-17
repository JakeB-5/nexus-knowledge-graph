"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, getNodeTypeColor, cn } from "@/lib/utils";

interface Connection {
  id: string;
  sourceId: string;
  sourceTitle: string;
  targetId: string;
  targetTitle: string;
  type: string;
  weight: number;
}

interface HistoryEntry {
  id: string;
  actorName: string;
  action: string;
  createdAt: string;
}

// Mock data for demonstration
const MOCK_NODE = {
  id: "node_1",
  title: "Quantum Computing",
  type: "concept",
  ownerName: "Sarah Chen",
  createdAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  connectionCount: 24,
  content: `Quantum computing is a type of computation that harnesses quantum mechanical phenomena such as superposition and entanglement to perform operations on data.

Unlike classical computers that use binary bits (0 or 1), quantum computers use quantum bits, or qubits, which can exist in a superposition of states simultaneously.

## Key Concepts

- **Superposition**: A qubit can represent both 0 and 1 simultaneously
- **Entanglement**: Qubits can be correlated regardless of distance
- **Quantum Interference**: Used to amplify correct answers and cancel wrong ones

## Applications

Quantum computing has potential applications in cryptography, drug discovery, optimization problems, and machine learning.`,
};

const MOCK_CONNECTIONS: Connection[] = [
  { id: "e1", sourceId: "node_1", sourceTitle: "Quantum Computing", targetId: "node_2", targetTitle: "Machine Learning", type: "related_to", weight: 0.85 },
  { id: "e2", sourceId: "node_1", sourceTitle: "Quantum Computing", targetId: "node_3", targetTitle: "Cryptography", type: "enables", weight: 0.92 },
  { id: "e3", sourceId: "node_4", sourceTitle: "Physics", targetId: "node_1", targetTitle: "Quantum Computing", type: "foundation_of", weight: 0.78 },
  { id: "e4", sourceId: "node_1", sourceTitle: "Quantum Computing", targetId: "node_5", targetTitle: "Quantum Entanglement", type: "uses", weight: 0.95 },
  { id: "e5", sourceId: "node_6", sourceTitle: "IBM", targetId: "node_1", targetTitle: "Quantum Computing", type: "researches", weight: 0.70 },
  { id: "e6", sourceId: "node_1", sourceTitle: "Quantum Computing", targetId: "node_7", targetTitle: "Drug Discovery", type: "applied_to", weight: 0.65 },
];

const MOCK_HISTORY: HistoryEntry[] = [
  { id: "h1", actorName: "Sarah Chen", action: "Updated content section", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "h2", actorName: "Marcus W.", action: "Added connection to Machine Learning", createdAt: new Date(Date.now() - 1 * 24 * 3600_000).toISOString() },
  { id: "h3", actorName: "Sarah Chen", action: "Changed type from 'document' to 'concept'", createdAt: new Date(Date.now() - 5 * 24 * 3600_000).toISOString() },
  { id: "h4", actorName: "Admin", action: "Created node", createdAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() },
];

// Mini graph preview: render nodes as circles with lines
function GraphPreview({ connections }: { connections: Connection[] }) {
  const centerX = 180;
  const centerY = 120;
  const radius = 85;
  const uniqueNeighbors = [
    ...new Map(
      connections.flatMap((c) => [
        [c.sourceId !== "node_1" ? c.sourceId : null, c.sourceId !== "node_1" ? c.sourceTitle : null],
        [c.targetId !== "node_1" ? c.targetId : null, c.targetId !== "node_1" ? c.targetTitle : null],
      ]).filter(([id]) => id !== null) as [string, string][]
    ).values(),
  ].slice(0, 6);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Graph Preview</p>
      <svg viewBox="0 0 360 240" className="w-full" aria-label="Node connection graph preview">
        {/* Edges */}
        {uniqueNeighbors.map(([id, _], i) => {
          const angle = (i / uniqueNeighbors.length) * 2 * Math.PI - Math.PI / 2;
          const nx = centerX + radius * Math.cos(angle);
          const ny = centerY + radius * Math.sin(angle);
          return (
            <line
              key={id}
              x1={centerX} y1={centerY}
              x2={nx} y2={ny}
              stroke="#bac8ff"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
          );
        })}
        {/* Center node */}
        <circle cx={centerX} cy={centerY} r={22} fill="#4c6ef5" opacity={0.15} />
        <circle cx={centerX} cy={centerY} r={14} fill="#4c6ef5" />
        <text x={centerX} y={centerY + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">●</text>
        <text x={centerX} y={centerY + 30} textAnchor="middle" fill="#364fc7" fontSize="8" fontWeight="600">{MOCK_NODE.title.slice(0, 16)}</text>
        {/* Neighbor nodes */}
        {uniqueNeighbors.map(([id, label], i) => {
          const angle = (i / uniqueNeighbors.length) * 2 * Math.PI - Math.PI / 2;
          const nx = centerX + radius * Math.cos(angle);
          const ny = centerY + radius * Math.sin(angle);
          return (
            <g key={id}>
              <circle cx={nx} cy={ny} r={10} fill="#748ffc" opacity={0.9} />
              <text
                x={nx}
                y={ny + (ny > centerY ? 22 : -14)}
                textAnchor="middle"
                fill="#364fc7"
                fontSize="7"
                fontWeight="500"
              >
                {String(label).slice(0, 12)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TABS = ["Content", "Connections", "History", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function NodeDetailPage(_props: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<Tab>("Content");
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(MOCK_NODE.content);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-nexus-100">
            <svg className="h-6 w-6 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{MOCK_NODE.title}</h1>
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", getNodeTypeColor(MOCK_NODE.type))}>
                {MOCK_NODE.type}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Owned by <span className="font-medium text-gray-700">{MOCK_NODE.ownerName}</span>
              {" · "}
              Created {formatDate(MOCK_NODE.createdAt)}
              {" · "}
              Updated {formatDate(MOCK_NODE.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
              editing
                ? "border-nexus-300 bg-nexus-50 text-nexus-700 hover:bg-nexus-100"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            {editing ? "Editing…" : "Edit"}
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-900 tabular-nums">{MOCK_NODE.connectionCount}</span>
          <span className="text-gray-500">connections</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-900 tabular-nums">{MOCK_HISTORY.length}</span>
          <span className="text-gray-500">revisions</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Node detail tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "border-b-2 pb-3 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "border-nexus-600 text-nexus-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
              aria-selected={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "Content" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {editing ? (
              <div className="space-y-3">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={18}
                  className="w-full rounded-xl border border-nexus-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 focus:border-nexus-500 focus:outline-none focus:ring-2 focus:ring-nexus-100 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => { setContent(MOCK_NODE.content); setEditing(false); }}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{content}</div>
              </div>
            )}
          </div>
          <div>
            <GraphPreview connections={MOCK_CONNECTIONS} />
          </div>
        </div>
      )}

      {activeTab === "Connections" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{MOCK_CONNECTIONS.length} connections</p>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Connection
            </button>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50 shadow-sm">
            {MOCK_CONNECTIONS.map((conn) => {
              const isSource = conn.sourceId === "node_1";
              return (
                <div key={conn.id} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex flex-1 items-center gap-2 min-w-0 text-sm">
                    <Link href={`/dashboard/nodes/${conn.sourceId}`} className="font-medium text-gray-900 hover:text-nexus-700 transition-colors truncate">
                      {conn.sourceTitle}
                    </Link>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                      {isSource ? "→" : "←"} {conn.type.replace(/_/g, " ")}
                    </span>
                    <Link href={`/dashboard/nodes/${conn.targetId}`} className="font-medium text-gray-900 hover:text-nexus-700 transition-colors truncate">
                      {conn.targetTitle}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5" title={`Weight: ${conn.weight}`}>
                      <div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-nexus-500" style={{ width: `${conn.weight * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">{conn.weight.toFixed(2)}</span>
                    </div>
                    <button className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "History" && (
        <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50 shadow-sm">
          {MOCK_HISTORY.map((entry) => (
            <div key={entry.id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nexus-100 text-xs font-semibold text-nexus-700">
                {entry.actorName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{entry.actorName}</span>
                  {" — "}
                  {entry.action}
                </p>
                <p className="text-xs text-gray-400">{formatDate(entry.createdAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Settings" && (
        <div className="max-w-xl space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Node Settings</h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Visibility</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100">
                <option>Public — visible to all users</option>
                <option>Private — only owner</option>
                <option>Restricted — specific users</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Canonical URL slug</label>
              <input
                type="text"
                defaultValue="quantum-computing"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
              />
            </div>
            <button className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors">
              Save Settings
            </button>
          </div>

          <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
            <p className="text-sm text-gray-500">Deleting this node will also remove all its connections. This action cannot be undone.</p>
            <button className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete This Node
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
