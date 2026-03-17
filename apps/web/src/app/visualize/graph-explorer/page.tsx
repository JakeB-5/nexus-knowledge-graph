'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// --- Mock data ---
interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  connections: number;
  description?: string;
  tags?: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

const NODE_TYPES = ['concept', 'paper', 'author', 'topic', 'dataset'];
const TYPE_COLORS: Record<string, string> = {
  concept: '#6366f1',
  paper: '#8b5cf6',
  author: '#ec4899',
  topic: '#f97316',
  dataset: '#22c55e',
};

function generateMockGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [
    { id: 'n1', label: 'Machine Learning', type: 'topic', x: 400, y: 300, connections: 8, tags: ['ai', 'ml'] },
    { id: 'n2', label: 'Neural Networks', type: 'concept', x: 560, y: 200, connections: 6 },
    { id: 'n3', label: 'Attention Is All You Need', type: 'paper', x: 700, y: 300, connections: 5 },
    { id: 'n4', label: 'Vaswani et al.', type: 'author', x: 700, y: 420, connections: 3 },
    { id: 'n5', label: 'Transformer', type: 'concept', x: 560, y: 380, connections: 7 },
    { id: 'n6', label: 'NLP', type: 'topic', x: 260, y: 220, connections: 5 },
    { id: 'n7', label: 'ImageNet', type: 'dataset', x: 220, y: 380, connections: 4 },
    { id: 'n8', label: 'Computer Vision', type: 'topic', x: 100, y: 300, connections: 4 },
    { id: 'n9', label: 'Deep Learning', type: 'concept', x: 300, y: 460, connections: 6 },
    { id: 'n10', label: 'BERT', type: 'concept', x: 480, y: 480, connections: 5 },
    { id: 'n11', label: 'GPT', type: 'concept', x: 620, y: 480, connections: 4 },
    { id: 'n12', label: 'Hinton G.', type: 'author', x: 140, y: 180, connections: 3 },
    { id: 'n13', label: 'Reinforcement Learning', type: 'concept', x: 120, y: 440, connections: 3 },
    { id: 'n14', label: 'Knowledge Graph', type: 'concept', x: 370, y: 170, connections: 5 },
  ];

  const edges: GraphEdge[] = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n1', target: 'n5', label: 'includes' },
    { id: 'e3', source: 'n1', target: 'n6' },
    { id: 'e4', source: 'n2', target: 'n3', label: 'described in' },
    { id: 'e5', source: 'n3', target: 'n4', label: 'authored by' },
    { id: 'e6', source: 'n3', target: 'n5', label: 'introduces' },
    { id: 'e7', source: 'n5', target: 'n10', label: 'basis of' },
    { id: 'e8', source: 'n5', target: 'n11', label: 'basis of' },
    { id: 'e9', source: 'n6', target: 'n10' },
    { id: 'e10', source: 'n6', target: 'n11' },
    { id: 'e11', source: 'n7', target: 'n8', label: 'used in' },
    { id: 'e12', source: 'n8', target: 'n2' },
    { id: 'e13', source: 'n9', target: 'n1', label: 'subset of' },
    { id: 'e14', source: 'n9', target: 'n2' },
    { id: 'e15', source: 'n12', target: 'n2', label: 'pioneered' },
    { id: 'e16', source: 'n12', target: 'n8' },
    { id: 'e17', source: 'n13', target: 'n1' },
    { id: 'e18', source: 'n14', target: 'n1', label: 'applied in' },
    { id: 'e19', source: 'n1', target: 'n9' },
    { id: 'e20', source: 'n10', target: 'n9' },
  ];

  return { nodes, edges };
}

const MOCK_GRAPH = generateMockGraph();

// --- Component ---
export default function GraphExplorerPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>(MOCK_GRAPH.nodes);
  const [edges] = useState<GraphEdge[]>(MOCK_GRAPH.edges);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [layout, setLayout] = useState<'force' | 'circle' | 'grid'>('force');
  const [showMinimap, setShowMinimap] = useState(true);

  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({
    active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0,
  });

  // Apply layout
  useEffect(() => {
    if (layout === 'circle') {
      const count = nodes.length;
      const r = 250;
      setNodes((prev) => prev.map((n, i) => ({
        ...n,
        x: 420 + r * Math.cos((2 * Math.PI * i) / count),
        y: 320 + r * Math.sin((2 * Math.PI * i) / count),
      })));
    } else if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      setNodes((prev) => prev.map((n, i) => ({
        ...n,
        x: 100 + (i % cols) * 130,
        y: 80 + Math.floor(i / cols) * 120,
      })));
    }
  }, [layout]);

  const filteredNodes = useMemo(() =>
    nodes.filter((n) => {
      const matchSearch = search === '' || n.label.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'all' || n.type === typeFilter;
      return matchSearch && matchType;
    }),
    [nodes, search, typeFilter]
  );

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(() =>
    edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)),
    [edges, filteredNodeIds]
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    const rect = svgRef.current!.getBoundingClientRect();
    dragRef.current = {
      nodeId: node.id,
      offsetX: (e.clientX - rect.left - pan.x) / zoom - node.x,
      offsetY: (e.clientY - rect.top - pan.y) / zoom - node.y,
    };
  }, [pan, zoom]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current.nodeId) {
      const rect = svgRef.current!.getBoundingClientRect();
      const nx = (e.clientX - rect.left - pan.x) / zoom - dragRef.current.offsetX;
      const ny = (e.clientY - rect.top - pan.y) / zoom - dragRef.current.offsetY;
      setNodes((prev) => prev.map((n) => n.id === dragRef.current.nodeId ? { ...n, x: nx, y: ny } : n));
    } else if (panRef.current.active) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setPan({ x: panRef.current.startPanX + dx, y: panRef.current.startPanY + dy });
    }
  }, [pan, zoom]);

  const handleSvgMouseUp = useCallback(() => {
    dragRef.current.nodeId = null;
    panRef.current.active = false;
  }, []);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const tag = (e.target as SVGElement).tagName;
    if (tag === 'svg' || tag === 'g' || tag === 'line') {
      panRef.current = { active: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
      setSelectedNode(null);
    }
  }, [pan]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, []);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set(edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).map((e) => e.id));
  }, [selectedNode, edges]);

  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const ids = new Set<string>();
    edges.forEach((e) => {
      if (e.source === selectedNode.id) ids.add(e.target);
      if (e.target === selectedNode.id) ids.add(e.source);
    });
    return ids;
  }, [selectedNode, edges]);

  const fitView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const nodeR = 22;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-sm font-semibold text-gray-800 mr-2">Graph Explorer</h1>

        {/* Layout selector */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['force', 'circle', 'grid'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${layout === l ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 text-base">−</button>
          <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z * 1.2))} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 text-base">+</button>
          <button onClick={fitView} className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100">Fit</button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Search */}
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="pl-6 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 w-40"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowMinimap((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${showMinimap ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            Minimap
          </button>
          <button className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: node list */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="all">All types</option>
              {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="text-xs text-gray-400 px-3 py-2">{filteredNodes.length} nodes</div>

          <div className="flex-1 overflow-y-auto">
            {filteredNodes.map((node) => {
              const color = TYPE_COLORS[node.type] ?? '#6366f1';
              const isSelected = selectedNode?.id === node.id;
              return (
                <button
                  key={node.id}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors border-b border-gray-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="font-medium text-gray-700 truncate">{node.label}</span>
                  </div>
                  <div className="text-gray-400 mt-0.5 pl-4">{node.type} · {node.connections} links</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Graph canvas */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseDown={handleSvgMouseDown}
            onWheel={handleWheel}
          >
            <defs>
              <marker id="gex-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
                <path d="M0 0 L8 3 L0 6 Z" fill="#d1d5db" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleEdges.map((edge) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;
                const isHighlighted = connectedEdges.has(edge.id);
                return (
                  <g key={edge.id}>
                    <line
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={isHighlighted ? '#6366f1' : '#e5e7eb'}
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeOpacity={selectedNode && !isHighlighted ? 0.2 : 1}
                      markerEnd="url(#gex-arrow)"
                    />
                    {edge.label && isHighlighted && (
                      <text
                        x={(src.x + tgt.x) / 2}
                        y={(src.y + tgt.y) / 2 - 6}
                        textAnchor="middle"
                        fill="#6366f1"
                        fontSize={9}
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {filteredNodes.map((node) => {
                const color = TYPE_COLORS[node.type] ?? '#6366f1';
                const isSelected = selectedNode?.id === node.id;
                const isConnected = connectedNodeIds.has(node.id);
                const isDimmed = selectedNode && !isSelected && !isConnected;
                const r = isSelected ? nodeR + 4 : nodeR;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onClick={(e) => handleNodeClick(e, node)}
                    className="cursor-pointer"
                    style={{ opacity: isDimmed ? 0.25 : 1, transition: 'opacity 0.15s' }}
                  >
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity={0.9}
                      stroke={isSelected ? 'white' : 'rgba(255,255,255,0.6)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <text textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9} fontWeight={600} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {node.label.slice(0, 4)}
                    </text>
                    <text y={r + 13} textAnchor="middle" fill="#374151" fontSize={9} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Minimap */}
          {showMinimap && (
            <div className="absolute bottom-4 right-4 w-36 h-24 bg-white/90 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <svg viewBox="0 0 840 640" className="w-full h-full">
                {visibleEdges.map((e) => {
                  const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
                  if (!s || !t) return null;
                  return <line key={e.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#e5e7eb" strokeWidth={2} />;
                })}
                {filteredNodes.map((n) => (
                  <circle key={n.id} cx={n.x} cy={n.y} r={6} fill={TYPE_COLORS[n.type] ?? '#6366f1'} fillOpacity={0.8} />
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Right panel: node details */}
        {selectedNode && (
          <div className="w-64 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Node Details</span>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: TYPE_COLORS[selectedNode.type] ?? '#6366f1' }}>
                  {selectedNode.label.slice(0, 2)}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{selectedNode.label}</div>
                  <div className="text-xs text-gray-400 capitalize">{selectedNode.type}</div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Connections</span>
                  <span className="font-medium text-gray-700">{selectedNode.connections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Node ID</span>
                  <span className="font-mono text-gray-500">{selectedNode.id}</span>
                </div>
              </div>

              {selectedNode.tags && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-1.5">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-2">Connected to</div>
                <div className="space-y-1">
                  {edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .slice(0, 6)
                    .map((e) => {
                      const otherId = e.source === selectedNode.id ? e.target : e.source;
                      const other = nodeMap.get(otherId);
                      if (!other) return null;
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedNode(other)}
                          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[other.type] ?? '#6366f1' }} />
                          <span className="text-xs text-gray-600 truncate">{other.label}</span>
                          {e.label && <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{e.label}</span>}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button className="w-full py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                  Expand neighbors
                </button>
                <button className="w-full py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Open in Knowledge
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Type legend bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-t border-gray-100 flex-shrink-0">
        {NODE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${typeFilter !== 'all' && typeFilter !== type ? 'opacity-40' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[type], display: 'inline-block' }} />
            <span className="text-gray-600 capitalize">{type}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{filteredNodes.length} nodes · {visibleEdges.length} edges</span>
      </div>
    </div>
  );
}
