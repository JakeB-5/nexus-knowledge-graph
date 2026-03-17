import React from "react";
import Link from "next/link";

interface NodePageProps {
  params: Promise<{ nodeId: string }>;
}

// Mock data fetcher - replace with real API call
async function getNode(nodeId: string) {
  return {
    id: nodeId,
    title: "Quantum Computing Fundamentals",
    type: "document",
    content: `Quantum computing is a type of computation that harnesses quantum mechanical phenomena such as superposition and entanglement to perform operations on data.

Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits (qubits) that can exist in multiple states simultaneously. This allows quantum computers to solve certain problems exponentially faster than classical computers.

Key concepts include:
- **Superposition**: A qubit can be in a combination of 0 and 1 states simultaneously
- **Entanglement**: Qubits can be correlated in ways that have no classical equivalent
- **Interference**: Quantum algorithms exploit constructive and destructive interference
- **Measurement**: Observing a qubit collapses its state to a definite 0 or 1

Applications include cryptography, optimization, drug discovery, and financial modeling.`,
    tags: ["quantum", "computing", "physics", "algorithms"],
    metadata: {
      author: "Research Team",
      status: "published",
      version: "2.1",
      wordCount: "1,240",
    },
    createdAt: "2025-11-01T10:30:00Z",
    updatedAt: "2026-03-16T14:22:00Z",
    connections: {
      outgoing: [
        { id: "e1", targetId: "n2", targetTitle: "Shor's Algorithm", targetType: "concept", edgeType: "contains" },
        { id: "e2", targetId: "n3", targetTitle: "Grover's Algorithm", targetType: "concept", edgeType: "contains" },
        { id: "e3", targetId: "n4", targetTitle: "IBM Quantum", targetType: "place", edgeType: "relates_to" },
      ],
      incoming: [
        { id: "e4", sourceId: "n5", sourceTitle: "Computer Science Overview", sourceType: "document", edgeType: "references" },
        { id: "e5", sourceId: "n6", sourceTitle: "Future of Technology", sourceType: "document", edgeType: "mentions" },
      ],
    },
  };
}

const NODE_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  concept: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  document: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  person: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  place: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  event: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  tag: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export default async function NodeDetailPage({ params }: NodePageProps) {
  const { nodeId } = await params;
  const node = await getNode(nodeId);
  const DEFAULT_STYLE = { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  const typeStyles = NODE_TYPE_STYLES[node.type] ?? DEFAULT_STYLE;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/knowledge" className="hover:text-slate-700 transition-colors">Knowledge Base</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-slate-700 truncate">{node.title}</span>
      </nav>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${typeStyles.bg} ${typeStyles.text}`}>
                {node.type}
              </span>
              {node.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/search?tag=${tag}`}
                  className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{node.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
              <span>Created {formatDate(node.createdAt)}</span>
              <span>·</span>
              <span>Updated {formatRelative(node.updatedAt)}</span>
              <span>·</span>
              <span>{node.connections.incoming.length + node.connections.outgoing.length} connections</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Share button */}
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm
              text-slate-600 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>

            {/* Edit button */}
            <Link
              href={`/knowledge/${nodeId}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm
                font-medium hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Content */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Content</h2>
            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
              {node.content.split("\n\n").map((para, i) => (
                <p key={i} className="text-slate-700 mb-3 last:mb-0">{para}</p>
              ))}
            </div>
          </div>

          {/* Connections */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Related Nodes</h2>
              <Link href={`/explore?root=${nodeId}`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                View in graph
              </Link>
            </div>

            {node.connections.outgoing.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-slate-400 font-medium mb-2">This node references</p>
                <div className="space-y-2">
                  {node.connections.outgoing.map((conn) => {
                    const s = NODE_TYPE_STYLES[conn.targetType] ?? DEFAULT_STYLE;
                    return (
                      <Link
                        key={conn.id}
                        href={`/knowledge/${conn.targetId}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200
                          hover:bg-indigo-50 transition-colors group"
                      >
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${s.bg} ${s.text}`}>
                          {conn.targetType}
                        </span>
                        <span className="flex-1 text-sm text-slate-700 group-hover:text-indigo-700 transition-colors font-medium">
                          {conn.targetTitle}
                        </span>
                        <span className="text-xs text-slate-400 italic">{conn.edgeType.replace(/_/g, " ")}</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {node.connections.incoming.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">Referenced by</p>
                <div className="space-y-2">
                  {node.connections.incoming.map((conn) => {
                    const s = NODE_TYPE_STYLES[conn.sourceType] ?? DEFAULT_STYLE;
                    return (
                      <Link
                        key={conn.id}
                        href={`/knowledge/${conn.sourceId}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-emerald-200
                          hover:bg-emerald-50 transition-colors group"
                      >
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${s.bg} ${s.text}`}>
                          {conn.sourceType}
                        </span>
                        <span className="flex-1 text-sm text-slate-700 group-hover:text-emerald-700 transition-colors font-medium">
                          {conn.sourceTitle}
                        </span>
                        <span className="text-xs text-slate-400 italic">{conn.edgeType.replace(/_/g, " ")}</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Comments placeholder */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Comments</h2>
            <div className="flex items-center justify-center py-8 text-slate-400">
              <div className="text-center">
                <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm">Comments coming soon</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Metadata */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Details</h2>
            <div className="space-y-3">
              {Object.entries(node.metadata).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-slate-400 capitalize mb-0.5">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="text-sm text-slate-700 font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Actions</h2>
            <div className="space-y-2">
              <Link
                href={`/knowledge/${nodeId}/history`}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-slate-600
                  hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Version History
              </Link>
              <Link
                href={`/explore?root=${nodeId}`}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-slate-600
                  hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Open in Graph
              </Link>
              <button className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-red-500
                hover:bg-red-50 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Node
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
