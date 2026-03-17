"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface UserMenuProps {
  userName?: string;
  userEmail?: string;
  userInitial?: string;
  currentWorkspace?: string;
}

const MENU_ITEMS = [
  {
    group: "Account",
    items: [
      { label: "Your Profile", href: "/profile", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
      { label: "Account Settings", href: "/profile", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" },
    ],
  },
  {
    group: "Preferences",
    items: [
      { label: "Keyboard Shortcuts", href: null, icon: "M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5", shortcut: "?" },
      { label: "Toggle Theme", href: null, icon: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" },
    ],
  },
  {
    group: "Help",
    items: [
      { label: "Help & Docs", href: "/help", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
      { label: "API Documentation", href: "/api-docs", icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" },
    ],
  },
];

export function UserMenu({
  userName = "Sarah Chen",
  userEmail = "sarah@example.com",
  userInitial = "S",
  currentWorkspace = "AI Research Hub",
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-sm font-bold hover:ring-2 hover:ring-nexus-400 transition-all"
        aria-label="User menu"
      >
        {userInitial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-nexus-200 flex items-center justify-center text-nexus-700 text-base font-bold flex-shrink-0">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              </div>
            </div>
            {/* Workspace indicator */}
            <div className="mt-3 flex items-center gap-2 px-2.5 py-2 bg-nexus-50 rounded-lg border border-nexus-100">
              <svg className="w-3.5 h-3.5 text-nexus-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <span className="text-xs font-medium text-nexus-700 truncate">{currentWorkspace}</span>
              <Link
                href="/workspaces"
                onClick={() => setOpen(false)}
                className="ml-auto text-xs text-nexus-500 hover:text-nexus-700 transition-colors flex-shrink-0"
              >
                Switch
              </Link>
            </div>
          </div>

          {/* Menu groups */}
          {MENU_ITEMS.map(({ group, items }) => (
            <div key={group} className="border-b border-gray-100 last:border-0">
              <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {group}
              </div>
              {items.map((item) => {
                const inner = (
                  <div
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (item.label === "Toggle Theme") {
                        setDarkMode((v) => !v);
                      }
                      if (!item.href) setOpen(false);
                    }}
                  >
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    <span className="flex-1">{item.label}</span>
                    {item.label === "Toggle Theme" && (
                      <div className={`w-8 h-4 rounded-full transition-colors relative ${darkMode ? "bg-nexus-600" : "bg-gray-200"}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${darkMode ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                    )}
                    {"shortcut" in item && item.shortcut && (
                      <kbd className="text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 font-mono">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                );
                return item.href ? (
                  <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <React.Fragment key={item.label}>{inner}</React.Fragment>
                );
              })}
            </div>
          ))}

          {/* Sign out */}
          <div className="px-4 py-2">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
