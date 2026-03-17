'use client';

import React, { useState, useMemo } from 'react';
import { LineChart } from '../../../features/charts/line-chart';
import { BarChart } from '../../../features/charts/bar-chart';
import { PieChart } from '../../../features/charts/pie-chart';
import { Heatmap } from '../../../features/charts/heatmap';
import { Sparkline } from '../../../features/charts/sparkline';
import type { ChartData, HeatmapData } from '../../../features/charts/types';

// --- Mock data generators ---

function nodeGrowthData(days: number): ChartData {
  const base = 10000;
  const seriesData = Array.from({ length: days }, (_, i) => ({
    x: i,
    y: Math.round(base + i * 42 + Math.sin(i / 5) * 120 + Math.random() * 80),
  }));
  const edgeData = Array.from({ length: days }, (_, i) => ({
    x: i,
    y: Math.round(base * 3.1 + i * 130 + Math.sin(i / 4) * 300 + Math.random() * 200),
  }));
  return {
    series: [
      { id: 'nodes', name: 'Nodes', data: seriesData, color: '#6366f1' },
      { id: 'edges', name: 'Edges', data: edgeData, color: '#8b5cf6' },
    ],
  };
}

function typeDistData() {
  return [
    { id: 'concept', label: 'Concept', value: 4821, color: '#6366f1' },
    { id: 'paper', label: 'Paper', value: 3102, color: '#8b5cf6' },
    { id: 'author', label: 'Author', value: 1987, color: '#ec4899' },
    { id: 'topic', label: 'Topic', value: 1543, color: '#f97316' },
    { id: 'dataset', label: 'Dataset', value: 1030, color: '#22c55e' },
  ];
}

function activityHeatmapData(): HeatmapData {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, i) => `${i}h`);
  const cells = days.flatMap((_, ri) =>
    hours.map((_, ci) => ({
      row: ri,
      col: ci,
      value: Math.max(0, Math.round(
        (ri < 5 ? 8 : 2) *
        Math.max(0, Math.sin(((ci - 9) / 8) * Math.PI)) * 20 +
        Math.random() * 5
      )),
    }))
  );
  return { cells, rowLabels: days, colLabels: hours };
}

function topNodesData(): ChartData {
  const labels = ['ML', 'Transformers', 'Deep Learning', 'NLP', 'Computer Vision', 'BERT', 'GPT', 'ResNet'];
  return {
    labels,
    series: [{
      id: 'connections',
      name: 'Connections',
      data: labels.map((l, i) => ({ x: l, y: [142, 127, 118, 101, 97, 88, 79, 72][i] ?? 0 })),
      color: '#6366f1',
    }],
  };
}

function searchTrendData(): Array<{ label: string; data: number[] }> {
  return [
    { label: 'Machine Learning', data: [12, 18, 15, 22, 30, 28, 35, 41, 38, 45, 42, 50, 55, 48] },
    { label: 'Neural Networks', data: [8, 10, 14, 12, 16, 18, 22, 20, 25, 28, 24, 30, 33, 29] },
    { label: 'Transformers', data: [5, 6, 8, 12, 18, 22, 28, 35, 40, 45, 52, 60, 65, 70] },
    { label: 'Computer Vision', data: [20, 18, 22, 19, 24, 21, 23, 25, 22, 27, 24, 29, 26, 31] },
    { label: 'Reinforcement Learning', data: [14, 15, 13, 17, 16, 18, 20, 19, 22, 21, 24, 23, 26, 25] },
  ];
}

const DATE_RANGES = ['7D', '30D', '90D', '1Y'] as const;
type DateRange = typeof DATE_RANGES[number];

const RANGE_DAYS: Record<DateRange, number> = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };

// --- Component ---
export default function AnalyticsDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30D');
  const [refreshKey, setRefreshKey] = useState(0);

  const growthData = useMemo(() => nodeGrowthData(RANGE_DAYS[dateRange]), [dateRange, refreshKey]);
  const pieData = useMemo(() => typeDistData(), [refreshKey]);
  const heatmapData = useMemo(() => activityHeatmapData(), [refreshKey]);
  const topNodes = useMemo(() => topNodesData(), [refreshKey]);
  const searchTrends = useMemo(() => searchTrendData(), [refreshKey]);

  const STATS = [
    { label: 'Total Nodes', value: '12,483', delta: '+124', up: true },
    { label: 'Total Edges', value: '38,921', delta: '+891', up: true },
    { label: 'New Today', value: '47', delta: '+12%', up: true },
    { label: 'Avg Degree', value: '6.24', delta: '-0.03', up: false },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Knowledge graph metrics and trends</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${dateRange === r ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <span className="text-sm">↻</span> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className={`text-xs font-medium ${stat.up ? 'text-emerald-500' : 'text-rose-500'}`}>
              {stat.delta} vs last period
            </div>
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Node & Edge Growth</h2>
          <span className="text-xs text-gray-400">Last {RANGE_DAYS[dateRange]} days</span>
        </div>
        <div className="h-56">
          <LineChart
            data={growthData}
            area
            smooth
            options={{
              margin: { top: 10, right: 20, bottom: 30, left: 60 },
              yAxis: { tickFormat: (v) => `${Math.round(Number(v) / 1000)}K` },
              xAxis: { label: 'Days ago' },
              legend: { enabled: true },
            }}
          />
        </div>
      </div>

      {/* Mid row: pie + heatmap */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Node Type Distribution</h2>
          <PieChart
            data={pieData}
            donut
            showLabels
            showLegend
            animated
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Activity Heatmap (7×24h)</h2>
          <p className="text-xs text-gray-400 mb-3">Edit activity by day and hour</p>
          <div className="overflow-x-auto">
            <Heatmap
              data={heatmapData}
              cellSize={18}
              gap={2}
              showLabels
            />
          </div>
        </div>
      </div>

      {/* Bottom row: bar chart + sparklines */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Top Connected Nodes</h2>
          <div className="h-48">
            <BarChart
              data={topNodes}
              orientation="horizontal"
              showValues
              options={{
                margin: { top: 5, right: 40, bottom: 20, left: 100 },
                legend: { enabled: false },
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Search Trends</h2>
          <div className="space-y-3">
            {searchTrends.map((trend) => {
              const last = trend.data[trend.data.length - 1] ?? 0;
              const prev = trend.data[trend.data.length - 2] ?? 0;
              const up = last >= prev;
              return (
                <div key={trend.label} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 truncate">{trend.label}</div>
                    <div className={`text-xs ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {up ? '▲' : '▼'} {last} searches/day
                    </div>
                  </div>
                  <Sparkline data={trend.data} width={80} height={28} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
