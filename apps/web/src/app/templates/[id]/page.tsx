"use client";

import React, { useState } from "react";
import Link from "next/link";

const TEMPLATE = {
  id: "1",
  title: "Research Notes",
  description:
    "Organize research papers, experiments, hypotheses, and findings in a structured knowledge graph. This template is designed for researchers, academics, and curious minds who want to map the connections between ideas, sources, and conclusions.",
  category: "Research",
  nodeCount: 24,
  edgeCount: 48,
  author: "Nexus Team",
  uses: 1842,
  lastUpdated: "March 10, 2025",
  color: "from-blue-400 to-nexus-500",
};

const NODE_TYPES = [
  { type: "Paper", count: 8, color: "bg-blue-100 text-blue-700", description: "Academic papers, articles, and publications" },
  { type: "Concept", count: 6, color: "bg-purple-100 text-purple-700", description: "Key concepts, theories, and ideas" },
  { type: "Experiment", count: 4, color: "bg-green-100 text-green-700", description: "Experiments, trials, and observations" },
  { type: "Hypothesis", count: 3, color: "bg-yellow-100 text-yellow-700", description: "Unproven propositions and predictions" },
  { type: "Finding", count: 3, color: "bg-red-100 text-red-700", description: "Conclusions, results, and discoveries" },
];

const EDGE_TYPES = [
  { type: "Cites", count: 18, description: "One paper cites another" },
  { type: "Supports", count: 12, description: "Evidence supports a hypothesis" },
  { type: "Contradicts", count: 6, description: "Conflicting evidence or findings" },
  { type: "Builds On", count: 8, description: "Concept extends another concept" },
  { type: "Related To", count: 4, description: "General association between nodes" },
];

const PREVIEW_NODES = [
  { id: "p1", x: 50, y: 50, label: "Core Concept", type: "Concept" },
  { id: "p2", x: 180, y: 30, label: "Paper A", type: "Paper" },
  { id: "p3", x: 200, y: 120, label: "Hypothesis 1", type: "Hypothesis" },
  { id: "p4", x: 80, y: 150, label: "Finding A", type: "Finding" },
  { id: "p5", x: 300, y: 70, label: "Experiment 1", type: "Experiment" },
  { id: "p6", x: 310, y: 160, label: "Paper B", type: "Paper" },
];

const NODE_TYPE_COLORS_MAP: Record<string, string> = {
  Concept: "#818cf8",
  Paper: "#60a5fa",
  Hypothesis: "#fbbf24",
  Finding: "#f87171",
  Experiment: "#34d399",
};

function TemplatePreview() {
  const edges = [
    ["p1", "p2"], ["p1", "p3"], ["p2", "p4"], ["p3", "p5"], ["p5", "p6"], ["p4", "p3"],
  ];

  return (
    <div className="bg-gradient-to-br from-gray-50 to-nexus-50 rounded-2xl border border-nexus-100 p-4 h-56 relative overflow-hidden">
      <p className="text-xs text-gray-400 mb-2 font-medium">Structure Preview</p>
      <svg className="w-full h-full" viewBox="0 0 380 180">
        {edges.map(([from, to], i) => {
          const fromNode = PREVIEW_NODES.find((n) => n.id === from)!;
          const toNode = PREVIEW_NODES.find((n) => n.id === to)!;
          return (
            <line
              key={i}
              x1={fromNode.x + 28}
              y1={fromNode.y + 12}
              x2={toNode.x + 28}
              y2={toNode.y + 12}
              stroke="#c7d2fe"
              strokeWidth={1.5}
            />
          );
        })}
        {PREVIEW_NODES.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <rect
              rx={8}
              ry={8}
              width={56}
              height={24}
              fill={NODE_TYPE_COLORS_MAP[node.type] ?? "#818cf8"}
              fillOpacity={0.85}
            />
            <text
              x={28}
              y={15}
              textAnchor="middle"
              fontSize={6}
              fill="white"
              fontWeight={600}
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function CustomizeModal({ onClose }: { onClose: () => void }) {
  const [workspaceName, setWorkspaceName] = useState("My Research Notes");
  const [description, setDescription] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Customize Template</h2>
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
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you use this workspace for?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Include node types</label>
            <div className="space-y-2">
              {NODE_TYPES.map((nt) => (
                <label key={nt.type} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="accent-nexus-600" />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${nt.color}`}>{nt.type}</span>
                  <span className="text-sm text-gray-500">{nt.description}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button className="flex-1 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
            Create Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateDetailPage() {
  const [showCustomize, setShowCustomize] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/templates" className="hover:text-nexus-600 transition-colors">Templates</Link>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-gray-700 font-medium">{TEMPLATE.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Main info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Hero */}
            <div className={`h-48 bg-gradient-to-br ${TEMPLATE.color} rounded-2xl flex items-center justify-center relative overflow-hidden`}>
              <div className="text-center text-white">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold">{TEMPLATE.title}</h1>
                <p className="text-white/80 text-sm mt-1">{TEMPLATE.category}</p>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">About this template</h2>
              <p className="text-gray-600 text-sm leading-relaxed">{TEMPLATE.description}</p>

              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-400">
                <span>By <span className="text-gray-700 font-medium">{TEMPLATE.author}</span></span>
                <span>Updated {TEMPLATE.lastUpdated}</span>
                <span>{TEMPLATE.uses.toLocaleString()} workspaces created</span>
              </div>
            </div>

            {/* Node Types */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Included Node Types</h2>
              <div className="space-y-3">
                {NODE_TYPES.map((nt) => (
                  <div key={nt.type} className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${nt.color} w-24 text-center`}>
                      {nt.type}
                    </span>
                    <span className="text-sm text-gray-500 flex-1">{nt.description}</span>
                    <span className="text-xs text-gray-400">{nt.count} nodes</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Edge Types */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Included Edge Types</h2>
              <div className="space-y-3">
                {EDGE_TYPES.map((et) => (
                  <div key={et.type} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-28">
                      <div className="w-4 h-px bg-gray-400" />
                      <span className="text-xs font-medium text-gray-700">{et.type}</span>
                      <div className="w-4 h-px bg-gray-400" />
                    </div>
                    <span className="text-sm text-gray-500 flex-1">{et.description}</span>
                    <span className="text-xs text-gray-400">{et.count} edges</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Template Structure</h2>
              <TemplatePreview />
            </div>
          </div>

          {/* Right: Actions sidebar */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky top-6">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">{TEMPLATE.nodeCount}</p>
                  <p className="text-xs text-gray-400">Nodes</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">{TEMPLATE.edgeCount}</p>
                  <p className="text-xs text-gray-400">Edges</p>
                </div>
              </div>

              <button className="w-full px-4 py-3 bg-nexus-600 text-white rounded-xl text-sm font-semibold hover:bg-nexus-700 transition-colors mb-3">
                Use This Template
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="w-full px-4 py-3 border border-nexus-200 text-nexus-700 rounded-xl text-sm font-medium hover:bg-nexus-50 transition-colors"
              >
                Customize Before Using
              </button>

              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Also try</p>
                <div className="space-y-2">
                  {["Academic Literature Map", "Personal Wiki", "Mind Map Starter"].map((title) => (
                    <button key={title} className="w-full text-left text-sm text-nexus-600 hover:text-nexus-800 transition-colors py-1">
                      {title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && <CustomizeModal onClose={() => setShowCustomize(false)} />}
    </div>
  );
}
