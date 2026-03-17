import React from "react";
import Link from "next/link";

interface HistoryPageProps {
  params: Promise<{ nodeId: string }>;
}

type ChangeType = "created" | "updated" | "title_changed" | "connection_added" | "connection_removed" | "tag_added";

interface HistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  avatar: string;
  changeType: ChangeType;
  description: string;
  details?: string;
}

const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: "h1",
    timestamp: "2026-03-16T14:22:00Z",
    user: "Alice Chen",
    avatar: "AC",
    changeType: "updated",
    description: "Updated content",
    details: "Expanded the section on quantum entanglement with new research findings.",
  },
  {
    id: "h2",
    timestamp: "2026-03-14T09:15:00Z",
    user: "Bob Smith",
    avatar: "BS",
    changeType: "connection_added",
    description: "Added connection to Grover's Algorithm",
    details: "Edge type: contains",
  },
  {
    id: "h3",
    timestamp: "2026-03-12T16:45:00Z",
    user: "Alice Chen",
    avatar: "AC",
    changeType: "tag_added",
    description: "Added tag 'algorithms'",
  },
  {
    id: "h4",
    timestamp: "2026-03-10T11:30:00Z",
    user: "Carol Davis",
    avatar: "CD",
    changeType: "title_changed",
    description: "Renamed title",
    details: 'From "Quantum Computing" to "Quantum Computing Fundamentals"',
  },
  {
    id: "h5",
    timestamp: "2026-03-08T08:00:00Z",
    user: "Bob Smith",
    avatar: "BS",
    changeType: "updated",
    description: "Updated metadata",
    details: "Changed status from 'draft' to 'published'.",
  },
  {
    id: "h6",
    timestamp: "2025-11-01T10:30:00Z",
    user: "Alice Chen",
    avatar: "AC",
    changeType: "created",
    description: "Node created",
    details: "Initial content added.",
  },
];

const CHANGE_TYPE_STYLES: Record<ChangeType, { bg: string; text: string; icon: React.ReactNode }> = {
  created: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  updated: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  title_changed: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  connection_added: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  connection_removed: {
    bg: "bg-red-100",
    text: "text-red-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  tag_added: {
    bg: "bg-cyan-100",
    text: "text-cyan-700",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
}

function groupByDate(entries: HistoryEntry[]): Record<string, HistoryEntry[]> {
  return entries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
    const date = formatDate(entry.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});
}

export default async function NodeHistoryPage({ params }: HistoryPageProps) {
  const { nodeId } = await params;
  const grouped = groupByDate(MOCK_HISTORY);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/knowledge/${nodeId}`}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Version History</h1>
          <p className="text-sm text-slate-500">{MOCK_HISTORY.length} changes recorded</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, entries]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400 px-2">{date}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-3">
              {entries.map((entry) => {
                const styles = CHANGE_TYPE_STYLES[entry.changeType];
                return (
                  <div key={entry.id} className="flex items-start gap-4 bg-white rounded-2xl border border-slate-200 p-4">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500
                      flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{entry.avatar}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{entry.user}</span>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${styles.bg} ${styles.text}`}>
                          {styles.icon}
                          {entry.changeType.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">{formatTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{entry.description}</p>
                      {entry.details && (
                        <p className="text-xs text-slate-400 mt-1 italic">{entry.details}</p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 mt-3">
                        <button className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View diff
                        </button>
                        {entry.changeType !== "created" && (
                          <button className="text-xs text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Restore to this version
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
