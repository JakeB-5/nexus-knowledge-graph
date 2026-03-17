import React, { useState } from "react";

const NODE_TYPES = [
  { type: "concept", label: "Concept", color: "#6366f1" },
  { type: "document", label: "Document", color: "#10b981" },
  { type: "person", label: "Person", color: "#f59e0b" },
  { type: "place", label: "Place", color: "#ef4444" },
  { type: "event", label: "Event", color: "#8b5cf6" },
  { type: "tag", label: "Tag", color: "#06b6d4" },
];

const EDGE_TYPES = [
  { type: "relates_to", label: "Relates to", style: "solid" },
  { type: "depends_on", label: "Depends on", style: "dashed" },
  { type: "references", label: "References", style: "dotted" },
  { type: "contains", label: "Contains", style: "solid-thick" },
];

interface GraphLegendProps {
  className?: string;
}

export default function GraphLegend({ className = "" }: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Legend
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100">
          {/* Node types */}
          <div className="pt-2">
            <p className="text-xs text-slate-400 font-medium mb-1.5">Nodes</p>
            <div className="space-y-1.5">
              {NODE_TYPES.map(({ type, label, color }) => (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edge types */}
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1.5">Edges</p>
            <div className="space-y-1.5">
              {EDGE_TYPES.map(({ type, label, style }) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-8 flex items-center shrink-0">
                    {style === "solid" && (
                      <div className="w-full h-px bg-slate-400" />
                    )}
                    {style === "dashed" && (
                      <div className="w-full h-px border-t border-dashed border-slate-400" />
                    )}
                    {style === "dotted" && (
                      <div className="w-full h-px border-t border-dotted border-slate-400" />
                    )}
                    {style === "solid-thick" && (
                      <div className="w-full h-0.5 bg-slate-500" />
                    )}
                  </div>
                  <span className="text-xs text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
