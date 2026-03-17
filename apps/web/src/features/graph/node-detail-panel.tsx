import React, { useState } from "react";
import Link from "next/link";
import type { GraphNode, GraphEdge } from "./graph-canvas";

interface NodeDetailPanelProps {
  node: GraphNode | null;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onEdit?: (node: GraphNode) => void;
  className?: string;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "bg-indigo-100 text-indigo-700",
  document: "bg-emerald-100 text-emerald-700",
  person: "bg-amber-100 text-amber-700",
  place: "bg-red-100 text-red-700",
  event: "bg-purple-100 text-purple-700",
  tag: "bg-cyan-100 text-cyan-700",
  default: "bg-slate-100 text-slate-700",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function NodeDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
  onDelete,
  onEdit,
  className = "",
}: NodeDetailPanelProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!node) return null;

  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);

  const getNodeById = (id: string) => allNodes.find((n) => n.id === id);

  const typeColorClass = NODE_TYPE_COLORS[node.type] ?? NODE_TYPE_COLORS.default;
  const meta = node.metadata as Record<string, string> | undefined;
  const content = meta?.content as string | undefined;
  const createdAt = meta?.createdAt as string | undefined;
  const updatedAt = meta?.updatedAt as string | undefined;

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(node.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <div
      className={`flex flex-col bg-white border-l border-slate-200 shadow-xl overflow-hidden
        transition-transform duration-300 ease-out ${className}`}
      style={{ width: 320 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${typeColorClass}`}>
              {node.type}
            </span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 truncate">{node.label}</h2>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
          <div>
            <p className="font-medium text-slate-400 uppercase tracking-wide mb-0.5">Created</p>
            <p className="text-slate-600">{formatDate(createdAt)}</p>
          </div>
          <div>
            <p className="font-medium text-slate-400 uppercase tracking-wide mb-0.5">Updated</p>
            <p className="text-slate-600">{formatDate(updatedAt)}</p>
          </div>
        </div>

        {/* Content preview */}
        {content && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Content</p>
            <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">
              {content}
            </p>
          </div>
        )}

        {/* Metadata */}
        {meta && Object.keys(meta).filter((k) => !["content", "createdAt", "updatedAt"].includes(k)).length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Metadata</p>
            <div className="space-y-1">
              {Object.entries(meta)
                .filter(([k]) => !["content", "createdAt", "updatedAt"].includes(k))
                .map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="text-slate-400 shrink-0 capitalize">{key}:</span>
                    <span className="text-slate-700 truncate">{String(value)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Connections */}
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
            Connections ({incomingEdges.length + outgoingEdges.length})
          </p>

          {outgoingEdges.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-slate-400 mb-1">Outgoing</p>
              <ul className="space-y-1">
                {outgoingEdges.slice(0, 5).map((edge) => {
                  const target = getNodeById(edge.target);
                  return (
                    <li key={edge.id} className="flex items-center gap-2 text-sm">
                      <span className="text-indigo-400">→</span>
                      <span className="text-slate-600 truncate">{target?.label ?? edge.target}</span>
                      {edge.type && (
                        <span className="text-xs text-slate-400 italic">{edge.type}</span>
                      )}
                    </li>
                  );
                })}
                {outgoingEdges.length > 5 && (
                  <li className="text-xs text-slate-400">+{outgoingEdges.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {incomingEdges.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Incoming</p>
              <ul className="space-y-1">
                {incomingEdges.slice(0, 5).map((edge) => {
                  const src = getNodeById(edge.source);
                  return (
                    <li key={edge.id} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-400">←</span>
                      <span className="text-slate-600 truncate">{src?.label ?? edge.source}</span>
                      {edge.type && (
                        <span className="text-xs text-slate-400 italic">{edge.type}</span>
                      )}
                    </li>
                  );
                })}
                {incomingEdges.length > 5 && (
                  <li className="text-xs text-slate-400">+{incomingEdges.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
            <p className="text-sm text-slate-400 italic">No connections</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-slate-100 space-y-2">
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(node)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
          <Link
            href={`/knowledge/${node.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
              bg-slate-50 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open
          </Link>
        </div>

        {showDeleteConfirm ? (
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
              text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Node
          </button>
        )}
      </div>
    </div>
  );
}
