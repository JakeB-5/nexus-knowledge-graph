import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, delta, icon, className }: StatCardProps) {
  const isPositive = delta !== undefined && delta >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-100 bg-white p-6 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
          {delta !== undefined && (
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                isPositive ? "text-green-600" : "text-red-500"
              )}
            >
              {isPositive ? "+" : ""}
              {delta}% from last week
            </p>
          )}
        </div>
        <div className="ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-nexus-50 text-nexus-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
