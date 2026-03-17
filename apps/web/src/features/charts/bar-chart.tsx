'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChartData, ChartOptions, ChartTheme, defaultTheme } from './types';
import {
  linearScale,
  generateLinearTicks,
  formatNumber,
  calculateDimensions,
  generateColorScale,
} from './chart-utils';

interface BarChartProps {
  data: ChartData;
  options?: ChartOptions;
  theme?: ChartTheme;
  orientation?: 'vertical' | 'horizontal';
  mode?: 'grouped' | 'stacked';
  showValues?: boolean;
  className?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  items: Array<{ name: string; value: number; color: string }>;
}

const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

export function BarChart({
  data,
  options = {},
  theme = defaultTheme,
  orientation = 'vertical',
  mode = 'grouped',
  showValues = false,
  className = '',
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, label: '', items: [],
  });
  const [animated, setAnimated] = useState(false);

  const margin = options.margin ?? DEFAULT_MARGIN;
  const colors = generateColorScale(data.series.length, theme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({
        width: entry.contentRect.width,
        height: options.height ?? entry.contentRect.height,
      });
    });
    observer.observe(el);
    setDimensions({ width: el.clientWidth, height: options.height ?? el.clientHeight });
    return () => observer.disconnect();
  }, [options.height]);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const { innerWidth, innerHeight } = calculateDimensions(
    dimensions.width, dimensions.height, margin
  );

  const labels = data.labels ?? data.series[0]?.data.map((d) => String(d.x)) ?? [];
  const numGroups = labels.length;
  const numSeries = data.series.length;

  // Compute value range
  let maxVal = 0;
  if (mode === 'stacked') {
    for (let g = 0; g < numGroups; g++) {
      const sum = data.series.reduce((s, ser) => s + (ser.data[g]?.y ?? 0), 0);
      maxVal = Math.max(maxVal, sum);
    }
  } else {
    maxVal = Math.max(...data.series.flatMap((s) => s.data.map((d) => d.y)));
  }

  const valueDomain: [number, number] = [0, maxVal * 1.1 || 1];
  const valTicks = generateLinearTicks(valueDomain[0], valueDomain[1], 5);

  const isHorizontal = orientation === 'horizontal';
  const groupSize = isHorizontal ? innerHeight / numGroups : innerWidth / numGroups;
  const groupPad = groupSize * 0.2;
  const barGroupWidth = groupSize - groupPad;
  const barWidth = mode === 'stacked' ? barGroupWidth : barGroupWidth / numSeries;

  const valueScale = isHorizontal
    ? linearScale(valueDomain, [0, innerWidth])
    : linearScale(valueDomain, [innerHeight, 0]);

  const showTooltip = useCallback(
    (e: React.MouseEvent, label: string, items: Array<{ name: string; value: number; color: string }>) => {
      const rect = (e.currentTarget as Element).closest('svg')!.getBoundingClientRect();
      setTooltip({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        label,
        items,
      });
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  const animDuration = options.animation?.duration ?? 500;

  const renderBars = () => {
    return labels.map((label, gi) => {
      const groupOffset = gi * groupSize + groupPad / 2;
      const tooltipItems = data.series.map((ser, si) => ({
        name: ser.name,
        value: ser.data[gi]?.y ?? 0,
        color: ser.color ?? colors[si] ?? '#6366f1',
      }));

      if (mode === 'stacked') {
        let cumulative = 0;
        return (
          <g key={label}>
            {data.series.map((ser, si) => {
              const val = ser.data[gi]?.y ?? 0;
              const color = ser.color ?? colors[si] ?? '#6366f1';
              let x, y, w, h;
              if (isHorizontal) {
                x = valueScale(cumulative);
                y = groupOffset;
                w = valueScale(val) - valueScale(0);
                h = barGroupWidth;
              } else {
                x = groupOffset;
                y = valueScale(cumulative + val);
                w = barGroupWidth;
                h = valueScale(cumulative) - valueScale(cumulative + val);
              }
              cumulative += val;
              return (
                <rect
                  key={si}
                  x={x}
                  y={animated ? y : (isHorizontal ? x : innerHeight)}
                  width={animated ? w : (isHorizontal ? 0 : w)}
                  height={animated ? h : (isHorizontal ? h : 0)}
                  fill={color}
                  rx={2}
                  style={{ transition: `all ${animDuration}ms ease` }}
                  onMouseMove={(e) => showTooltip(e, label, tooltipItems)}
                  onMouseLeave={hideTooltip}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                />
              );
            })}
          </g>
        );
      }

      // Grouped
      return (
        <g key={label}>
          {data.series.map((ser, si) => {
            const val = ser.data[gi]?.y ?? 0;
            const color = ser.color ?? colors[si] ?? '#6366f1';
            let x, y, w, h;
            if (isHorizontal) {
              x = 0;
              y = groupOffset + si * barWidth;
              w = valueScale(val);
              h = barWidth - 2;
            } else {
              x = groupOffset + si * barWidth;
              y = valueScale(val);
              w = barWidth - 2;
              h = innerHeight - valueScale(val);
            }
            const tipItem = tooltipItems[si];
            return (
              <g key={si}>
                <rect
                  x={x}
                  y={animated ? y : (isHorizontal ? x : innerHeight)}
                  width={animated ? w : (isHorizontal ? 0 : w)}
                  height={animated ? h : (isHorizontal ? h : 0)}
                  fill={color}
                  rx={2}
                  style={{ transition: `all ${animDuration}ms ease` }}
                  onMouseMove={(e) => tipItem && showTooltip(e, label, [tipItem])}
                  onMouseLeave={hideTooltip}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                />
                {showValues && animated && (
                  <text
                    x={isHorizontal ? w + 4 : x + w / 2}
                    y={isHorizontal ? y + h / 2 : y - 4}
                    textAnchor={isHorizontal ? 'start' : 'middle'}
                    dominantBaseline={isHorizontal ? 'middle' : 'auto'}
                    fill={theme.textColor}
                    fontSize={theme.fontSize - 2}
                  >
                    {formatNumber(val, true)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      );
    });
  };

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[200px] ${className}`}>
      <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Grid lines */}
          {valTicks.map((tick) => {
            const pos = valueScale(tick);
            return isHorizontal ? (
              <line key={tick} x1={pos} y1={0} x2={pos} y2={innerHeight}
                stroke={theme.gridColor} strokeWidth={1} strokeDasharray="4,4" />
            ) : (
              <line key={tick} x1={0} y1={pos} x2={innerWidth} y2={pos}
                stroke={theme.gridColor} strokeWidth={1} strokeDasharray="4,4" />
            );
          })}

          {/* Bars */}
          {renderBars()}

          {/* X Axis */}
          <line x1={0} y1={innerHeight} x2={innerWidth} y2={innerHeight}
            stroke={theme.axisColor} strokeWidth={1} />

          {/* Category labels */}
          {labels.map((label, gi) => {
            const center = gi * groupSize + groupSize / 2;
            return isHorizontal ? (
              <text
                key={label}
                x={-8}
                y={center}
                textAnchor="end"
                dominantBaseline="middle"
                fill={theme.textColor}
                fontSize={theme.fontSize - 1}
              >
                {label}
              </text>
            ) : (
              <text
                key={label}
                x={center}
                y={innerHeight + 16}
                textAnchor="middle"
                fill={theme.textColor}
                fontSize={theme.fontSize - 1}
              >
                {label}
              </text>
            );
          })}

          {/* Value axis ticks */}
          {valTicks.map((tick) => {
            const pos = valueScale(tick);
            return isHorizontal ? (
              <text key={tick} x={pos} y={innerHeight + 16} textAnchor="middle"
                fill={theme.textColor} fontSize={theme.fontSize - 1}>
                {formatNumber(tick, true)}
              </text>
            ) : (
              <text key={tick} x={-8} y={pos} textAnchor="end" dominantBaseline="middle"
                fill={theme.textColor} fontSize={theme.fontSize - 1}>
                {formatNumber(tick, true)}
              </text>
            );
          })}

          {/* Y Axis line */}
          <line x1={0} y1={0} x2={0} y2={innerHeight} stroke={theme.axisColor} strokeWidth={1} />
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 shadow-lg text-sm"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: theme.tooltipBackground,
            color: theme.tooltipText,
          }}
        >
          <div className="font-medium mb-1 text-xs opacity-70">{tooltip.label}</div>
          {tooltip.items.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: item.color }} />
              <span className="opacity-80">{item.name}:</span>
              <span className="font-medium">{formatNumber(item.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {(options.legend?.enabled !== false) && data.series.length > 1 && (
        <div className="flex flex-wrap gap-3 justify-center mt-1 px-2">
          {data.series.map((series, i) => {
            const color = series.color ?? colors[i];
            return (
              <div key={series.id} className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-sm" style={{ background: color, display: 'inline-block' }} />
                <span style={{ color: theme.textColor }}>{series.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
