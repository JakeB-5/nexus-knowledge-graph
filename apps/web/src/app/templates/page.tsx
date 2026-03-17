"use client";

import React, { useState } from "react";
import Link from "next/link";

const CATEGORIES = ["All", "Research", "Project Management", "Personal", "Team", "Engineering"];

const MOCK_TEMPLATES = [
  {
    id: "1",
    title: "Research Notes",
    description: "Organize research papers, experiments, hypotheses, and findings in a structured knowledge graph.",
    category: "Research",
    nodeCount: 24,
    edgeCount: 48,
    color: "from-blue-400 to-nexus-500",
    icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5",
    author: "Nexus Team",
    uses: 1842,
  },
  {
    id: "2",
    title: "Project Management",
    description: "Track tasks, milestones, dependencies, and team assignments in an interconnected project graph.",
    category: "Project Management",
    nodeCount: 32,
    edgeCount: 61,
    color: "from-green-400 to-emerald-500",
    icon: "M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122",
    author: "Nexus Team",
    uses: 3201,
  },
  {
    id: "3",
    title: "Personal Wiki",
    description: "Build your personal knowledge base with linked notes, bookmarks, ideas, and references.",
    category: "Personal",
    nodeCount: 18,
    edgeCount: 29,
    color: "from-purple-400 to-violet-500",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
    author: "Nexus Team",
    uses: 2654,
  },
  {
    id: "4",
    title: "Team Directory",
    description: "Map your organization's people, roles, teams, and relationships with skills and project connections.",
    category: "Team",
    nodeCount: 40,
    edgeCount: 87,
    color: "from-orange-400 to-amber-500",
    icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
    author: "Nexus Team",
    uses: 987,
  },
  {
    id: "5",
    title: "Engineering Knowledge Base",
    description: "Document architecture decisions, system components, APIs, and technical dependencies.",
    category: "Engineering",
    nodeCount: 56,
    edgeCount: 134,
    color: "from-gray-500 to-slate-600",
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
    author: "Nexus Team",
    uses: 1523,
  },
  {
    id: "6",
    title: "Academic Literature Map",
    description: "Connect academic papers, authors, institutions, and research themes into a citation network.",
    category: "Research",
    nodeCount: 30,
    edgeCount: 72,
    color: "from-teal-400 to-cyan-500",
    icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
    author: "Community",
    uses: 743,
  },
  {
    id: "7",
    title: "Product Roadmap",
    description: "Visualize features, user stories, milestones, and release dependencies for product planning.",
    category: "Project Management",
    nodeCount: 28,
    edgeCount: 55,
    color: "from-pink-400 to-rose-500",
    icon: "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z",
    author: "Nexus Team",
    uses: 2109,
  },
  {
    id: "8",
    title: "Mind Map Starter",
    description: "Free-form mind mapping template with central topic, branches, and sub-branches for brainstorming.",
    category: "Personal",
    nodeCount: 15,
    edgeCount: 14,
    color: "from-yellow-400 to-orange-400",
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    author: "Community",
    uses: 4521,
  },
];

function TemplateCard({ template }: { template: typeof MOCK_TEMPLATES[0] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:border-nexus-200 transition-all duration-200 flex flex-col">
      {/* Preview */}
      <div className={`h-36 bg-gradient-to-br ${template.color} flex items-center justify-center relative`}>
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={template.icon} />
          </svg>
        </div>
        <div className="absolute top-3 right-3">
          <span className="text-xs px-2 py-0.5 bg-white/20 text-white rounded-full backdrop-blur-sm font-medium">
            {template.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 mb-1">{template.title}</h3>
        <p className="text-gray-500 text-sm line-clamp-2 flex-1 mb-4">{template.description}</p>

        <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
          <div className="flex items-center gap-3">
            <span>{template.nodeCount} nodes</span>
            <span>{template.edgeCount} edges</span>
          </div>
          <span>{template.uses.toLocaleString()} uses</span>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/templates/${template.id}`}
            className="flex-1 text-center px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
          >
            Preview
          </Link>
          <button className="flex-1 px-3 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
            Use Template
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = MOCK_TEMPLATES.filter((t) => {
    const matchesCategory = activeCategory === "All" || t.category === activeCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Template Gallery</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Start your knowledge graph in seconds with pre-built templates crafted by the Nexus team and community.
          </p>
        </div>

        {/* Search + Create Custom */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
            </svg>
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-nexus-300 text-nexus-700 bg-nexus-50 rounded-xl text-sm font-medium hover:bg-nexus-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Custom Template
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-nexus-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-nexus-300 hover:text-nexus-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <p className="text-sm text-gray-400 mb-4">{filtered.length} templates</p>

        {/* Template Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 font-medium">No templates found</p>
            <p className="text-gray-400 text-sm mt-1">Try a different search term or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
