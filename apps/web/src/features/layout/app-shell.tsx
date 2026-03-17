import React from "react";
import Link from "next/link";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    label: "Graph",
    href: "/visualize",
    icon: "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z",
  },
  {
    label: "Workspaces",
    href: "/workspaces",
    icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  },
  {
    label: "Collections",
    href: "/collections",
    icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  },
  {
    label: "Search",
    href: "/advanced-search",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z",
  },
  {
    label: "Templates",
    href: "/templates",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
  },
  {
    label: "Import",
    href: "/import",
    icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  },
  {
    label: "Integrations",
    href: "/integrations",
    icon: "M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z",
  },
];

const BOTTOM_NAV = [
  { label: "Profile", href: "/profile", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
  { label: "Settings", href: "/profile", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" },
];

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  notificationCount?: number;
  currentWorkspace?: string;
}

export function AppShell({ children, breadcrumbs, notificationCount = 0, currentWorkspace = "AI Research Hub" }: AppShellProps) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-60 flex-col bg-white border-r border-gray-100 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-nexus-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Nexus</span>
        </div>

        {/* Workspace indicator */}
        <div className="mx-3 mt-3 mb-1 px-3 py-2.5 bg-nexus-50 rounded-xl border border-nexus-100">
          <p className="text-[10px] font-semibold text-nexus-500 uppercase tracking-widest mb-0.5">Current Workspace</p>
          <p className="text-sm font-semibold text-nexus-800 truncate">{currentWorkspace}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-nexus-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom nav */}
        <div className="px-3 py-3 border-t border-gray-100 space-y-0.5">
          {BOTTOM_NAV.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
            >
              <svg className="w-4 h-4 text-gray-400 group-hover:text-nexus-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 flex-shrink-0">
          {/* Mobile menu button */}
          <button className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1.5 text-sm text-gray-400 flex-1 min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-nexus-600 transition-colors truncate">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-700 font-medium truncate">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Quick search trigger */}
            <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-400 hover:bg-gray-200 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
              </svg>
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden md:inline text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
            </button>

            {/* Notification bell */}
            <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </button>

            {/* User avatar */}
            <button className="w-8 h-8 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-sm font-bold hover:ring-2 hover:ring-nexus-400 transition-all">
              S
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between text-xs text-gray-400 flex-shrink-0">
          <span>Nexus Knowledge Graph &copy; 2025</span>
          <div className="flex items-center gap-4">
            <Link href="/help" className="hover:text-gray-600 transition-colors">Help</Link>
            <Link href="/api-docs" className="hover:text-gray-600 transition-colors">API Docs</Link>
            <span>v2.4.1</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
