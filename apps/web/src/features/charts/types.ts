// Chart type definitions for Nexus visualization components

export interface DataPoint {
  x: number | string | Date;
  y: number;
  label?: string;
}

export interface SeriesData {
  id: string;
  name: string;
  data: DataPoint[];
  color?: string;
  visible?: boolean;
}

export interface ChartData {
  series: SeriesData[];
  labels?: string[];
}

export interface AxisOptions {
  label?: string;
  min?: number;
  max?: number;
  tickCount?: number;
  tickFormat?: (value: number | string) => string;
  gridLines?: boolean;
  hide?: boolean;
}

export interface TooltipOptions {
  enabled?: boolean;
  format?: (value: number, label: string) => string;
}

export interface LegendOptions {
  enabled?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface AnimationOptions {
  enabled?: boolean;
  duration?: number;
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface ChartOptions {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  xAxis?: AxisOptions;
  yAxis?: AxisOptions;
  tooltip?: TooltipOptions;
  legend?: LegendOptions;
  animation?: AnimationOptions;
  responsive?: boolean;
  title?: string;
}

export interface ChartTheme {
  colors: string[];
  background: string;
  gridColor: string;
  axisColor: string;
  textColor: string;
  tooltipBackground: string;
  tooltipText: string;
  fontFamily: string;
  fontSize: number;
}

export const defaultTheme: ChartTheme = {
  colors: [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  ],
  background: 'transparent',
  gridColor: '#e5e7eb',
  axisColor: '#9ca3af',
  textColor: '#374151',
  tooltipBackground: '#1f2937',
  tooltipText: '#f9fafb',
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
};

export interface HeatmapCell {
  row: number;
  col: number;
  value: number;
  label?: string;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  rowLabels: string[];
  colLabels: string[];
}

export interface TreemapNode {
  id: string;
  name: string;
  value: number;
  children?: TreemapNode[];
  color?: string;
  group?: string;
}

export interface NetworkNode {
  id: string;
  label: string;
  type?: string;
  x?: number;
  y?: number;
  radius?: number;
  color?: string;
  data?: Record<string, unknown>;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  directed?: boolean;
  color?: string;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}
