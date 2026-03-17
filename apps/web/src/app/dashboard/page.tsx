import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { ActivityFeed, type ActivityItem } from "@/components/activity-feed";
import { formatNumber } from "@/lib/utils";

// Mock data — replace with real API calls when backend is ready
const STATS = [
  { title: "Total Nodes", value: formatNumber(12_847), delta: 12, icon: "nodes" },
  { title: "Total Edges", value: formatNumber(38_291), delta: 8, icon: "edges" },
  { title: "Active Users", value: formatNumber(1_204), delta: 5, icon: "users" },
  { title: "Searches Today", value: formatNumber(3_872), delta: -3, icon: "search" },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: "1",
    type: "node_created",
    actorName: "Sarah Chen",
    description: "created node",
    targetTitle: "Quantum Computing",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "2",
    type: "edge_created",
    actorName: "Marcus Williams",
    description: "linked",
    targetTitle: "AI Ethics → Machine Learning",
    createdAt: new Date(Date.now() - 23 * 60_000).toISOString(),
  },
  {
    id: "3",
    type: "user_joined",
    actorName: "Priya Patel",
    description: "joined the workspace",
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  },
  {
    id: "4",
    type: "node_updated",
    actorName: "James Rodriguez",
    description: "updated node",
    targetTitle: "Neural Networks",
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  {
    id: "5",
    type: "search",
    actorName: "Emma Thompson",
    description: 'searched for "distributed systems"',
    createdAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  },
  {
    id: "6",
    type: "node_deleted",
    actorName: "Admin",
    description: "deleted node",
    targetTitle: "Deprecated: Old API",
    createdAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
  },
];

const QUICK_ACTIONS = [
  {
    label: "Create Node",
    description: "Add a new knowledge node",
    href: "/dashboard/nodes",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
    color: "bg-nexus-50 text-nexus-600 hover:bg-nexus-100",
  },
  {
    label: "Import Data",
    description: "Bulk import nodes & edges",
    href: "/dashboard/nodes",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    color: "bg-green-50 text-green-600 hover:bg-green-100",
  },
  {
    label: "Search Graph",
    description: "Explore the knowledge graph",
    href: "/search",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
      </svg>
    ),
    color: "bg-purple-50 text-purple-600 hover:bg-purple-100",
  },
  {
    label: "View Analytics",
    description: "Graph growth & insights",
    href: "/dashboard/analytics",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    color: "bg-yellow-50 text-yellow-600 hover:bg-yellow-100",
  },
];

const GRAPH_HEALTH = [
  { label: "Avg. Connections per Node", value: "2.98", status: "good" },
  { label: "Orphaned Nodes", value: "142", status: "warn" },
  { label: "Circular References", value: "0", status: "good" },
  { label: "Largest Component Size", value: "11,203", status: "good" },
  { label: "Graph Density", value: "0.003", status: "info" },
];

const STATUS_DOT: Record<string, string> = {
  good: "bg-green-400",
  warn: "bg-yellow-400",
  info: "bg-nexus-400",
  bad: "bg-red-400",
};

function NodesIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
    </svg>
  );
}
function EdgesIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
  );
}

const STAT_ICONS: Record<string, React.ReactNode> = {
  nodes: <NodesIcon />,
  edges: <EdgesIcon />,
  users: <UsersIcon />,
  search: <SearchIcon />,
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back. Here&apos;s what&apos;s happening with your knowledge graph.
          </p>
        </div>
        <Link
          href="/dashboard/nodes"
          className="inline-flex items-center gap-2 rounded-xl bg-nexus-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nexus-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Node
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            delta={stat.delta}
            icon={STAT_ICONS[stat.icon]}
          />
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activity feed */}
        <div className="lg:col-span-2 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/dashboard/analytics" className="text-sm font-medium text-nexus-600 hover:underline">
              View all
            </Link>
          </div>
          <ActivityFeed items={ACTIVITY} />
        </div>

        {/* Graph health */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">Graph Health</h2>
          <ul className="space-y-3">
            {GRAPH_HEALTH.map((metric) => (
              <li key={metric.label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[metric.status]}`} />
                  <span className="text-sm text-gray-600 truncate">{metric.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{metric.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-gray-200"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${action.color}`}>
                {action.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-nexus-700 transition-colors">
                  {action.label}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 truncate">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
