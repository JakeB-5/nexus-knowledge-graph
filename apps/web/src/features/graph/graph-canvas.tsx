"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphCanvasProps {
  data: GraphData;
  selectedNodeId?: string | null;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  className?: string;
  showLabels?: boolean;
  showArrows?: boolean;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "#6366f1",
  document: "#10b981",
  person: "#f59e0b",
  place: "#ef4444",
  event: "#8b5cf6",
  tag: "#06b6d4",
  default: "#64748b",
};

const NODE_RADIUS = 20;
const ARROW_SIZE = 8;

interface Transform {
  x: number;
  y: number;
  scale: number;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

function initPositions(nodes: GraphNode[], width: number, height: number): NodePosition[] {
  return nodes.map((node, i) => {
    if (node.x !== undefined && node.y !== undefined) {
      return { id: node.id, x: node.x, y: node.y };
    }
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.35;
    return {
      id: node.id,
      x: width / 2 + r * Math.cos(angle),
      y: height / 2 + r * Math.sin(angle),
    };
  });
}

export default function GraphCanvas({
  data,
  selectedNodeId,
  onNodeClick,
  onNodeDoubleClick,
  className = "",
  showLabels = true,
  showArrows = true,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const positionsRef = useRef<NodePosition[]>([]);
  const isDraggingRef = useRef(false);
  const dragNodeRef = useRef<string | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Initialize positions when data changes
  useEffect(() => {
    const { width, height } = size;
    positionsRef.current = initPositions(data.nodes, width, height);
  }, [data.nodes, size]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const getNodeAtPoint = useCallback(
    (cx: number, cy: number): GraphNode | null => {
      const t = transformRef.current;
      const worldX = (cx - t.x) / t.scale;
      const worldY = (cy - t.y) / t.scale;
      for (const node of data.nodes) {
        const pos = positionsRef.current.find((p) => p.id === node.id);
        if (!pos) continue;
        const dx = worldX - pos.x;
        const dy = worldY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) <= NODE_RADIUS) return node;
      }
      return null;
    },
    [data.nodes]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = size;
    const t = transformRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);

    // Draw edges
    for (const edge of data.edges) {
      const srcPos = positionsRef.current.find((p) => p.id === edge.source);
      const tgtPos = positionsRef.current.find((p) => p.id === edge.target);
      if (!srcPos || !tgtPos) continue;

      const dx = tgtPos.x - srcPos.x;
      const dy = tgtPos.y - srcPos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const ux = dx / len;
      const uy = dy / len;
      const startX = srcPos.x + ux * NODE_RADIUS;
      const startY = srcPos.y + uy * NODE_RADIUS;
      const endX = tgtPos.x - ux * NODE_RADIUS;
      const endY = tgtPos.y - uy * NODE_RADIUS;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5 / t.scale;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (showArrows && len > NODE_RADIUS * 2) {
        const arrowX = endX;
        const arrowY = endY;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
          arrowY - ARROW_SIZE * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
          arrowY - ARROW_SIZE * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = "#94a3b8";
        ctx.fill();
      }
    }

    // Draw nodes
    for (const node of data.nodes) {
      const pos = positionsRef.current.find((p) => p.id === node.id);
      if (!pos) continue;

      // Visibility culling
      const screenX = pos.x * t.scale + t.x;
      const screenY = pos.y * t.scale + t.y;
      if (
        screenX < -NODE_RADIUS * 2 ||
        screenX > width + NODE_RADIUS * 2 ||
        screenY < -NODE_RADIUS * 2 ||
        screenY > height + NODE_RADIUS * 2
      )
        continue;

      const color = NODE_TYPE_COLORS[node.type] ?? NODE_TYPE_COLORS["default"] ?? "#64748b";
      const isSelected = node.id === selectedNodeId;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, NODE_RADIUS + 5, 0, Math.PI * 2);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / t.scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#fff" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = isSelected ? 2.5 / t.scale : 1.5 / t.scale;
      ctx.stroke();

      if (showLabels && t.scale > 0.4) {
        ctx.fillStyle = "#f8fafc";
        ctx.font = `${Math.max(10, 12 / t.scale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const maxLen = 12;
        const label =
          node.label.length > maxLen ? node.label.slice(0, maxLen) + "…" : node.label;
        ctx.fillText(label, pos.x, pos.y);
      }
    }

    ctx.restore();
  }, [data, selectedNodeId, showLabels, showArrows, size]);

  // Render loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const node = getNodeAtPoint(cx, cy);
      if (node) {
        dragNodeRef.current = node.id;
      } else {
        isDraggingRef.current = true;
      }
      lastMouseRef.current = { x: cx, y: cy };
    },
    [getNodeAtPoint]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const dx = cx - lastMouseRef.current.x;
    const dy = cy - lastMouseRef.current.y;
    lastMouseRef.current = { x: cx, y: cy };

    if (dragNodeRef.current) {
      const t = transformRef.current;
      const pos = positionsRef.current.find((p) => p.id === dragNodeRef.current);
      if (pos) {
        pos.x += dx / t.scale;
        pos.y += dy / t.scale;
      }
    } else if (isDraggingRef.current) {
      transformRef.current.x += dx;
      transformRef.current.y += dy;
    }
  }, []);

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const totalDx = Math.abs(cx - lastMouseRef.current.x);
      const totalDy = Math.abs(cy - lastMouseRef.current.y);

      if (totalDx < 4 && totalDy < 4 && !isDraggingRef.current) {
        const node = getNodeAtPoint(cx, cy);
        if (node) onNodeClick?.(node);
      }

      dragNodeRef.current = null;
      isDraggingRef.current = false;
    },
    [getNodeAtPoint, onNodeClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const node = getNodeAtPoint(cx, cy);
      if (node) onNodeDoubleClick?.(node);
    },
    [getNodeAtPoint, onNodeDoubleClick]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.1, Math.min(5, t.scale * factor));
    t.x = cx - ((cx - t.x) * newScale) / t.scale;
    t.y = cy - ((cy - t.y) * newScale) / t.scale;
    t.scale = newScale;
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="block cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isDraggingRef.current = false;
          dragNodeRef.current = null;
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
    </div>
  );
}
