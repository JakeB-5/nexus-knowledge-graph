"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Command {
  id: string;
  label: string;
  description?: string;
  category: "Navigation" | "Actions" | "Recent" | "Settings";
  shortcut?: string;
  icon: string;
  href?: string;
  action?: () => void;
}

const ALL_COMMANDS: Command[] = [
  // Navigation
  { id: "nav-dashboard", label: "Go to Dashboard", category: "Navigation", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", href: "/dashboard", shortcut: "G D" },
  { id: "nav-graph", label: "Open Graph Explorer", category: "Navigation", icon: "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z", href: "/visualize", shortcut: "G G" },
  { id: "nav-workspaces", label: "Go to Workspaces", category: "Navigation", icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z", href: "/workspaces", shortcut: "G W" },
  { id: "nav-collections", label: "Go to Collections", category: "Navigation", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z", href: "/collections", shortcut: "G C" },
  { id: "nav-search", label: "Advanced Search", category: "Navigation", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z", href: "/advanced-search", shortcut: "G S" },
  { id: "nav-compare", label: "Compare Nodes", category: "Navigation", icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5", href: "/compare" },
  { id: "nav-templates", label: "Browse Templates", category: "Navigation", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z", href: "/templates" },
  { id: "nav-integrations", label: "Integrations", category: "Navigation", icon: "M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5z", href: "/integrations" },
  { id: "nav-notifications", label: "Notifications", category: "Navigation", icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0", href: "/notifications" },
  // Actions
  { id: "act-new-node", label: "Create New Node", description: "Add a new knowledge node", category: "Actions", icon: "M12 4.5v15m7.5-7.5h-15", shortcut: "N N" },
  { id: "act-new-edge", label: "Create New Edge", description: "Link two existing nodes", category: "Actions", icon: "M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3", shortcut: "N E" },
  { id: "act-new-collection", label: "Create Collection", description: "Group related nodes together", category: "Actions", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5", shortcut: "N C" },
  { id: "act-import", label: "Import Data", description: "Bulk import nodes and edges", category: "Actions", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5", href: "/import" },
  { id: "act-new-workspace", label: "Create Workspace", description: "Start a new collaboration space", category: "Actions", icon: "M12 4.5v15m7.5-7.5h-15", href: "/workspaces" },
  // Recent
  { id: "rec-1", label: "Transformer Architecture", description: "Visited 1h ago", category: "Recent", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "rec-2", label: "AI Research Hub", description: "Workspace · Visited 2h ago", category: "Recent", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "rec-3", label: "GPT-4 Technical Report", description: "Visited 5h ago", category: "Recent", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  // Settings
  { id: "set-profile", label: "Profile Settings", category: "Settings", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z", href: "/profile", shortcut: "G P" },
  { id: "set-shortcuts", label: "Keyboard Shortcuts", description: "View all shortcuts", category: "Settings", icon: "M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" },
  { id: "set-theme", label: "Toggle Dark Mode", category: "Settings", icon: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" },
];

const CATEGORY_ORDER: Command["category"][] = ["Recent", "Actions", "Navigation", "Settings"];

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  // Simple fuzzy: all chars in order
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(["rec-1", "rec-2", "rec-3"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? ALL_COMMANDS.filter(
        (cmd) =>
          fuzzyMatch(query, cmd.label) ||
          (cmd.description && fuzzyMatch(query, cmd.description))
      )
    : ALL_COMMANDS;

  // Group by category in defined order; sort Recent by recentIds order
  const grouped = CATEGORY_ORDER.reduce<{ category: Command["category"]; commands: Command[] }[]>((acc, cat) => {
    let cmds = filtered.filter((c) => c.category === cat);
    if (cat === "Recent") {
      cmds = [...cmds].sort((a, b) => {
        const ai = recentIds.indexOf(a.id);
        const bi = recentIds.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    if (cmds.length > 0) acc.push({ category: cat, commands: cmds });
    return acc;
  }, []);

  const flatFiltered = grouped.flatMap((g) => g.commands);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const cmd = flatFiltered[activeIndex];
        if (cmd) {
          setRecentIds((prev) => [cmd.id, ...prev.filter((id) => id !== cmd.id)].slice(0, 5));
          if (cmd.action) cmd.action();
          onClose();
        }
      }
    },
    [open, flatFiltered, activeIndex, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let globalIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0016.803 16.803z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, pages, nodes..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 font-mono flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {flatFiltered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            grouped.map(({ category, commands }) => (
              <div key={category}>
                <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                  {category}
                </div>
                {commands.map((cmd) => {
                  const idx = globalIndex++;
                  const isActive = idx === activeIndex;
                  const content = (
                    <div
                      key={cmd.id}
                      data-index={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        setRecentIds((prev) => [cmd.id, ...prev.filter((id) => id !== cmd.id)].slice(0, 5));
                        if (cmd.action) cmd.action();
                        onClose();
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        isActive ? "bg-nexus-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? "bg-nexus-100" : "bg-gray-100"}`}>
                        <svg className={`w-3.5 h-3.5 ${isActive ? "text-nexus-600" : "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={cmd.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? "text-nexus-700" : "text-gray-800"}`}>
                          {cmd.label}
                        </p>
                        {cmd.description && (
                          <p className="text-xs text-gray-400 truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {cmd.shortcut.split(" ").map((key, ki) => (
                            <kbd key={ki} className="text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 font-mono">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                  return cmd.href ? (
                    <Link key={cmd.id} href={cmd.href} onClick={onClose}>
                      {content}
                    </Link>
                  ) : (
                    <React.Fragment key={cmd.id}>{content}</React.Fragment>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 font-mono">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 font-mono">ESC</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

// Hook to wire up Cmd+K
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
