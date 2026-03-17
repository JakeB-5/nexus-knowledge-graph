"use client";



import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onSort?: (key: string, direction: SortDirection) => void;
  sortKey?: string;
  sortDirection?: SortDirection;
  emptyMessage?: string;
  rowClassName?: (row: T) => string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-gray-100 animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading = false,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onSort,
  sortKey,
  sortDirection,
  emptyMessage = "No results found.",
  rowClassName,
}: DataTableProps<T>) {
  const allSelected = data.length > 0 && data.every((r) => selectedIds.has(r.id));
  const someSelected = data.some((r) => selectedIds.has(r.id)) && !allSelected;

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((r) => r.id)));
    }
  }

  function toggleRow(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  function handleSort(key: string) {
    if (!onSort) return;
    if (sortKey !== key) {
      onSort(key, "asc");
    } else if (sortDirection === "asc") {
      onSort(key, "desc");
    } else {
      onSort(key, null);
    }
  }

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  className="h-4 w-4 rounded border-gray-300 text-nexus-600 focus:ring-nexus-500 cursor-pointer"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500",
                  col.sortable && "cursor-pointer select-none hover:text-gray-900 transition-colors"
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {col.header}
                  {col.sortable && (
                    <span className="flex flex-col" aria-hidden="true">
                      <svg
                        className={cn("h-2.5 w-2.5", sortKey === col.key && sortDirection === "asc" ? "text-nexus-600" : "text-gray-300")}
                        viewBox="0 0 10 6"
                        fill="currentColor"
                      >
                        <path d="M5 0L10 6H0z" />
                      </svg>
                      <svg
                        className={cn("h-2.5 w-2.5", sortKey === col.key && sortDirection === "desc" ? "text-nexus-600" : "text-gray-300")}
                        viewBox="0 0 10 6"
                        fill="currentColor"
                      >
                        <path d="M5 6L0 0H10z" />
                      </svg>
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-50 bg-white">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={colCount} />)
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-500">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const selected = selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group transition-colors hover:bg-gray-50/60",
                    selected && "bg-nexus-50/40",
                    rowClassName?.(row)
                  )}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select row ${row.id}`}
                        className="h-4 w-4 rounded border-gray-300 text-nexus-600 focus:ring-nexus-500 cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
