'use client';

import React, { useMemo } from 'react';
import { linePath, extent, linearScale } from './chart-utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  showDots?: boolean; // show min/max dots
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 100,
  height = 32,
  className = '',
  showDots = true,
  strokeWidth = 1.5,
}: SparklineProps) {
  const pad = 3;

  const { points, color, minIdx, maxIdx } = useMemo(() => {
    if (data.length < 2) {
      return { points: [], color: '#6366f1', minIdx: 0, maxIdx: 0 };
    }

    const [minVal, maxVal] = extent(data);
    const xScale = linearScale([0, data.length - 1], [pad, width - pad]);
    const yScale = linearScale([minVal, maxVal], [height - pad, pad]);

    const pts = data.map((v, i) => ({ x: xScale(i), y: yScale(v) }));

    const first = data[0] ?? 0;
    const last = data[data.length - 1] ?? 0;
    const trendColor = last >= first ? '#22c55e' : '#ef4444';

    let minI = 0;
    let maxI = 0;
    data.forEach((v, i) => {
      if (v < (data[minI] ?? 0)) minI = i;
      if (v > (data[maxI] ?? 0)) maxI = i;
    });

    return { points: pts, color: trendColor, minIdx: minI, maxIdx: maxI };
  }, [data, width, height]);

  if (data.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }

  const path = linePath(points, false);

  return (
    <svg width={width} height={height} className={className}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots && (
        <>
          {points[minIdx] && (
            <circle cx={points[minIdx]!.x} cy={points[minIdx]!.y} r={2.5} fill="#ef4444" />
          )}
          {points[maxIdx] && (
            <circle cx={points[maxIdx]!.x} cy={points[maxIdx]!.y} r={2.5} fill="#22c55e" />
          )}
          {points[points.length - 1] && (
            <circle cx={points[points.length - 1]!.x} cy={points[points.length - 1]!.y} r={2} fill={color} />
          )}
        </>
      )}
    </svg>
  );
}
