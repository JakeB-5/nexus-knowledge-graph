import React from 'react';
import Link from 'next/link';

const VISUALIZATION_CARDS = [
  {
    href: '/visualize/graph-explorer',
    title: 'Graph Explorer',
    description: 'Interactively explore your knowledge graph. Pan, zoom, drag nodes, and expand neighbors to discover connections.',
    icon: '⬡',
    color: 'from-indigo-500 to-purple-600',
    badge: 'Interactive',
    stats: ['Force-directed layout', 'Node filtering', 'Drag & drop'],
  },
  {
    href: '/visualize/analytics-dashboard',
    title: 'Analytics Dashboard',
    description: 'Track growth trends, node distributions, activity patterns, and top connected nodes with live charts.',
    icon: '▣',
    color: 'from-blue-500 to-cyan-600',
    badge: 'Charts',
    stats: ['Line charts', 'Pie charts', 'Heatmaps'],
  },
  {
    href: '/visualize/network-analysis',
    title: 'Network Analysis',
    description: 'Run centrality analysis, detect communities, and find shortest paths between any two nodes.',
    icon: '◎',
    color: 'from-emerald-500 to-teal-600',
    badge: 'Analysis',
    stats: ['Centrality scores', 'Path finding', 'Communities'],
  },
  {
    href: '#',
    title: 'Node Map',
    description: 'Spatial map of nodes by semantic similarity. Cluster-aware layout with color-coded topic groups.',
    icon: '◉',
    color: 'from-orange-500 to-amber-600',
    badge: 'Coming soon',
    stats: ['Semantic clustering', 'Topic groups', 'Zoom levels'],
  },
];

const RECENT_VISUALIZATIONS = [
  { id: '1', name: 'Research Paper Network', type: 'Graph Explorer', date: '2 hours ago', nodes: 142, edges: 387 },
  { id: '2', name: 'Q1 Growth Analysis', type: 'Analytics Dashboard', date: 'Yesterday', nodes: 0, edges: 0 },
  { id: '3', name: 'Author Collaboration Map', type: 'Graph Explorer', date: '3 days ago', nodes: 58, edges: 123 },
  { id: '4', name: 'Topic Centrality Report', type: 'Network Analysis', date: 'Last week', nodes: 0, edges: 0 },
];

export default function VisualizePage() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Visualization Hub</h1>
        <p className="text-gray-500 text-sm">
          Explore, analyze, and understand your knowledge graph through interactive visualizations.
        </p>
      </div>

      {/* Visualization cards */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Available Visualizations</h2>
          <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            + Create Custom
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VISUALIZATION_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-white hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${card.badge === 'Coming soon' ? 'pointer-events-none opacity-60' : ''}`}
            >
              {/* Gradient accent */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.color}`} />

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white text-lg`}>
                    {card.icon}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    card.badge === 'Coming soon'
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {card.badge}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-indigo-700 transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                  {card.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {card.stats.map((stat) => (
                    <span key={stat} className="text-xs px-2 py-0.5 bg-gray-50 text-gray-500 rounded-md border border-gray-100">
                      {stat}
                    </span>
                  ))}
                </div>
              </div>

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">Click to open</span>
                <span className="text-gray-400 group-hover:text-indigo-600 transition-colors text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent visualizations */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Recent Sessions</h2>
          <button className="text-xs text-gray-400 hover:text-gray-600">View all</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Size</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last opened</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {RECENT_VISUALIZATIONS.map((viz, i) => (
                <tr key={viz.id} className={`${i < RECENT_VISUALIZATIONS.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{viz.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-xs">{viz.type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {viz.nodes > 0 ? `${viz.nodes} nodes, ${viz.edges} edges` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{viz.date}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick stats */}
      <section className="mt-8 grid grid-cols-3 gap-4">
        {[
          { label: 'Total Nodes', value: '12,483', change: '+124 this week' },
          { label: 'Total Edges', value: '38,921', change: '+891 this week' },
          { label: 'Graph Density', value: '0.0003', change: 'Sparse network' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className="text-xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stat.change}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
