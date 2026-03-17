'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { NetworkData, NetworkNode } from './types';
import { generateColorScale, defaultTheme } from './chart-utils';

interface NetworkChartProps {
  data: NetworkData;
  className?: string;
  onNodeClick?: (node: NetworkNode) => void;
  nodeRadius?: number;
}

interface SimNode extends NetworkNode {
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const REPULSION = 3000;
const SPRING_LENGTH = 100;
const SPRING_STRENGTH = 0.05;
const DAMPING = 0.85;
const ALPHA_DECAY = 0.02;

function initSimulation(nodes: NetworkNode[], width: number, height: number): SimNode[] {
  return nodes.map((n) => ({
    ...n,
    x: n.x ?? width / 2 + (Math.random() - 0.5) * 200,
    y: n.y ?? height / 2 + (Math.random() - 0.5) * 200,
    vx: 0,
    vy: 0,
  }));
}

export function NetworkChart({
  data,
  className = '',
  onNodeClick,
  nodeRadius = 20,
}: NetworkChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node: SimNode | null }>({
    visible: false, x: 0, y: 0, node: null,
  });

  const alphaRef = useRef(1);
  const nodesRef = useRef<SimNode[]>([]);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; startX: number; startY: number }>({ nodeId: null, startX: 0, startY: 0 });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startTx: number; startTy: number }>({
    active: false, startX: 0, startY: 0, startTx: 0, startTy: 0,
  });

  const colors = useMemo(() => generateColorScale(12, defaultTheme), []);
  const typeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    data.nodes.forEach((n) => {
      if (n.type && !map.has(n.type)) {
        map.set(n.type, colors[map.size % colors.length] ?? '#6366f1');
      }
    });
    return map;
  }, [data.nodes, colors]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const simNodes = initSimulation(data.nodes, dimensions.width, dimensions.height);
    nodesRef.current = simNodes;
    setNodes([...simNodes]);
    alphaRef.current = 1;
  }, [data.nodes, dimensions]);

  // Force simulation loop
  useEffect(() => {
    const edgeMap = new Map<string, string[]>();
    data.edges.forEach((e) => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
      edgeMap.get(e.source)!.push(e.target);
      edgeMap.get(e.target)!.push(e.source);
    });

    const tick = () => {
      if (alphaRef.current < 0.001) return;
      const ns = nodesRef.current;
      const n = ns.length;

      // Repulsion between all node pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ni = ns[i]!;
          const nj = ns[j]!;
          const dx = nj.x! - ni.x!;
          const dy = nj.y! - ni.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (REPULSION * alphaRef.current) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ni.vx -= fx;
          ni.vy -= fy;
          nj.vx += fx;
          nj.vy += fy;
        }
      }

      // Spring forces along edges
      data.edges.forEach((edge) => {
        const src = ns.find((n) => n.id === edge.source);
        const tgt = ns.find((n) => n.id === edge.target);
        if (!src || !tgt) return;
        const dx = tgt.x! - src.x!;
        const dy = tgt.y! - src.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH * alphaRef.current;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!src.fx) { src.vx += fx; src.vy += fy; }
        if (!tgt.fx) { tgt.vx -= fx; tgt.vy -= fy; }
      });

      // Center gravity
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      ns.forEach((node) => {
        if (!node.fx) {
          node.vx += (cx - node.x!) * 0.01 * alphaRef.current;
          node.vy += (cy - node.y!) * 0.01 * alphaRef.current;
        }
      });

      // Apply velocity with damping
      ns.forEach((node) => {
        if (node.fx !== undefined) {
          node.x = node.fx;
          node.y = node.fy;
        } else {
          node.vx *= DAMPING;
          node.vy *= DAMPING;
          node.x = (node.x ?? cx) + node.vx;
          node.y = (node.y ?? cy) + node.vy;
        }
      });

      alphaRef.current -= ALPHA_DECAY;
      setNodes([...ns]);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [data.edges, dimensions]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY };
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (node) { node.fx = node.x; node.fy = node.y; }
  }, []);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
      if (node) {
        node.fx = (e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0) - transform.x) / transform.scale;
        node.fy = (e.clientY - (svgRef.current?.getBoundingClientRect().top ?? 0) - transform.y) / transform.scale;
        node.x = node.fx;
        node.y = node.fy;
        setNodes([...nodesRef.current]);
      }
    } else if (panRef.current.active) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setTransform((t) => ({ ...t, x: panRef.current.startTx + dx, y: panRef.current.startTy + dy }));
    }
  }, [transform]);

  const handleSvgMouseUp = useCallback(() => {
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
      if (node) { delete node.fx; delete node.fy; alphaRef.current = 0.3; }
      dragRef.current.nodeId = null;
    }
    panRef.current.active = false;
  }, []);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'g') {
      panRef.current = { active: true, startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y };
    }
  }, [transform]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * factor)) }));
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, node: SimNode) => {
    e.stopPropagation();
    setSelectedId(node.id === selectedId ? null : node.id);
    onNodeClick?.(node);
  }, [selectedId, onNodeClick]);

  const getNodeColor = (node: SimNode) => {
    if (node.color) return node.color;
    if (node.type) return typeColorMap.get(node.type) ?? colors[0];
    return colors[0];
  };

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[300px] bg-gray-50 rounded-lg overflow-hidden ${className}`}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseDown={handleSvgMouseDown}
        onWheel={handleWheel}
        className="cursor-grab active:cursor-grabbing"
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="#9ca3af" />
          </marker>
        </defs>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {/* Edges */}
          {data.edges.map((edge) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            const isSelected = selectedId === edge.source || selectedId === edge.target;
            return (
              <line
                key={edge.id}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isSelected ? '#6366f1' : (edge.color ?? '#d1d5db')}
                strokeWidth={isSelected ? 2 : (edge.weight ?? 1)}
                strokeOpacity={isSelected ? 1 : 0.6}
                markerEnd={edge.directed ? 'url(#arrow)' : undefined}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = getNodeColor(node);
            const isSelected = selectedId === node.id;
            const r = node.radius ?? nodeRadius;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={(e) => handleNodeClick(e, node)}
                onMouseEnter={(e) => {
                  const rect = svgRef.current!.getBoundingClientRect();
                  setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, node });
                }}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                className="cursor-pointer"
              >
                <circle
                  r={isSelected ? r + 4 : r}
                  fill={color}
                  fillOpacity={0.9}
                  stroke={isSelected ? '#1e40af' : 'white'}
                  strokeWidth={isSelected ? 3 : 2}
                  style={{ transition: 'r 0.15s ease' }}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={10}
                  fontWeight={600}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.label.slice(0, 3)}
                </text>
                <text
                  y={r + 12}
                  textAnchor="middle"
                  fill="#374151"
                  fontSize={10}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.label.length > 12 ? node.label.slice(0, 12) + '...' : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 shadow-lg text-sm"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, background: '#1f2937', color: '#f9fafb', maxWidth: 200 }}
        >
          <div className="font-medium">{tooltip.node.label}</div>
          {tooltip.node.type && <div className="text-xs opacity-70">Type: {tooltip.node.type}</div>}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.min(4, t.scale * 1.2) }))}
          className="w-8 h-8 rounded bg-white shadow text-gray-600 hover:bg-gray-50 flex items-center justify-center text-lg font-bold"
        >+</button>
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.2, t.scale * 0.8) }))}
          className="w-8 h-8 rounded bg-white shadow text-gray-600 hover:bg-gray-50 flex items-center justify-center text-lg font-bold"
        >−</button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          className="w-8 h-8 rounded bg-white shadow text-gray-600 hover:bg-gray-50 flex items-center justify-center text-xs"
        >⤢</button>
      </div>

      {/* Type legend */}
      {typeColorMap.size > 0 && (
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {Array.from(typeColorMap.entries()).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs bg-white/80 rounded px-2 py-0.5">
              <span className="w-2 h-2 rounded-full" style={{ background: color, display: 'inline-block' }} />
              <span className="text-gray-600">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
