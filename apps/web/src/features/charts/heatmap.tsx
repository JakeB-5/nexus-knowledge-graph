'use client';

import React, { useState, useRef } from 'react';
import { HeatmapData } from './types';
import { heatmapColor, formatNumber, extent } from './chart-utils';

interface HeatmapProps {
  data: HeatmapData;
  cellSize?: number;
  gap?: number;
  showLabels?: boolean;
  className?: string;
  onCellClick?: (row: number, col: number, value: number) => void;
  colorLow?: string;
  colorHigh?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  row: string;
  col: string;
  value: number;
}

export function Heatmap({
  data,
  cellSize = 28,
  gap = 2,
  showLabels = true,
  className = '',
  onCellClick,
}: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, row: '', col: '', value: 0,
  });

  const allValues = data.cells.map((c) => c.value);
  const [minVal, maxVal] = extent(allValues);

  const numRows = data.rowLabels.length;
  const numCols = data.colLabels.length;
  const rowLabelWidth = showLabels ? 80 : 0;
  const colLabelHeight = showLabels ? 24 : 0;
  const svgWidth = rowLabelWidth + numCols * (cellSize + gap);
  const svgHeight = colLabelHeight + numRows * (cellSize + gap);

  // Build value lookup
  const valueMap = new Map<string, number>();
  data.cells.forEach((c) => valueMap.set(`${c.row},${c.col}`, c.value));

  const handleMouseMove = (
    e: React.MouseEvent<SVGRectElement>,
    row: number,
    col: number,
    value: number
  ) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      row: data.rowLabels[row] ?? '',
      col: data.colLabels[col] ?? '',
      value,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((t) => ({ ...t, visible: false }));
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <svg width={svgWidth} height={svgHeight} className="overflow-visible">
        {/* Column labels */}
        {showLabels && data.colLabels.map((label, ci) => (
          <text
            key={ci}
            x={rowLabelWidth + ci * (cellSize + gap) + cellSize / 2}
            y={colLabelHeight - 4}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={10}
          >
            {label}
          </text>
        ))}

        {/* Row labels */}
        {showLabels && data.rowLabels.map((label, ri) => (
          <text
            key={ri}
            x={rowLabelWidth - 6}
            y={colLabelHeight + ri * (cellSize + gap) + cellSize / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#6b7280"
            fontSize={10}
          >
            {label}
          </text>
        ))}

        {/* Cells */}
        {Array.from({ length: numRows }, (_, ri) =>
          Array.from({ length: numCols }, (_, ci) => {
            const value = valueMap.get(`${ri},${ci}`) ?? 0;
            const color = heatmapColor(value, minVal, maxVal);
            const x = rowLabelWidth + ci * (cellSize + gap);
            const y = colLabelHeight + ri * (cellSize + gap);
            return (
              <rect
                key={`${ri}-${ci}`}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={color}
                stroke="white"
                strokeWidth={gap / 2}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onMouseMove={(e) => handleMouseMove(e, ri, ci, value)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onCellClick?.(ri, ci, value)}
              />
            );
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 shadow-lg text-xs"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: '#1f2937',
            color: '#f9fafb',
          }}
        >
          <div className="font-medium">{tooltip.row} / {tooltip.col}</div>
          <div className="opacity-80">Value: {formatNumber(tooltip.value)}</div>
        </div>
      )}

      {/* Color scale legend */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-gray-500">Low</span>
        <div
          className="h-2 w-24 rounded"
          style={{ background: 'linear-gradient(to right, #dbeafe, #1e40af)' }}
        />
        <span className="text-xs text-gray-500">High</span>
      </div>
    </div>
  );
}
