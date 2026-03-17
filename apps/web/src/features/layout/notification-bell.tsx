"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: "node_created" | "edge_created" | "member_joined" | "comment" | "mention";
  title: string;
  body: string;
  time: string;
  read: boolean;
  href?: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    type: "mention",
    title: "Sarah Chen mentioned you",
    body: "in Transformer Architecture: \"@you should check the attention section\"",
    time: "5m ago",
    read: false,
    href: "/knowledge/n1",
  },
  {
    id: "n2",
    type: "node_created",
    title: "New node added",
    body: "Marcus Williams created \"Constitutional AI\" in AI Research Hub",
    time: "32m ago",
    read: false,
    href: "/workspaces/1",
  },
  {
    id: "n3",
    type: "member_joined",
    title: "New member joined",
    body: "Emma Thompson joined Engineering Wiki workspace",
    time: "2h ago",
    read: false,
    href: "/workspaces/4",
  },
  {
    id: "n4",
    type: "edge_created",
    title: "New connection",
    body: "Priya Patel linked GPT-4 → Transformer Architecture",
    time: "4h ago",
    read: true,
    href: "/visualize",
  },
  {
    id: "n5",
    type: "comment",
    title: "Comment on your node",
    body: "James Rodriguez commented on \"Attention Mechanism\"",
    time: "1d ago",
    read: true,
    href: "/knowledge/n2",
  },
];

const TYPE_ICONS: Record<Notification["type"], { icon: string; color: string }> = {
  mention: {
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
    color: "bg-nexus-100 text-nexus-600",
  },
  node_created: {
    icon: "M12 4.5v15m7.5-7.5h-15",
    color: "bg-green-100 text-green-600",
  },
  edge_created: {
    icon: "M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3",
    color: "bg-blue-100 text-blue-600",
  },
  member_joined: {
    icon: "M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z",
    color: "bg-purple-100 text-purple-600",
  },
  comment: {
    icon: "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
    color: "bg-orange-100 text-orange-600",
  },
};

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className = "" }: NotificationBellProps) {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  // Close on outside click
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
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-nexus-600 hover:text-nexus-800 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-400">No notifications</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const { icon, color } = TYPE_ICONS[notif.type];
                const inner = (
                  <div
                    key={notif.id}
                    onClick={() => markRead(notif.id)}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors cursor-pointer ${
                      notif.read ? "hover:bg-gray-50" : "bg-nexus-50/50 hover:bg-nexus-50"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${notif.read ? "text-gray-700" : "text-gray-900"}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-xs text-gray-300 mt-1">{notif.time}</p>
                    </div>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-nexus-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                );
                return notif.href ? (
                  <Link key={notif.id} href={notif.href} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <React.Fragment key={notif.id}>{inner}</React.Fragment>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm text-nexus-600 hover:text-nexus-800 font-medium transition-colors"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
