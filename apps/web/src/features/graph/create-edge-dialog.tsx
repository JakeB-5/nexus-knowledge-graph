"use client";

import React, { useState, useEffect, useRef } from "react";
import type { GraphNode } from "./graph-canvas";

const EDGE_TYPES = ["relates_to", "depends_on", "references", "contains", "mentions"];

interface CreateEdgeFormData {
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
}

interface CreateEdgeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateEdgeFormData) => Promise<void>;
  nodes: GraphNode[];
  preselectedSourceId?: string;
  preselectedTargetId?: string;
}

const INITIAL_FORM: CreateEdgeFormData = {
  sourceId: "",
  targetId: "",
  type: "relates_to",
  weight: 1,
};

function NodeSearchSelect({
  nodes,
  value,
  onChange,
  placeholder,
  excludeId,
  label,
  error,
}: {
  nodes: GraphNode[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  excludeId?: string;
  label: string;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = nodes
    .filter((n) => n.id !== excludeId)
    .filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const selected = nodes.find((n) => n.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className={`w-full px-3 py-2 rounded-lg border text-sm text-left transition-colors
            focus:outline-none focus:ring-2 focus:ring-indigo-500
            ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
        >
          {selected ? (
            <span className="text-slate-900">{selected.label}</span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes..."
                autoFocus
                className="w-full px-2.5 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">No nodes found</p>
              ) : (
                filtered.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      onChange(node.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50
                      ${node.id === value ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
                  >
                    <span className="font-medium">{node.label}</span>
                    <span className="ml-2 text-xs text-slate-400 capitalize">{node.type}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function CreateEdgeDialog({
  open,
  onClose,
  onSubmit,
  nodes,
  preselectedSourceId,
  preselectedTargetId,
}: CreateEdgeDialogProps) {
  const [form, setForm] = useState<CreateEdgeFormData>({
    ...INITIAL_FORM,
    sourceId: preselectedSourceId ?? "",
    targetId: preselectedTargetId ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateEdgeFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...INITIAL_FORM,
        sourceId: preselectedSourceId ?? "",
        targetId: preselectedTargetId ?? "",
      });
      setErrors({});
    }
  }, [open, preselectedSourceId, preselectedTargetId]);

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.sourceId) errs.sourceId = "Source node is required";
    if (!form.targetId) errs.targetId = "Target node is required";
    if (form.sourceId && form.targetId && form.sourceId === form.targetId) {
      errs.targetId = "Source and target must be different";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setErrors({ sourceId: err instanceof Error ? err.message : "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const sourceNode = nodes.find((n) => n.id === form.sourceId);
  const targetNode = nodes.find((n) => n.id === form.targetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Edge</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Visual connection preview */}
          {(sourceNode || targetNode) && (
            <div className="flex items-center justify-center gap-3 p-3 bg-slate-50 rounded-xl">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-indigo-600 text-xs font-bold">
                    {sourceNode ? (sourceNode.label[0] ?? "?").toUpperCase() : "?"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 max-w-16 truncate">
                  {sourceNode?.label ?? "Source"}
                </p>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-px bg-slate-300" />
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-emerald-600 text-xs font-bold">
                    {targetNode ? (targetNode.label[0] ?? "?").toUpperCase() : "?"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 max-w-16 truncate">
                  {targetNode?.label ?? "Target"}
                </p>
              </div>
            </div>
          )}

          {/* Source node */}
          <NodeSearchSelect
            nodes={nodes}
            value={form.sourceId}
            onChange={(id) => setForm((f) => ({ ...f, sourceId: id }))}
            placeholder="Select source node..."
            excludeId={form.targetId}
            label="Source Node"
            error={errors.sourceId}
          />

          {/* Target node */}
          <NodeSearchSelect
            nodes={nodes}
            value={form.targetId}
            onChange={(id) => setForm((f) => ({ ...f, targetId: id }))}
            placeholder="Select target node..."
            excludeId={form.sourceId}
            label="Target Node"
            error={errors.targetId}
          />

          {/* Edge type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Edge Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {EDGE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {/* Weight slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Weight</label>
              <span className="text-sm font-semibold text-indigo-600">{form.weight.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
              className="w-full h-1.5 rounded-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Weak (0.1)</span>
              <span>Strong (10)</span>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white
              hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Edge"}
          </button>
        </div>
      </div>
    </div>
  );
}
