'use client';

import React, { useState, useMemo } from 'react';
import { NetworkChart } from '../../../features/charts/network-chart';
import type { NetworkData, NetworkNode, NetworkEdge } from '../../../features/charts/types';

// --- Mock data ---
const MOCK_NODES: NetworkNode[] = [
  { id: 'n1', label: 'Machine Learning', type: 'topic' },
  { id: 'n2', label: 'Neural Networks', type: 'concept' },
  { id: 'n3', label: 'Transformers', type: 'concept' },
  { id: 'n4', label: 'NLP', type: 'topic' },
  { id: 'n5', label: 'Computer Vision', type: 'topic' },
  { id: 'n6', label: 'BERT', type: 'concept' },
  { id: 'n7', label: 'GPT', type: 'concept' },
  { id: 'n8', label: 'Deep Learning', type: 'concept' },
  { id: 'n9', label: 'ResNet', type: 'concept' },
  { id: 'n10', label: 'Attention', type: 'concept' },
  { id: 'n11', label: 'Reinforcement Learning', type: 'concept' },
  { id: 'n12', label: 'Knowledge Graph', type: 'concept' },
];

const MOCK_EDGES: NetworkEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2', directed: true },
  { id: 'e2', source: 'n1', target: 'n8', directed: true },
  { id: 'e3', source: 'n2', target: 'n3', directed: true },
  { id: 'e4', source: 'n3', target: 'n6', directed: true },
  { id: 'e5', source: 'n3', target: 'n7', directed: true },
  { id: 'e6', source: 'n3', target: 'n10', directed: true },
  { id: 'e7', source: 'n4', target: 'n6', directed: true },
  { id: 'e8', source: 'n4', target: 'n7', directed: true },
  { id: 'e9', source: 'n5', target: 'n9', directed: true },
  { id: 'e10', source: 'n5', target: 'n2', directed: true },
  { id: 'e11', source: 'n8', target: 'n2', directed: true },
  { id: 'e12', source: 'n8', target: 'n5', directed: true },
  { id: 'e13', source: 'n1', target: 'n4', directed: true },
  { id: 'e14', source: 'n1', target: 'n5', directed: true },
  { id: 'e15', source: 'n1', target: 'n11', directed: true },
  { id: 'e16', source: 'n1', target: 'n12', directed: true },
  { id: 'e17', source: 'n10', target: 'n6', directed: true },
  { id: 'e18', source: 'n10', target: 'n7', directed: true },
];

// --- Centrality computation ---
interface CentralityResult {
  nodeId: string;
  label: string;
  degree: number;
  inDegree: number;
  outDegree: number;
  betweenness: number;
}

function computeCentrality(nodes: NetworkNode[], edges: NetworkEdge[]): CentralityResult[] {
  const degreeMap = new Map<string, { in: number; out: number }>();
  nodes.forEach((n) => degreeMap.set(n.id, { in: 0, out: 0 }));
  edges.forEach((e) => {
    const s = degreeMap.get(e.source);
    const t = degreeMap.get(e.target);
    if (s) s.out++;
    if (t) t.in++;
  });

  // Simple betweenness approximation via BFS shortest paths
  const betweennessMap = new Map<string, number>();
  nodes.forEach((n) => betweennessMap.set(n.id, 0));

  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  });

  for (const src of nodes) {
    const queue = [src.id];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    nodes.forEach((n) => { sigma.set(n.id, 0); dist.set(n.id, -1); predecessors.set(n.id, []); });
    sigma.set(src.id, 1);
    dist.set(src.id, 0);
    const order: string[] = [];

    while (queue.length > 0) {
      const v = queue.shift()!;
      order.push(v);
      for (const w of (adjacency.get(v) ?? [])) {
        if (dist.get(w) === -1) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          predecessors.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    nodes.forEach((n) => delta.set(n.id, 0));
    while (order.length > 0) {
      const w = order.pop()!;
      for (const v of (predecessors.get(w) ?? [])) {
        const contrib = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + contrib);
      }
      if (w !== src.id) {
        betweennessMap.set(w, betweennessMap.get(w)! + delta.get(w)!);
      }
    }
  }

  const maxBetween = Math.max(...Array.from(betweennessMap.values())) || 1;

  return nodes.map((n) => {
    const d = degreeMap.get(n.id)!;
    return {
      nodeId: n.id,
      label: n.label,
      degree: d.in + d.out,
      inDegree: d.in,
      outDegree: d.out,
      betweenness: Math.round((betweennessMap.get(n.id)! / maxBetween) * 100) / 100,
    };
  }).sort((a, b) => b.degree - a.degree);
}

// BFS path finder
function findPath(nodes: NetworkNode[], edges: NetworkEdge[], sourceId: string, targetId: string): string[] | null {
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  });

  const queue = [[sourceId]];
  const visited = new Set([sourceId]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1]!;
    if (node === targetId) return path;
    for (const neighbor of (adjacency.get(node) ?? [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
}

// Community detection (simple greedy label propagation)
function detectCommunities(nodes: NetworkNode[], edges: NetworkEdge[]): Map<string, number> {
  const labels = new Map<string, number>();
  nodes.forEach((n, i) => labels.set(n.id, i));

  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  });

  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const node of nodes) {
      const neighbors = adjacency.get(node.id) ?? [];
      if (neighbors.length === 0) continue;
      const freq = new Map<number, number>();
      for (const nb of neighbors) {
        const lbl = labels.get(nb)!;
        freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
      }
      let maxCount = 0;
      let maxLabel = labels.get(node.id)!;
      for (const [lbl, cnt] of freq) {
        if (cnt > maxCount) { maxCount = cnt; maxLabel = lbl; }
      }
      if (maxLabel !== labels.get(node.id)) { labels.set(node.id, maxLabel); changed = true; }
    }
    if (!changed) break;
  }

  // Normalize community IDs
  const uniqueLabels = Array.from(new Set(labels.values()));
  const normalize = new Map(uniqueLabels.map((l, i) => [l, i]));
  labels.forEach((v, k) => labels.set(k, normalize.get(v)!));
  return labels;
}

// --- Component ---
const COMMUNITY_COLORS = ['#6366f1', '#ec4899', '#22c55e', '#f97316', '#06b6d4', '#a855f7'];

export default function NetworkAnalysisPage() {
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [pathSource, setPathSource] = useState('n1');
  const [pathTarget, setPathTarget] = useState('n6');
  const [foundPath, setFoundPath] = useState<string[] | null>(null);
  const [showCommunities, setShowCommunities] = useState(false);

  const centrality = useMemo(() => computeCentrality(MOCK_NODES, MOCK_EDGES), []);
  const communities = useMemo(() => detectCommunities(MOCK_NODES, MOCK_EDGES), []);
  const nodeLabel = useMemo(() => new Map(MOCK_NODES.map((n) => [n.id, n.label])), []);

  const graphData: NetworkData = useMemo(() => {
    if (!showCommunities) return { nodes: MOCK_NODES, edges: MOCK_EDGES };
    return {
      nodes: MOCK_NODES.map((n) => ({
        ...n,
        color: COMMUNITY_COLORS[communities.get(n.id) ?? 0],
      })),
      edges: MOCK_EDGES,
    };
  }, [showCommunities, communities]);

  const highlightedPath = useMemo(() => new Set(foundPath ?? []), [foundPath]);

  const pathGraphData: NetworkData = useMemo(() => ({
    nodes: MOCK_NODES.map((n) => ({
      ...n,
      color: highlightedPath.has(n.id) ? '#f59e0b' : undefined,
    })),
    edges: MOCK_EDGES.map((e) => ({
      ...e,
      color: (highlightedPath.has(e.source) && highlightedPath.has(e.target)) ? '#f59e0b' : undefined,
    })),
  }), [highlightedPath]);

  const statsData = useMemo(() => {
    const n = MOCK_NODES.length;
    const e = MOCK_EDGES.length;
    const maxEdges = n * (n - 1);
    return {
      nodes: n,
      edges: e,
      density: (e / maxEdges).toFixed(4),
      avgDegree: (e * 2 / n).toFixed(2),
      communities: new Set(communities.values()).size,
      diameter: 4, // mock
    };
  }, [communities]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Network Analysis</h1>
        <p className="text-sm text-gray-400 mt-0.5">Centrality metrics, path finding, and community detection</p>
      </div>

      {/* Stats panel */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Nodes', value: statsData.nodes },
          { label: 'Edges', value: statsData.edges },
          { label: 'Density', value: statsData.density },
          { label: 'Avg Degree', value: statsData.avgDegree },
          { label: 'Communities', value: statsData.communities },
          { label: 'Diameter', value: statsData.diameter },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <div className="text-xs text-gray-400">{s.label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Main layout: network + tools */}
      <div className="grid grid-cols-3 gap-4">
        {/* Network viz */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Network Visualization</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCommunities}
                  onChange={(e) => setShowCommunities(e.target.checked)}
                  className="rounded"
                />
                Show communities
              </label>
            </div>
          </div>
          <div className="h-72">
            <NetworkChart
              data={foundPath ? pathGraphData : graphData}
              onNodeClick={(n) => setSelectedNode(n as NetworkNode)}
              nodeRadius={18}
            />
          </div>
          {showCommunities && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Array.from(new Set(communities.values())).map((cid) => (
                <div key={cid} className="flex items-center gap-1 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ background: COMMUNITY_COLORS[cid], display: 'inline-block' }} />
                  <span className="text-gray-500">Community {cid + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tools panel */}
        <div className="flex flex-col gap-4">
          {/* Path finder */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Path Finder</h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Source</label>
                <select
                  value={pathSource}
                  onChange={(e) => { setPathSource(e.target.value); setFoundPath(null); }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
                >
                  {MOCK_NODES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Target</label>
                <select
                  value={pathTarget}
                  onChange={(e) => { setPathTarget(e.target.value); setFoundPath(null); }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
                >
                  {MOCK_NODES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <button
                onClick={() => setFoundPath(findPath(MOCK_NODES, MOCK_EDGES, pathSource, pathTarget))}
                className="w-full py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Find Shortest Path
              </button>
              {foundPath !== null && (
                <div className="mt-2">
                  {foundPath.length > 0 ? (
                    <div>
                      <div className="text-xs text-emerald-600 font-medium mb-1">Path found ({foundPath.length - 1} hops)</div>
                      <div className="flex flex-wrap items-center gap-1">
                        {foundPath.map((id, i) => (
                          <React.Fragment key={id}>
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">{nodeLabel.get(id)}</span>
                            {i < foundPath.length - 1 && <span className="text-gray-400 text-xs">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-rose-500">No path found</div>
                  )}
                  <button onClick={() => setFoundPath(null)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Clear</button>
                </div>
              )}
            </div>
          </div>

          {/* Selected node info */}
          {selectedNode && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Selected Node</h2>
              <div className="text-sm font-medium text-gray-900">{selectedNode.label}</div>
              <div className="text-xs text-gray-400 capitalize mb-2">{selectedNode.type}</div>
              {(() => {
                const c = centrality.find((r) => r.nodeId === selectedNode.id);
                if (!c) return null;
                return (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Degree</span><span className="font-medium">{c.degree}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">In-degree</span><span className="font-medium">{c.inDegree}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Out-degree</span><span className="font-medium">{c.outDegree}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Betweenness</span><span className="font-medium">{c.betweenness}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Community</span><span className="font-medium">{(communities.get(selectedNode.id) ?? 0) + 1}</span></div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Centrality table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Centrality Analysis</h2>
          <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Rank</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Node</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Degree</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">In</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Out</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Betweenness</th>
                <th className="px-5 py-2.5 text-xs font-medium text-gray-500">Community</th>
              </tr>
            </thead>
            <tbody>
              {centrality.map((row, i) => {
                const cid = communities.get(row.nodeId) ?? 0;
                return (
                  <tr key={row.nodeId} className={`${i < centrality.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                    <td className="px-5 py-2.5 text-gray-400 text-xs font-medium">#{i + 1}</td>
                    <td className="px-5 py-2.5 font-medium text-gray-800">{row.label}</td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 rounded-full bg-indigo-100 w-20 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${(row.degree / (centrality[0]?.degree ?? 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 w-5 text-right">{row.degree}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs text-gray-500">{row.inDegree}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-gray-500">{row.outDegree}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-gray-700">{row.betweenness}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs text-white font-medium"
                        style={{ background: COMMUNITY_COLORS[cid] }}
                      >
                        {cid + 1}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
