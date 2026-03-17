// Utility functions for chart components

import { ChartTheme, defaultTheme } from './types';

export { defaultTheme };

// --- Scale functions ---

export function linearScale(
  domain: [number, number],
  range: [number, number]
): (value: number) => number {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  return (value: number) => rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
}

export function logScale(
  domain: [number, number],
  range: [number, number]
): (value: number) => number {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  const logMin = Math.log10(Math.max(domainMin, 0.001));
  const logMax = Math.log10(Math.max(domainMax, 0.001));
  const logSpan = logMax - logMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  return (value: number) =>
    rangeMin + ((Math.log10(Math.max(value, 0.001)) - logMin) / logSpan) * rangeSpan;
}

export function timeScale(
  domain: [Date, Date],
  range: [number, number]
): (value: Date) => number {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  const domainSpan = domainMax.getTime() - domainMin.getTime() || 1;
  const rangeSpan = rangeMax - rangeMin;
  return (value: Date) =>
    rangeMin + ((value.getTime() - domainMin.getTime()) / domainSpan) * rangeSpan;
}

// --- Tick generation ---

export function generateLinearTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const step = niceNumber((max - min) / (count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
    ticks.push(parseFloat(v.toPrecision(10)));
  }
  return ticks;
}

function niceNumber(value: number, round: boolean): number {
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const frac = value / Math.pow(10, exp);
  let niceFrac: number;
  if (round) {
    if (frac < 1.5) niceFrac = 1;
    else if (frac < 3) niceFrac = 2;
    else if (frac < 7) niceFrac = 5;
    else niceFrac = 10;
  } else {
    if (frac <= 1) niceFrac = 1;
    else if (frac <= 2) niceFrac = 2;
    else if (frac <= 5) niceFrac = 5;
    else niceFrac = 10;
  }
  return niceFrac * Math.pow(10, exp);
}

export function generateTimeTicks(min: Date, max: Date, count = 6): Date[] {
  const span = max.getTime() - min.getTime();
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => new Date(min.getTime() + i * step));
}

// --- Color scale generation ---

export function generateColorScale(count: number, theme: ChartTheme = defaultTheme): string[] {
  if (count <= theme.colors.length) return theme.colors.slice(0, count);
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(theme.colors[i % theme.colors.length]!);
  }
  return colors;
}

export function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function heatmapColor(value: number, min: number, max: number): string {
  const t = max === min ? 0 : (value - min) / (max - min);
  return interpolateColor('#dbeafe', '#1e40af', t);
}

// --- Number formatting ---

export function formatNumber(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  }
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

export function formatPercent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Responsive dimension calculation ---

export function calculateDimensions(
  containerWidth: number,
  containerHeight: number,
  margin: { top: number; right: number; bottom: number; left: number }
): { width: number; height: number; innerWidth: number; innerHeight: number } {
  const width = containerWidth;
  const height = containerHeight;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);
  return { width, height, innerWidth, innerHeight };
}

// --- SVG path generation helpers ---

export function linePath(
  points: Array<{ x: number; y: number }>,
  smooth = false
): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  if (!smooth) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }

  // Catmull-Rom to bezier
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function areaPath(
  points: Array<{ x: number; y: number }>,
  baseY: number,
  smooth = false
): string {
  if (points.length === 0) return '';
  const line = linePath(points, smooth);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  innerRadius = 0
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  if (innerRadius === 0) {
    return [
      `M ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      `L ${cx} ${cy}`,
      'Z',
    ].join(' ');
  }

  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle);

  return [
    `M ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

// --- Data extent helpers ---

export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  return [Math.min(...values), Math.max(...values)];
}

export function paddedExtent(values: number[], padding = 0.1): [number, number] {
  const [min, max] = extent(values);
  const span = max - min || 1;
  return [min - span * padding, max + span * padding];
}
