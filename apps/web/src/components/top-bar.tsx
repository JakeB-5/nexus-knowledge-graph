"use client";

import { useState } from "react";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";

const MOCK_USER = {
  name: "Alex Johnson",
  email: "alex@nexus.app",
  role: "Admin",
};

interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[];
}

export function TopBar({ breadcrumbs }: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifications = [
    { id: "1", text: "New user joined: sarah@example.com", time: "5m ago", unread: true },
    { id: "2", text: "Node 'Machine Learning' was updated", time: "1h ago", unread: true },
    { id: "3", text: "Backup completed successfully", time: "3h ago", unread: false },
  ];
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <header className="flex h-16 items-center gap-4 border-b border-gray-100 bg-white px-6">
      {/* Breadcrumbs */}
      <div className="flex-1 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumbs items={breadcrumbs} />
        ) : (
          <span className="text-sm font-semibold text-gray-900">Dashboard</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Search shortcut */}
        <Link
          href="/search"
          className="hidden sm:flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <span>Search</span>
          <kbd className="ml-1 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-mono text-gray-500">⌘K</kbd>
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
            aria-label={`Notifications (${unreadCount} unread)`}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-nexus-600 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-gray-100 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <span className="text-sm font-semibold text-gray-900">Notifications</span>
                  <button className="text-xs text-nexus-600 hover:underline">Mark all read</button>
                </div>
                <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      {n.unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-nexus-500" />
                      )}
                      <div className={n.unread ? "" : "pl-5"}>
                        <p className="text-sm text-gray-700">{n.text}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{n.time}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-100 px-4 py-2.5 text-center">
                  <button className="text-xs font-medium text-nexus-600 hover:underline">View all notifications</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
            aria-label="User menu"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-nexus-600 text-xs font-semibold text-white">
              {getInitials(MOCK_USER.name)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-900 leading-none">{MOCK_USER.name}</p>
              <p className="mt-0.5 text-[10px] text-gray-500">{MOCK_USER.role}</p>
            </div>
            <svg className="h-3.5 w-3.5 text-gray-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-11 z-40 w-52 rounded-xl border border-gray-100 bg-white shadow-lg py-1.5">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{MOCK_USER.name}</p>
                  <p className="text-xs text-gray-500">{MOCK_USER.email}</p>
                </div>
                <Link href="/dashboard/settings" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  Profile
                </Link>
                <Link href="/dashboard/settings" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </Link>
                <div className="my-1 border-t border-gray-100" />
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
