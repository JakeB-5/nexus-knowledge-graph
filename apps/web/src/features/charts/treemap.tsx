'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TreemapNode } from './types';
import { generateColorScale } from './chart-utils';
import { defaultTheme } from './types';

interface LayoutRect {
  node: TreemapNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  color: string;
  path: string[];
}

interface TreemapProps {
  data: TreemapNode;
  className?: string;
  onNodeClick?: (node: TreemapNode, path: string[]) => void;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: TreemapNode | null;
  path: string[];
}

// Squarified treemap algorithm
function squarify(
  nodes: TreemapNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  total: number,
  depth: number,
  colors: string[],
  colorIndex: Map<string, number>,
  path: string[]
): LayoutRect[] {
  if (nodes.length === 0 || w <= 0 || h <= 0) return [];

  const sorted = [...nodes].sort((a, b) => b.value - a.value);
  const rects: LayoutRect[] = [];

  function worstRatio(row: TreemapNode[], rowLen: number, side: number): number {
    const sum = row.reduce((s, n) => s + n.value, 0);
    const maxVal = Math.max(...row.map((n) => n.value));
    const minVal = Math.min(...row.map((n) => n.value));
    const s2 = side * side;
    return Math.max(
      (s2 * maxVal * total) / (rowLen * rowLen * sum * sum),
      (rowLen * rowLen * sum * sum) / (s2 * minVal * total)
    );
  }

  function layoutRow(row: TreemapNode[], rx: number, ry: number, rw: number, rh: number, horizontal: boolean) {
    const rowSum = row.reduce((s, n) => s + n.value, 0);
    let offset = 0;
    for (let i = 0; i < row.length; i++) {
      const node = row[i]!;
      const frac = node.value / rowSum;
      let nx, ny, nw, nh;
      if (horizontal) {
        nx = rx + offset;
        ny = ry;
        nw = frac * rw;
        nh = rh;
        offset += nw;
      } else {
        nx = rx;
        ny = ry + offset;
        nw = rw;
        nh = frac * rh;
        offset += nh;
      }

      const groupKey = node.group ?? node.id;
      if (!colorIndex.has(groupKey)) {
        colorIndex.set(groupKey, colorIndex.size);
      }
      const color = node.color ?? colors[colorIndex.get(groupKey)! % colors.length] ?? '#6366f1';

      rects.push({ node, x: nx, y: ny, w: nw, h: nh, depth, color, path: [...path, node.name] });

      if (node.children && node.children.length > 0 && nw > 4 && nh > 4) {
        const childTotal = node.children.reduce((s, c) => s + c.value, 0);
        const children = squarify(
          node.children, nx + 1, ny + 1, nw - 2, nh - 2,
          childTotal, depth + 1, colors, colorIndex, [...path, node.name]
        );
        rects.push(...children);
      }
    }
  }

  // Squarify algorithm
  let remaining = [...sorted];
  let currentRow: TreemapNode[] = [];
  let rx = x, ry = y, rw = w, rh = h;

  while (remaining.length > 0) {
    const horizontal = rw >= rh;
    const side = horizontal ? rh : rw;
    const next = remaining[0]!;

    if (
      currentRow.length === 0 ||
      worstRatio([...currentRow, next], (horizontal ? rw : rh), side) <=
        worstRatio(currentRow, (horizontal ? rw : rh), side)
    ) {
      currentRow.push(next);
      remaining = remaining.slice(1);
    } else {
      const rowSum = currentRow.reduce((s, n) => s + n.value, 0);
      const rowFrac = rowSum / total;
      if (horizontal) {
        const rowW = rowFrac * rw;
        layoutRow(currentRow, rx, ry, rowW, rh, false);
        rx += rowW;
        rw -= rowW;
      } else {
        const rowH = rowFrac * rh;
        layoutRow(currentRow, rx, ry, rw, rowH, true);
        ry += rowH;
        rh -= rowH;
      }
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    const horizontal = rw >= rh;
    layoutRow(currentRow, rx, ry, rw, rh, !horizontal);
  }

  return rects;
}

export function Treemap({ data, className = '', onNodeClick }: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, node: null, path: [] });
  const [zoomedPath, setZoomedPath] = useState<string[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const colors = generateColorScale(12, defaultTheme);
  const colorIndex = useMemo(() => new Map<string, number>(), [data]);

  // Find zoomed node
  const rootNode = useMemo(() => {
    if (zoomedPath.length === 0) return data;
    let current = data;
    for (const name of zoomedPath) {
      const child = current.children?.find((c) => c.name === name);
      if (!child) break;
      current = child;
    }
    return current;
  }, [data, zoomedPath]);

  const rects = useMemo(() => {
    const total = (rootNode.children ?? []).reduce((s, c) => s + c.value, 0) || rootNode.value;
    const nodes = rootNode.children ?? [rootNode];
    colorIndex.clear();
    return squarify(nodes, 0, 0, dimensions.width, dimensions.height, total, 0, colors, colorIndex, zoomedPath);
  }, [rootNode, dimensions, colors, colorIndex, zoomedPath]);

  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>, rect: LayoutRect) => {
    const svgRect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    setTooltip({ visible: true, x: e.clientX - svgRect.left, y: e.clientY - svgRect.top, node: rect.node, path: rect.path });
  };

  const handleClick = (rect: LayoutRect) => {
    if (rect.node.children && rect.node.children.length > 0) {
      setZoomedPath(rect.path);
    }
    onNodeClick?.(rect.node, rect.path);
  };

  // Render only depth-0 cells with hover on non-parent, click to zoom on parents
  const topRects = rects.filter((r) => r.depth === zoomedPath.length);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[300px] ${className}`}>
      {/* Breadcrumb */}
      {zoomedPath.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 text-xs bg-white/80 backdrop-blur rounded px-2 py-1 shadow">
          <button onClick={() => setZoomedPath([])} className="text-indigo-600 hover:underline">Root</button>
          {zoomedPath.map((seg, i) => (
            <React.Fragment key={i}>
              <span className="text-gray-400">/</span>
              <button
                onClick={() => setZoomedPath(zoomedPath.slice(0, i + 1))}
                className="text-indigo-600 hover:underline"
              >
                {seg}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      <svg width={dimensions.width} height={dimensions.height}>
        {topRects.map((rect, i) => {
          const hasChildren = (rect.node.children?.length ?? 0) > 0;
          const labelFits = rect.w > 40 && rect.h > 24;
          return (
            <g key={i}>
              <rect
                x={rect.x}
                y={rect.y}
                width={Math.max(0, rect.w - 1)}
                height={Math.max(0, rect.h - 1)}
                fill={rect.color}
                fillOpacity={0.85}
                stroke="white"
                strokeWidth={1.5}
                rx={3}
                className={`transition-opacity ${hasChildren ? 'cursor-zoom-in' : 'cursor-pointer'} hover:opacity-70`}
                onMouseMove={(e) => handleMouseMove(e, rect)}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                onClick={() => handleClick(rect)}
              />
              {labelFits && (
                <foreignObject x={rect.x + 4} y={rect.y + 4} width={rect.w - 8} height={rect.h - 8} style={{ pointerEvents: 'none' }}>
                  <div className="text-white text-xs font-medium leading-tight overflow-hidden">
                    <div className="truncate">{rect.node.name}</div>
                    {rect.h > 40 && (
                      <div className="opacity-70 truncate">{rect.node.value.toLocaleString()}</div>
                    )}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 shadow-lg text-sm"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, background: '#1f2937', color: '#f9fafb' }}
        >
          <div className="font-medium">{tooltip.path.join(' / ')}</div>
          <div className="opacity-80 text-xs">Value: {tooltip.node.value.toLocaleString()}</div>
          {tooltip.node.children && (
            <div className="opacity-60 text-xs">Click to zoom in</div>
          )}
        </div>
      )}
    </div>
  );
}
