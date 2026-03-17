import { formatRelativeTime, getInitials, cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: "node_created" | "node_updated" | "node_deleted" | "user_joined" | "edge_created" | "search";
  actorName: string;
  actorAvatar?: string;
  description: string;
  targetTitle?: string;
  createdAt: string;
}

const TYPE_ICON: Record<ActivityItem["type"], { icon: string; bg: string; text: string }> = {
  node_created: { icon: "+", bg: "bg-green-100", text: "text-green-700" },
  node_updated: { icon: "✎", bg: "bg-nexus-100", text: "text-nexus-700" },
  node_deleted: { icon: "×", bg: "bg-red-100", text: "text-red-700" },
  user_joined: { icon: "↗", bg: "bg-purple-100", text: "text-purple-700" },
  edge_created: { icon: "⇌", bg: "bg-yellow-100", text: "text-yellow-700" },
  search: { icon: "⌕", bg: "bg-gray-100", text: "text-gray-600" },
};

interface ActivityFeedProps {
  items: ActivityItem[];
  className?: string;
  maxItems?: number;
}

export function ActivityFeed({ items, className, maxItems }: ActivityFeedProps) {
  const displayed = maxItems ? items.slice(0, maxItems) : items;

  if (displayed.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">No recent activity</p>
      </div>
    );
  }

  return (
    <ol className={cn("divide-y divide-gray-50", className)}>
      {displayed.map((item) => {
        const meta = TYPE_ICON[item.type] ?? TYPE_ICON.search;
        return (
          <li key={item.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
            {/* Type badge */}
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                meta.bg,
                meta.text
              )}
              aria-hidden="true"
            >
              {meta.icon}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 leading-snug">
                <span className="font-medium text-gray-900">{item.actorName}</span>{" "}
                {item.description}
                {item.targetTitle && (
                  <span className="font-medium text-nexus-700"> "{item.targetTitle}"</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">{formatRelativeTime(item.createdAt)}</p>
            </div>

            {/* Actor avatar */}
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nexus-600 text-xs font-semibold text-white"
              title={item.actorName}
            >
              {item.actorAvatar ? (
                <img
                  src={item.actorAvatar}
                  alt={item.actorName}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                getInitials(item.actorName)
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
