'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChartData, ChartOptions, ChartTheme, defaultTheme } from './types';
import {
  linearScale,
  generateLinearTicks,
  formatNumber,
  calculateDimensions,
  linePath,
  areaPath,
  paddedExtent,
  generateColorScale,
} from './chart-utils';

interface LineChartProps {
  data: ChartData;
  options?: ChartOptions;
  theme?: ChartTheme;
  area?: boolean;
  smooth?: boolean;
  className?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  items: Array<{ name: string; value: number; color: string }>;
  label: string;
}

const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

export function LineChart({
  data,
  options = {},
  theme = defaultTheme,
  area = false,
  smooth = false,
  className = '',
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, items: [], label: '',
  });
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
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
    setDimensions({
      width: el.clientWidth,
      height: options.height ?? el.clientHeight,
    });
    return () => observer.disconnect();
  }, [options.height]);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const { innerWidth, innerHeight } = calculateDimensions(
    dimensions.width, dimensions.height, margin
  );

  const visibleSeries = data.series.filter((s) => !hiddenSeries.has(s.id));

  const allX = visibleSeries.flatMap((s) => s.data.map((d) => Number(d.x)));
  const allY = visibleSeries.flatMap((s) => s.data.map((d) => d.y));

  const xDomain: [number, number] = allX.length
    ? [Math.min(...allX), Math.max(...allX)]
    : [0, 1];
  const yDomain = allY.length ? paddedExtent(allY) : [0, 1] as [number, number];

  const xScale = linearScale(xDomain, [0, innerWidth]);
  const yScale = linearScale(yDomain as [number, number], [innerHeight, 0]);

  const xTicks = generateLinearTicks(xDomain[0], xDomain[1], options.xAxis?.tickCount ?? 6);
  const yTicks = generateLinearTicks(yDomain[0] as number, yDomain[1] as number, options.yAxis?.tickCount ?? 5);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - margin.left;

      if (mouseX < 0 || mouseX > innerWidth || visibleSeries.length === 0) {
        setTooltip((t) => ({ ...t, visible: false }));
        return;
      }

      const xValue = xDomain[0] + (mouseX / innerWidth) * (xDomain[1] - xDomain[0]);

      const items = visibleSeries.map((series, i) => {
        const closest = series.data.reduce((prev, curr) =>
          Math.abs(Number(curr.x) - xValue) < Math.abs(Number(prev.x) - xValue) ? curr : prev
        );
        return {
          name: series.name,
          value: closest.y,
          color: series.color ?? colors[i] ?? '#6366f1',
        };
      });

      const closestX = visibleSeries[0]?.data.reduce((prev, curr) =>
        Math.abs(Number(curr.x) - xValue) < Math.abs(Number(prev.x) - xValue) ? curr : prev
      );

      setTooltip({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        items,
        label: closestX ? formatNumber(Number(closestX.x)) : '',
      });
    },
    [visibleSeries, xDomain, innerWidth, margin.left, colors]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  const toggleSeries = (id: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const animDuration = options.animation?.duration ?? 800;

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[200px] ${className}`}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="overflow-visible"
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <line
              key={tick}
              x1={0}
              y1={yScale(tick)}
              x2={innerWidth}
              y2={yScale(tick)}
              stroke={theme.gridColor}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* X Axis */}
          <line x1={0} y1={innerHeight} x2={innerWidth} y2={innerHeight} stroke={theme.axisColor} strokeWidth={1} />
          {xTicks.map((tick) => (
            <g key={tick} transform={`translate(${xScale(tick)},${innerHeight})`}>
              <line y2={5} stroke={theme.axisColor} strokeWidth={1} />
              <text y={18} textAnchor="middle" fill={theme.textColor} fontSize={theme.fontSize - 1}>
                {options.xAxis?.tickFormat ? options.xAxis.tickFormat(tick) : formatNumber(tick, true)}
              </text>
            </g>
          ))}

          {/* Y Axis */}
          <line x1={0} y1={0} x2={0} y2={innerHeight} stroke={theme.axisColor} strokeWidth={1} />
          {yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${yScale(tick)})`}>
              <line x2={-5} stroke={theme.axisColor} strokeWidth={1} />
              <text x={-8} textAnchor="end" dominantBaseline="middle" fill={theme.textColor} fontSize={theme.fontSize - 1}>
                {options.yAxis?.tickFormat ? options.yAxis.tickFormat(tick) : formatNumber(tick, true)}
              </text>
            </g>
          ))}

          {/* Axis labels */}
          {options.xAxis?.label && (
            <text
              x={innerWidth / 2}
              y={innerHeight + 36}
              textAnchor="middle"
              fill={theme.textColor}
              fontSize={theme.fontSize}
              fontWeight={500}
            >
              {options.xAxis.label}
            </text>
          )}
          {options.yAxis?.label && (
            <text
              transform={`translate(-40,${innerHeight / 2}) rotate(-90)`}
              textAnchor="middle"
              fill={theme.textColor}
              fontSize={theme.fontSize}
              fontWeight={500}
            >
              {options.yAxis.label}
            </text>
          )}

          {/* Series */}
          {data.series.map((series, i) => {
            if (hiddenSeries.has(series.id)) return null;
            const color = series.color ?? colors[i];
            const points = series.data.map((d) => ({
              x: xScale(Number(d.x)),
              y: yScale(d.y),
            }));

            const totalLength = 2000;
            return (
              <g key={series.id}>
                {area && (
                  <path
                    d={areaPath(points, innerHeight, smooth)}
                    fill={color}
                    fillOpacity={0.15}
                  />
                )}
                <path
                  d={linePath(points, smooth)}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={animated ? {} : {
                    strokeDasharray: totalLength,
                    strokeDashoffset: totalLength,
                    animation: `drawLine ${animDuration}ms ease forwards`,
                  }}
                />
              </g>
            );
          })}

          {/* Hover crosshair dot */}
          {tooltip.visible && visibleSeries.map((series, i) => {
            const mouseX = tooltip.x - margin.left;
            const xValue = xDomain[0] + (mouseX / innerWidth) * (xDomain[1] - xDomain[0]);
            const closest = series.data.reduce((prev, curr) =>
              Math.abs(Number(curr.x) - xValue) < Math.abs(Number(prev.x) - xValue) ? curr : prev
            );
            const color = series.color ?? colors[i];
            return (
              <circle
                key={series.id}
                cx={xScale(Number(closest.x))}
                cy={yScale(closest.y)}
                r={4}
                fill={color}
                stroke="white"
                strokeWidth={2}
              />
            );
          })}
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
            maxWidth: 200,
          }}
        >
          <div className="font-medium mb-1 text-xs opacity-70">{tooltip.label}</div>
          {tooltip.items.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="opacity-80">{item.name}:</span>
              <span className="font-medium">{formatNumber(item.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {(options.legend?.enabled !== false) && (
        <div className="flex flex-wrap gap-3 justify-center mt-1 px-2">
          {data.series.map((series, i) => {
            const color = series.color ?? colors[i];
            const hidden = hiddenSeries.has(series.id);
            return (
              <button
                key={series.id}
                onClick={() => toggleSeries(series.id)}
                className="flex items-center gap-1.5 text-xs transition-opacity"
                style={{ opacity: hidden ? 0.4 : 1 }}
              >
                <span className="w-3 h-0.5 rounded" style={{ background: color, display: 'inline-block' }} />
                <span style={{ color: theme.textColor }}>{series.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
