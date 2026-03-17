"use client";

import React, { useState } from "react";

const FORMATS = [
  { id: "json", label: "JSON", desc: "Full graph with metadata", icon: "J" },
  { id: "csv", label: "CSV", desc: "Spreadsheet-compatible", icon: "C" },
  { id: "markdown", label: "Markdown", desc: "Human-readable notes", icon: "M" },
  { id: "html", label: "HTML", desc: "Static web export", icon: "H" },
];

const NODE_TYPES = ["Article", "Note", "Concept", "Person", "Place", "Event"];

export default function ExportPage() {
  const [format, setFormat] = useState("json");
  const [includeEdges, setIncludeEdges] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(NODE_TYPES);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const toggleType = (t: string) =>
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const toggleAll = () =>
    setSelectedTypes(selectedTypes.length === NODE_TYPES.length ? [] : NODE_TYPES);

  const handleExport = async () => {
    setExporting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setExporting(false);
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const estimatedNodes = Math.round(1284 * (selectedTypes.length / NODE_TYPES.length));

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Export</h1>
          <p className="text-gray-500 text-sm mt-1">Download your knowledge graph in any format</p>
        </div>

        <div className="space-y-5">
          {/* Format selection */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Export format</h2>
            <div className="grid grid-cols-2 gap-3">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    format === f.id ? "border-nexus-500 bg-nexus-50" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold mb-2.5 ${
                    format === f.id ? "bg-nexus-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {f.icon}
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Node type filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Node types</h2>
              <button
                onClick={toggleAll}
                className="text-xs text-nexus-600 hover:text-nexus-800 font-medium transition"
              >
                {selectedTypes.length === NODE_TYPES.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {NODE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    selectedTypes.includes(t)
                      ? "bg-nexus-100 text-nexus-700 border-nexus-200"
                      : "bg-gray-50 text-gray-400 border-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Date range</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-700"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Leave empty to export all time</p>
          </div>

          {/* Options */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Options</h2>
            <div className="space-y-4">
              {[
                { label: "Include edges", desc: "Export connections between nodes", value: includeEdges, set: setIncludeEdges },
                { label: "Include metadata", desc: "Timestamps, tags, and custom fields", value: includeMetadata, set: setIncludeMetadata },
              ].map(({ label, desc, value, set }) => (
                <div key={label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => set(!value)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-nexus-500" : "bg-gray-200"}`}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: value ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary + Download */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Ready to export</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  ~{estimatedNodes.toLocaleString()} nodes · {includeEdges ? "includes" : "excludes"} edges · {format.toUpperCase()} format
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                selectedTypes.length > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
              }`}>
                {selectedTypes.length > 0 ? "Ready" : "Select types"}
              </div>
            </div>

            {exported && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Export started — your download will begin shortly
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting || selectedTypes.length === 0}
              className="w-full py-2.5 px-4 bg-nexus-500 hover:bg-nexus-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              {exporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Preparing export...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
