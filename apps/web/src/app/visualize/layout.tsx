import React from 'react';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/visualize', label: 'Overview', icon: '◈' },
  { href: '/visualize/graph-explorer', label: 'Graph Explorer', icon: '⬡' },
  { href: '/visualize/analytics-dashboard', label: 'Analytics', icon: '▣' },
  { href: '/visualize/network-analysis', label: 'Network Analysis', icon: '◎' },
];

export default function VisualizeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
              N
            </div>
            <span className="text-sm font-semibold text-gray-800">Visualize</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors group"
            >
              <span className="text-base group-hover:text-indigo-600 transition-colors">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span>←</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
