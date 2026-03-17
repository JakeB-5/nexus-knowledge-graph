import { formatNumber } from "@/lib/utils";

// Mock chart data
const GROWTH_DATA = [
  { month: "Sep", nodes: 8200, edges: 22000 },
  { month: "Oct", nodes: 9100, edges: 25500 },
  { month: "Nov", nodes: 9800, edges: 27800 },
  { month: "Dec", nodes: 10400, edges: 29900 },
  { month: "Jan", nodes: 11200, edges: 33000 },
  { month: "Feb", nodes: 12000, edges: 36500 },
  { month: "Mar", nodes: 12847, edges: 38291 },
];

const TOP_NODES = [
  { id: "n1", title: "Machine Learning", connectionCount: 284, type: "concept" },
  { id: "n2", title: "Artificial Intelligence", connectionCount: 271, type: "concept" },
  { id: "n3", title: "Neural Networks", connectionCount: 243, type: "concept" },
  { id: "n4", title: "Data Science", connectionCount: 218, type: "concept" },
  { id: "n5", title: "Deep Learning", connectionCount: 196, type: "concept" },
  { id: "n6", title: "Python", connectionCount: 182, type: "document" },
  { id: "n7", title: "Natural Language Processing", connectionCount: 174, type: "concept" },
  { id: "n8", title: "Computer Vision", connectionCount: 162, type: "concept" },
  { id: "n9", title: "Reinforcement Learning", connectionCount: 149, type: "concept" },
  { id: "n10", title: "Graph Theory", connectionCount: 137, type: "concept" },
];

const SEARCH_QUERIES = [
  { query: "machine learning basics", count: 342, avgResults: 47 },
  { query: "neural network architecture", count: 298, avgResults: 32 },
  { query: "graph algorithms", count: 241, avgResults: 28 },
  { query: "python data structures", count: 215, avgResults: 51 },
  { query: "quantum computing", count: 187, avgResults: 19 },
  { query: "deep learning models", count: 174, avgResults: 38 },
  { query: "distributed systems", count: 158, avgResults: 23 },
];

const NODE_TYPE_DIST = [
  { type: "Concept", count: 6840, pct: 53, color: "bg-nexus-500" },
  { type: "Document", count: 3208, pct: 25, color: "bg-purple-500" },
  { type: "Person", count: 1542, pct: 12, color: "bg-green-500" },
  { type: "Organization", count: 899, pct: 7, color: "bg-yellow-500" },
  { type: "Event / Place", count: 358, pct: 3, color: "bg-red-400" },
];

// 7-day user activity heatmap (hours × days)
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
function mockActivity(day: number, hour: number) {
  const base = hour >= 9 && hour <= 18 ? 0.6 : 0.1;
  const weekend = day >= 5 ? 0.3 : 1;
  return Math.min(1, Math.random() * base * weekend + 0.05);
}
const HEATMAP = DAYS.map((d, di) => ({
  day: d,
  hours: HOURS.map((h) => ({ hour: h, intensity: mockActivity(di, h) })),
}));

function intensityClass(v: number) {
  if (v < 0.2) return "bg-nexus-50";
  if (v < 0.4) return "bg-nexus-200";
  if (v < 0.6) return "bg-nexus-400";
  if (v < 0.8) return "bg-nexus-600";
  return "bg-nexus-800";
}

// Simple CSS bar chart for growth
const maxNodes = Math.max(...GROWTH_DATA.map((d) => d.nodes), 1);
const maxEdges = Math.max(...GROWTH_DATA.map((d) => d.edges), 1);

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Graph growth, usage patterns, and content distribution insights.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Nodes", value: "12,847", delta: "+847 this month" },
          { label: "Total Edges", value: "38,291", delta: "+1,791 this month" },
          { label: "Avg. Search/Day", value: "3,872", delta: "+12% vs last week" },
          { label: "Avg. Connections", value: "2.98", delta: "per node" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.delta}</p>
          </div>
        ))}
      </div>

      {/* Graph growth chart */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Graph Growth (Last 7 Months)</h2>
        <p className="mb-6 text-xs text-gray-400">Nodes and edges over time</p>

        {/* Legend */}
        <div className="mb-4 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-nexus-500" /> Nodes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-purple-400" /> Edges</span>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-3 h-48 px-2">
          {GROWTH_DATA.map((d) => (
            <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end gap-0.5 h-40">
                <div
                  className="flex-1 rounded-t-sm bg-nexus-500 transition-all"
                  style={{ height: `${(d.nodes / maxNodes) * 100}%` }}
                  title={`Nodes: ${formatNumber(d.nodes)}`}
                />
                <div
                  className="flex-1 rounded-t-sm bg-purple-400 transition-all"
                  style={{ height: `${(d.edges / maxEdges) * 100}%` }}
                  title={`Edges: ${formatNumber(d.edges)}`}
                />
              </div>
              <span className="text-xs text-gray-400">{d.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top nodes */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Most Connected Nodes</h2>
          <ol className="space-y-3">
            {TOP_NODES.map((node, i) => (
              <li key={node.id} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-gray-800">{node.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-nexus-500"
                      style={{ width: `${(node.connectionCount / TOP_NODES[0].connectionCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-gray-500">{node.connectionCount}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Search analytics */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Popular Search Queries</h2>
          <div className="space-y-3">
            {SEARCH_QUERIES.map((q) => (
              <div key={q.query} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700 truncate mr-2">"{q.query}"</span>
                  <span className="shrink-0 text-xs text-gray-400 tabular-nums">{q.count} searches</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-nexus-400"
                      style={{ width: `${(q.count / SEARCH_QUERIES[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">avg {q.avgResults} results</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Node type distribution */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Node Type Distribution</h2>
          <div className="space-y-3">
            {NODE_TYPE_DIST.map((t) => (
              <div key={t.type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{t.type}</span>
                  <span className="text-gray-500 tabular-nums">{formatNumber(t.count)} <span className="text-gray-400">({t.pct}%)</span></span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${t.color} transition-all`}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User activity heatmap */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">User Activity Heatmap</h2>
          <p className="mb-5 text-xs text-gray-400">Search activity by day and hour (last 7 days)</p>

          {/* Hour labels */}
          <div className="flex gap-1 mb-1 pl-8">
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-gray-400">
                {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {HEATMAP.map((row) => (
              <div key={row.day} className="flex items-center gap-1">
                <span className="w-7 text-right text-[10px] text-gray-400 shrink-0">{row.day}</span>
                {row.hours.map((cell) => (
                  <div
                    key={cell.hour}
                    className={`flex-1 h-5 rounded-sm ${intensityClass(cell.intensity)}`}
                    title={`${row.day} ${cell.hour}:00 — activity: ${Math.round(cell.intensity * 100)}%`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-400">
            <span>Low</span>
            {["bg-nexus-50", "bg-nexus-200", "bg-nexus-400", "bg-nexus-600", "bg-nexus-800"].map((c) => (
              <span key={c} className={`h-3 w-5 rounded-sm ${c}`} />
            ))}
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
