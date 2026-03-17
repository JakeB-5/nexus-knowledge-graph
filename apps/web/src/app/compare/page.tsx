"use client";

import React, { useState } from "react";

const MOCK_NODES = [
  {
    id: "n1",
    title: "Transformer Architecture",
    type: "Concept",
    owner: "Sarah Chen",
    created: "Jan 5, 2025",
    updated: "Mar 10, 2025",
    tags: ["AI", "NLP", "Deep Learning"],
    content: "The transformer architecture is a deep learning model that adopts the mechanism of self-attention, differentially weighting the significance of each part of the input data.",
    connections: ["Attention Mechanism", "BERT", "GPT-4", "T5", "Multi-Head Attention", "Positional Encoding"],
    properties: { Status: "Active", Confidence: "High", Source: "Vaswani et al. 2017", Citations: "42" },
  },
  {
    id: "n2",
    title: "Attention Mechanism",
    type: "Concept",
    owner: "Sarah Chen",
    created: "Jan 7, 2025",
    updated: "Feb 28, 2025",
    tags: ["AI", "NLP", "Sequence Models"],
    content: "The attention mechanism allows models to focus on relevant parts of the input sequence when producing an output, enabling the capture of long-range dependencies.",
    connections: ["Transformer Architecture", "BERT", "Self-Attention", "Cross-Attention", "Bahdanau Attention"],
    properties: { Status: "Active", Confidence: "High", Source: "Bahdanau et al. 2015", Citations: "38" },
  },
  {
    id: "n3",
    title: "GPT-4 Technical Report",
    type: "Paper",
    owner: "Marcus Williams",
    created: "Feb 1, 2025",
    updated: "Mar 1, 2025",
    tags: ["LLM", "AI", "OpenAI"],
    content: "GPT-4 is a large multimodal model that accepts image and text inputs and produces text outputs. It exhibits human-level performance on various professional and academic benchmarks.",
    connections: ["Transformer Architecture", "RLHF", "Constitutional AI", "ChatGPT"],
    properties: { Status: "Published", Confidence: "High", Source: "OpenAI 2023", Citations: "12" },
  },
];

const ALL_NODE_TITLES = MOCK_NODES.map((n) => n.title);

function NodeSelector({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: string | null;
  onSelect: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm hover:border-nexus-300 transition-colors bg-white"
      >
        {selected ? (
          <span className="font-medium text-gray-900">{selected}</span>
        ) : (
          <span className="text-gray-400">{label}</span>
        )}
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-2">
          {ALL_NODE_TITLES.map((title) => (
            <button
              key={title}
              onClick={() => { onSelect(title); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-nexus-50 hover:text-nexus-700 transition-colors ${
                selected === title ? "bg-nexus-50 text-nexus-700 font-medium" : "text-gray-700"
              }`}
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VennDiagram({
  leftOnly,
  shared,
  rightOnly,
  leftTitle,
  rightTitle,
}: {
  leftOnly: string[];
  shared: string[];
  rightOnly: string[];
  leftTitle: string;
  rightTitle: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Connection Overlap</h3>
      <div className="flex items-stretch gap-0">
        {/* Left circle */}
        <div className="flex-1 bg-blue-50 rounded-l-full rounded-r-none border-2 border-r-0 border-blue-200 p-4 min-h-[140px]">
          <p className="text-xs font-semibold text-blue-700 mb-2 truncate">{leftTitle}</p>
          <div className="space-y-1">
            {leftOnly.map((c) => (
              <p key={c} className="text-xs text-blue-600 truncate">• {c}</p>
            ))}
          </div>
          {leftOnly.length === 0 && <p className="text-xs text-blue-300 italic">none unique</p>}
        </div>

        {/* Intersection */}
        <div className="w-32 flex-shrink-0 bg-nexus-50 border-y-2 border-nexus-200 p-3 flex flex-col items-center">
          <p className="text-xs font-semibold text-nexus-700 mb-2 text-center">Shared</p>
          <div className="space-y-1 w-full">
            {shared.map((c) => (
              <p key={c} className="text-xs text-nexus-600 truncate text-center">• {c}</p>
            ))}
          </div>
          {shared.length === 0 && <p className="text-xs text-nexus-300 italic text-center">none</p>}
        </div>

        {/* Right circle */}
        <div className="flex-1 bg-purple-50 rounded-r-full rounded-l-none border-2 border-l-0 border-purple-200 p-4">
          <p className="text-xs font-semibold text-purple-700 mb-2 truncate text-right">{rightTitle}</p>
          <div className="space-y-1">
            {rightOnly.map((c) => (
              <p key={c} className="text-xs text-purple-600 truncate text-right">• {c}</p>
            ))}
          </div>
          {rightOnly.length === 0 && <p className="text-xs text-purple-300 italic text-right">none unique</p>}
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2 px-2">
        <span>{leftOnly.length} unique</span>
        <span>{shared.length} shared</span>
        <span>{rightOnly.length} unique</span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [leftTitle, setLeftTitle] = useState<string | null>(MOCK_NODES[0]?.title ?? null);
  const [rightTitle, setRightTitle] = useState<string | null>(MOCK_NODES[1]?.title ?? null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeName, setMergeName] = useState("");

  const leftNode = MOCK_NODES.find((n) => n.title === leftTitle) ?? null;
  const rightNode = MOCK_NODES.find((n) => n.title === rightTitle) ?? null;

  const leftOnly = leftNode ? leftNode.connections.filter((c) => !rightNode?.connections.includes(c)) : [];
  const rightOnly = rightNode ? rightNode.connections.filter((c) => !leftNode?.connections.includes(c)) : [];
  const shared = leftNode ? leftNode.connections.filter((c) => rightNode?.connections.includes(c)) : [];

  const allPropertyKeys = Array.from(
    new Set([
      ...(leftNode ? Object.keys(leftNode.properties) : []),
      ...(rightNode ? Object.keys(rightNode.properties) : []),
    ])
  );

  const metaRows = [
    { label: "Type", left: leftNode?.type ?? "—", right: rightNode?.type ?? "—" },
    { label: "Owner", left: leftNode?.owner ?? "—", right: rightNode?.owner ?? "—" },
    { label: "Created", left: leftNode?.created ?? "—", right: rightNode?.created ?? "—" },
    { label: "Updated", left: leftNode?.updated ?? "—", right: rightNode?.updated ?? "—" },
    { label: "Tags", left: leftNode?.tags.join(", ") ?? "—", right: rightNode?.tags.join(", ") ?? "—" },
    { label: "Connections", left: leftNode ? String(leftNode.connections.length) : "—", right: rightNode ? String(rightNode.connections.length) : "—" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compare Nodes</h1>
            <p className="text-gray-500 text-sm mt-1">Select two nodes to compare their properties and connections</p>
          </div>
          {leftNode && rightNode && (
            <button
              onClick={() => { setMergeName(`${leftNode.title} + ${rightNode.title}`); setShowMergeModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-nexus-600 text-white rounded-xl text-sm font-medium hover:bg-nexus-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              Merge Nodes
            </button>
          )}
        </div>

        {/* Node Selectors */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <NodeSelector label="Select left node..." selected={leftTitle} onSelect={setLeftTitle} />
          <NodeSelector label="Select right node..." selected={rightTitle} onSelect={setRightTitle} />
        </div>

        {leftNode && rightNode ? (
          <div className="space-y-5">
            {/* Meta comparison table */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="px-5 py-3">Property</div>
                <div className={`px-5 py-3 ${leftNode.type !== rightNode.type ? "text-blue-700 bg-blue-50" : ""}`}>{leftNode.title}</div>
                <div className={`px-5 py-3 ${leftNode.type !== rightNode.type ? "text-purple-700 bg-purple-50" : ""}`}>{rightNode.title}</div>
              </div>
              {metaRows.map((row) => {
                const isDiff = row.left !== row.right;
                return (
                  <div key={row.label} className={`grid grid-cols-3 border-b border-gray-50 last:border-0 ${isDiff ? "bg-yellow-50/40" : ""}`}>
                    <div className="px-5 py-3 text-sm font-medium text-gray-600 flex items-center gap-2">
                      {isDiff && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
                      {row.label}
                    </div>
                    <div className="px-5 py-3 text-sm text-gray-700">{row.left}</div>
                    <div className="px-5 py-3 text-sm text-gray-700">{row.right}</div>
                  </div>
                );
              })}
              {allPropertyKeys.map((key) => {
                const lv = (leftNode.properties as Record<string, string>)[key] ?? "—";
                const rv = (rightNode.properties as Record<string, string>)[key] ?? "—";
                const isDiff = lv !== rv;
                return (
                  <div key={key} className={`grid grid-cols-3 border-b border-gray-50 last:border-0 ${isDiff ? "bg-yellow-50/40" : ""}`}>
                    <div className="px-5 py-3 text-sm font-medium text-gray-600 flex items-center gap-2">
                      {isDiff && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
                      {key}
                    </div>
                    <div className="px-5 py-3 text-sm text-gray-700">{lv}</div>
                    <div className="px-5 py-3 text-sm text-gray-700">{rv}</div>
                  </div>
                );
              })}
            </div>

            {/* Content Diff */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Content</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs font-semibold text-blue-700 mb-2">{leftNode.title}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{leftNode.content}</p>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
                  <p className="text-xs font-semibold text-purple-700 mb-2">{rightNode.title}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{rightNode.content}</p>
                </div>
              </div>
            </div>

            {/* Connection Comparison */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Connection Comparison</h3>
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <p className="text-2xl font-bold text-blue-600">{leftOnly.length}</p>
                  <p className="text-xs text-blue-500 mt-1">Only in {leftNode.title}</p>
                </div>
                <div className="text-center p-3 bg-nexus-50 rounded-xl">
                  <p className="text-2xl font-bold text-nexus-600">{shared.length}</p>
                  <p className="text-xs text-nexus-500 mt-1">Shared connections</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-xl">
                  <p className="text-2xl font-bold text-purple-600">{rightOnly.length}</p>
                  <p className="text-xs text-purple-500 mt-1">Only in {rightNode.title}</p>
                </div>
              </div>
            </div>

            {/* Venn Diagram */}
            <VennDiagram
              leftOnly={leftOnly}
              shared={shared}
              rightOnly={rightOnly}
              leftTitle={leftNode.title}
              rightTitle={rightNode.title}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 bg-white border border-gray-100 rounded-2xl">
            <div className="w-14 h-14 bg-nexus-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-nexus-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">Select two nodes to compare</p>
            <p className="text-gray-400 text-sm mt-1">Use the dropdowns above to pick nodes</p>
          </div>
        )}
      </div>

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Merge Nodes</h2>
              <button onClick={() => setShowMergeModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Merging will combine both nodes into one, preserving all connections and properties. This action cannot be undone.
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Merged Node Name</label>
              <input
                type="text"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
              />
            </div>
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl mb-5">
              <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-yellow-700">Both original nodes will be replaced by the merged node.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowMergeModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button className="flex-1 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
