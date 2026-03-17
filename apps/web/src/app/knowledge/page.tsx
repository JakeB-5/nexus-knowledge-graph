import React from "react";
import Link from "next/link";

// Mock data - in production these come from API
const RECENT_DOCUMENTS = [
  { id: "1", title: "Quantum Computing Fundamentals", type: "document", updatedAt: "2026-03-16", connections: 12 },
  { id: "2", title: "Neural Network Architecture", type: "concept", updatedAt: "2026-03-15", connections: 8 },
  { id: "3", title: "Alan Turing", type: "person", updatedAt: "2026-03-14", connections: 24 },
  { id: "4", title: "Machine Learning Pipeline", type: "document", updatedAt: "2026-03-13", connections: 6 },
  { id: "5", title: "Cambridge University", type: "place", updatedAt: "2026-03-12", connections: 15 },
  { id: "6", title: "AI Research Conference 2025", type: "event", updatedAt: "2026-03-11", connections: 9 },
];

const POPULAR_CONCEPTS = [
  { id: "c1", title: "Deep Learning", connections: 47 },
  { id: "c2", title: "Transformer Architecture", connections: 38 },
  { id: "c3", title: "Backpropagation", connections: 31 },
  { id: "c4", title: "Attention Mechanism", connections: 29 },
  { id: "c5", title: "Gradient Descent", connections: 25 },
  { id: "c6", title: "Convolutional Neural Network", connections: 22 },
];

const TAG_CLOUD = [
  { tag: "machine-learning", count: 34 },
  { tag: "ai", count: 29 },
  { tag: "neural-networks", count: 22 },
  { tag: "python", count: 19 },
  { tag: "research", count: 17 },
  { tag: "mathematics", count: 14 },
  { tag: "computer-science", count: 12 },
  { tag: "statistics", count: 10 },
  { tag: "optimization", count: 9 },
  { tag: "data", count: 8 },
  { tag: "algorithms", count: 7 },
  { tag: "nlp", count: 6 },
];

const NODE_TYPE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  concept: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  document: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  person: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  place: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  event: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  tag: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tagFontSize(count: number, max: number): string {
  const ratio = count / max;
  if (ratio > 0.8) return "text-lg font-bold";
  if (ratio > 0.5) return "text-base font-semibold";
  if (ratio > 0.3) return "text-sm font-medium";
  return "text-xs";
}

export default function KnowledgePage() {
  const maxTagCount = Math.max(...TAG_CLOUD.map((t) => t.count));

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
          <p className="text-slate-500 mt-1">Explore and manage your knowledge graph</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/explore"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm
              font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            View Graph
          </Link>
          <Link
            href="/knowledge/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm
              font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Node
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Nodes", value: "1,284", icon: "⬡", color: "text-indigo-600" },
          { label: "Connections", value: "4,891", icon: "↔", color: "text-emerald-600" },
          { label: "Collections", value: "23", icon: "⊞", color: "text-amber-600" },
          { label: "This Week", value: "+47", icon: "↑", color: "text-purple-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              <span className={`text-lg ${stat.color}`}>{stat.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent documents */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recently Updated</h2>
            <Link href="/search" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {RECENT_DOCUMENTS.map((doc) => {
              const styles = NODE_TYPE_STYLES[doc.type] ?? { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-500" };
              return (
                <Link
                  key={doc.id}
                  href={`/knowledge/${doc.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                >
                  <div className={`w-8 h-8 rounded-lg ${styles.bg} flex items-center justify-center shrink-0`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs capitalize ${styles.text}`}>{doc.type}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{doc.connections} connections</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(doc.updatedAt)}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Popular concepts */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">Popular Concepts</h2>
            </div>
            <div className="p-3 space-y-1">
              {POPULAR_CONCEPTS.map((concept, i) => (
                <Link
                  key={concept.id}
                  href={`/knowledge/${concept.id}`}
                  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-medium">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-700 group-hover:text-indigo-700 transition-colors truncate">
                      {concept.title}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">{concept.connections}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Tag cloud */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">Tags</h2>
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {TAG_CLOUD.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/search?tag=${tag}`}
                  className={`text-slate-600 hover:text-indigo-700 transition-colors ${tagFontSize(count, maxTagCount)}`}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick create buttons */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Quick Create</h2>
        <p className="text-sm text-slate-500 mb-4">Start adding to your knowledge base</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(NODE_TYPE_STYLES).map(([type, styles]) => (
            <Link
              key={type}
              href={`/knowledge/new?type=${type}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl ${styles.bg} ${styles.text}
                text-sm font-medium hover:opacity-80 transition-opacity`}
            >
              <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
              New {type}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
