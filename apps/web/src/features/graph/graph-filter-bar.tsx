"use client";

import React, { useState } from "react";

const NODE_TYPES = ["concept", "document", "person", "place", "event", "tag"];
const EDGE_TYPES = ["relates_to", "depends_on", "references", "contains", "mentions"];

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "bg-indigo-500",
  document: "bg-emerald-500",
  person: "bg-amber-500",
  place: "bg-red-500",
  event: "bg-purple-500",
  tag: "bg-cyan-500",
};

export interface GraphFilters {
  nodeTypes: string[];
  edgeTypes: string[];
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  minConnections: number;
}

interface GraphFilterBarProps {
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
  className?: string;
}

export const DEFAULT_FILTERS: GraphFilters = {
  nodeTypes: [...NODE_TYPES],
  edgeTypes: [...EDGE_TYPES],
  searchQuery: "",
  dateFrom: "",
  dateTo: "",
  minConnections: 0,
};

export default function GraphFilterBar({ filters, onChange, className = "" }: GraphFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleNodeType = (type: string) => {
    const next = filters.nodeTypes.includes(type)
      ? filters.nodeTypes.filter((t) => t !== type)
      : [...filters.nodeTypes, type];
    onChange({ ...filters, nodeTypes: next });
  };

  const toggleEdgeType = (type: string) => {
    const next = filters.edgeTypes.includes(type)
      ? filters.edgeTypes.filter((t) => t !== type)
      : [...filters.edgeTypes, type];
    onChange({ ...filters, edgeTypes: next });
  };

  const clearAll = () => onChange(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.nodeTypes.length < NODE_TYPES.length ||
    filters.edgeTypes.length < EDGE_TYPES.length ||
    filters.searchQuery !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.minConnections > 0;

  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search graph..."
            value={filters.searchQuery}
            onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <button
          onClick={() => setExpanded((p) => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${expanded ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-3 space-y-4">
          {/* Node type filter */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Node Types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NODE_TYPES.map((type) => {
                const active = filters.nodeTypes.includes(type);
                const dotColor = NODE_TYPE_COLORS[type] ?? "bg-slate-500";
                return (
                  <button
                    key={type}
                    onClick={() => toggleNodeType(type)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                      transition-colors border
                      ${active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="capitalize">{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Edge type filter */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Edge Types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EDGE_TYPES.map((type) => {
                const active = filters.edgeTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleEdgeType(type)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border
                      ${active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                  >
                    {type.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Date Range
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Min connections slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Min Connections
              </p>
              <span className="text-xs font-semibold text-indigo-600">
                {filters.minConnections}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={filters.minConnections}
              onChange={(e) => onChange({ ...filters, minConnections: Number(e.target.value) })}
              className="w-full h-1.5 rounded-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0</span>
              <span>20+</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
