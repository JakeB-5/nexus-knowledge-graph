import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export type TimelineEventType = 'create' | 'update' | 'delete' | 'connect' | 'import' | 'tag' | 'note' | 'system';

export interface TimelineEvent {
  id: string;
  date: Date | string;
  title: string;
  description?: string;
  type: TimelineEventType;
  icon?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

interface TimelineProps {
  events: TimelineEvent[];
  groupBy?: 'day' | 'week' | 'month';
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  className?: string;
}

const TYPE_CONFIG: Record<TimelineEventType, { icon: string; color: string; bg: string }> = {
  create:  { icon: '✦', color: '#6366f1', bg: 'bg-indigo-50' },
  update:  { icon: '↻', color: '#8b5cf6', bg: 'bg-purple-50' },
  delete:  { icon: '×', color: '#ef4444', bg: 'bg-red-50' },
  connect: { icon: '⟷', color: '#06b6d4', bg: 'bg-cyan-50' },
  import:  { icon: '↓', color: '#22c55e', bg: 'bg-emerald-50' },
  tag:     { icon: '#', color: '#f97316', bg: 'bg-orange-50' },
  note:    { icon: '✎', color: '#f59e0b', bg: 'bg-amber-50' },
  system:  { icon: '⚙', color: '#9ca3af', bg: 'bg-gray-50' },
};

function parseDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function groupKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  if (groupBy === 'month') {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }
  if (groupBy === 'week') {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatTime(date);
}

export function Timeline({
  events,
  groupBy = 'day',
  onLoadMore,
  hasMore = false,
  loading = false,
  className = '',
}: TimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const loaderRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasMore && !loading) onLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loading]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Sort events newest first and group
  const grouped = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()
    );
    const groups = new Map<string, TimelineEvent[]>();
    sorted.forEach((ev) => {
      const key = groupKey(parseDate(ev.date), groupBy);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ev);
    });
    return Array.from(groups.entries());
  }, [events, groupBy]);

  return (
    <div className={`relative ${className}`}>
      {grouped.map(([label, groupEvents], gi) => (
        <div key={label} className="mb-6">
          {/* Group header */}
          <div className="flex items-center gap-3 mb-3 sticky top-0 bg-white/90 backdrop-blur z-10 py-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
              {label}
            </span>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-300">{groupEvents.length}</span>
          </div>

          {/* Events */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-100" />

            <div className="space-y-1">
              {groupEvents.map((event, i) => {
                const date = parseDate(event.date);
                const cfg = TYPE_CONFIG[event.type];
                const color = event.color ?? cfg.color;
                const icon = event.icon ?? cfg.icon;
                const isExpanded = expandedIds.has(event.id);
                const hasDetails = !!(event.description || event.metadata);
                const isLast = i === groupEvents.length - 1 && gi === grouped.length - 1;

                return (
                  <div key={event.id} className="flex gap-3 group">
                    {/* Icon */}
                    <div className="flex-shrink-0 z-10 mt-0.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shadow-sm border border-white ${cfg.bg}`}
                        style={{ color }}
                      >
                        {icon}
                      </div>
                    </div>

                    {/* Content */}
                    <div
                      className={`flex-1 min-w-0 pb-3 ${!isLast ? 'border-b border-gray-50' : ''}`}
                    >
                      <button
                        onClick={() => hasDetails && toggleExpand(event.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${hasDetails ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800 leading-tight">
                                {event.title}
                              </span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: color + '18', color }}
                              >
                                {event.type}
                              </span>
                            </div>

                            {/* Preview description */}
                            {event.description && !isExpanded && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-1">
                                {event.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatRelative(date)}
                            </span>
                            {hasDetails && (
                              <span className={`text-gray-300 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                ▾
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {event.description && (
                              <p className="text-xs text-gray-500 leading-relaxed">{event.description}</p>
                            )}
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                                {Object.entries(event.metadata).map(([k, v]) => (
                                  <div key={k} className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-400 font-medium flex-shrink-0">{k}:</span>
                                    <span className="text-gray-600 font-mono">{JSON.stringify(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="text-xs text-gray-300">
                              {date.toLocaleString()}
                            </div>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Infinite scroll loader */}
      {(hasMore || loading) && (
        <div ref={loaderRef} className="flex justify-center py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
              Loading...
            </div>
          ) : (
            <button
              onClick={onLoadMore}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No events yet
        </div>
      )}
    </div>
  );
}
