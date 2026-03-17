"use client";

import React, { useState } from "react";
import Link from "next/link";

const ACTIONS = [
  {
    id: "node",
    label: "New Node",
    icon: "M12 4.5v15m7.5-7.5h-15",
    color: "bg-nexus-600 hover:bg-nexus-700 text-white",
    href: null,
  },
  {
    id: "edge",
    label: "New Edge",
    icon: "M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3",
    color: "bg-purple-600 hover:bg-purple-700 text-white",
    href: null,
  },
  {
    id: "collection",
    label: "New Collection",
    icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
    color: "bg-green-600 hover:bg-green-700 text-white",
    href: null,
  },
  {
    id: "import",
    label: "Import",
    icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    color: "bg-orange-500 hover:bg-orange-600 text-white",
    href: "/import",
  },
];

interface QuickCreateProps {
  className?: string;
}

export function QuickCreate({ className = "" }: QuickCreateProps) {
  const [expanded, setExpanded] = useState(false);

  function handleToggle() {
    setExpanded((v) => !v);
  }

  return (
    <div className={`fixed bottom-6 right-6 z-40 flex flex-col-reverse items-end gap-2 ${className}`}>
      {/* Action buttons — visible when expanded */}
      {ACTIONS.map((action, i) => {
        const style = {
          transform: expanded ? "translateY(0) scale(1)" : "translateY(16px) scale(0.8)",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? ("auto" as const) : ("none" as const),
          transitionDelay: expanded ? `${i * 40}ms` : `${(ACTIONS.length - 1 - i) * 30}ms`,
        };

        return (
          <div
            key={action.id}
            className="transition-all duration-200"
            style={style}
          >
            {action.href ? (
              <Link href={action.href} onClick={() => setExpanded(false)}>
                <div className="flex items-center gap-2 group">
                  <span className="text-xs font-semibold text-white bg-gray-800 px-2.5 py-1 rounded-lg shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {action.label}
                  </span>
                  <button
                    className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${action.color}`}
                    title={action.label}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                    </svg>
                  </button>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2 group">
                <span className="text-xs font-semibold text-white bg-gray-800 px-2.5 py-1 rounded-lg shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {action.label}
                </span>
                <button
                  onClick={() => setExpanded(false)}
                  className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${action.color}`}
                  title={action.label}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Main FAB */}
      <button
        onClick={handleToggle}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
          expanded
            ? "bg-gray-700 hover:bg-gray-800 rotate-45"
            : "bg-nexus-600 hover:bg-nexus-700 rotate-0"
        } text-white`}
        aria-label={expanded ? "Close quick create" : "Quick create"}
        title={expanded ? "Close" : "Quick Create"}
      >
        <svg className="w-6 h-6 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* Backdrop to close */}
      {expanded && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
