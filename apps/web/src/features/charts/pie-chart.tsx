'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ChartTheme, defaultTheme } from './types';
import { arcPath, polarToCartesian, formatNumber, formatPercent, generateColorScale } from './chart-utils';

export interface PieSlice {
  id: string;
  label: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieSlice[];
  theme?: ChartTheme;
  donut?: boolean;
  innerRadius?: number; // 0-1, fraction of outer radius
  showLabels?: boolean;
  showLegend?: boolean;
  animated?: boolean;
  onSliceClick?: (slice: PieSlice) => void;
  className?: string;
  title?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  slice: PieSlice | null;
}

export function PieChart({
  data,
  theme = defaultTheme,
  donut = false,
  innerRadius = 0.55,
  showLabels = true,
  showLegend = true,
  animated = true,
  onSliceClick,
  className = '',
  title,
}: PieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, slice: null });
  const [progress, setProgress] = useState(animated ? 0 : 1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize(Math.min(entry.contentRect.width, 320));
    });
    observer.observe(el);
    setSize(Math.min(el.clientWidth, 320));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animated) return;
    let raf: number;
    let start: number;
    const duration = 700;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed < duration) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [animated]);

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colors = generateColorScale(data.length, theme);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = donut ? outerR * innerRadius : 0;
  const HOVER_EXPAND = 8;

  // Compute arcs
  type SliceWithAngles = PieSlice & { startAngle: number; endAngle: number; color: string };
  const slices: SliceWithAngles[] = [];
  let cumAngle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const slice = data[i];
    if (!slice) continue;
    const angle = (slice.value / total) * 2 * Math.PI * progress;
    const color = slice.color ?? colors[i] ?? '#6366f1';
    slices.push({ ...slice, startAngle: cumAngle, endAngle: cumAngle + angle, color });
    cumAngle += angle;
  }

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>, slice: SliceWithAngles) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, slice });
    setHoveredId(slice.id);
  };

  const handleMouseLeave = () => {
    setTooltip((t) => ({ ...t, visible: false }));
    setHoveredId(null);
  };

  return (
    <div ref={containerRef} className={`flex flex-col items-center w-full ${className}`}>
      {title && (
        <div className="text-sm font-medium mb-2" style={{ color: theme.textColor }}>{title}</div>
      )}

      <div className="relative">
        <svg width={size} height={size}>
          {slices.map((slice) => {
            const isHovered = hoveredId === slice.id;
            const midAngle = (slice.startAngle + slice.endAngle) / 2;
            const expandX = isHovered ? Math.cos(midAngle) * HOVER_EXPAND : 0;
            const expandY = isHovered ? Math.sin(midAngle) * HOVER_EXPAND : 0;
            const r = isHovered ? outerR + 4 : outerR;

            return (
              <path
                key={slice.id}
                d={arcPath(cx + expandX, cy + expandY, r, slice.startAngle, slice.endAngle, innerR)}
                fill={slice.color}
                stroke="white"
                strokeWidth={2}
                style={{ transition: 'transform 0.15s ease, d 0.15s ease', cursor: 'pointer' }}
                onMouseMove={(e) => handleMouseMove(e, slice)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onSliceClick?.(slice)}
              />
            );
          })}

          {/* Labels */}
          {showLabels && progress === 1 && slices.map((slice) => {
            const midAngle = (slice.startAngle + slice.endAngle) / 2;
            const labelR = outerR * (donut ? 1.2 : 0.65);
            const pos = polarToCartesian(cx, cy, labelR, midAngle);
            const pct = (slice.value / total) * 100;
            if (pct < 5) return null;
            return (
              <text
                key={slice.id}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={donut ? theme.textColor : 'white'}
                fontSize={theme.fontSize - 1}
                fontWeight={500}
                style={{ pointerEvents: 'none' }}
              >
                {pct.toFixed(0)}%
              </text>
            );
          })}

          {/* Donut center text */}
          {donut && progress === 1 && (
            <g>
              <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
                fill={theme.textColor} fontSize={theme.fontSize + 6} fontWeight={700}>
                {formatNumber(total, true)}
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
                fill={theme.axisColor} fontSize={theme.fontSize - 1}>
                Total
              </text>
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {tooltip.visible && tooltip.slice && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 shadow-lg text-sm"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              background: theme.tooltipBackground,
              color: theme.tooltipText,
              minWidth: 120,
            }}
          >
            <div className="font-medium">{tooltip.slice.label}</div>
            <div className="opacity-80 text-xs">
              {formatNumber(tooltip.slice.value)} ({formatPercent(tooltip.slice.value, total)})
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap gap-2 justify-center mt-3 max-w-xs">
          {data.map((slice, i) => {
            const color = slice.color ?? colors[i];
            return (
              <div key={slice.id} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color, display: 'inline-block' }} />
                <span style={{ color: theme.textColor }}>{slice.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
