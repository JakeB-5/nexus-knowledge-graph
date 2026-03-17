// Main Canvas2D graph renderer for the Nexus graph visualization

import type {
  VisualNode,
  VisualEdge,
  RenderOptions,
  BoundingBox,
  Point,
} from './types.js';
import type { GraphTheme, NodeTypeStyle, EdgeTypeStyle } from './types.js';
import { Camera } from './camera.js';
import { InteractionManager } from './interaction.js';
import { lightTheme, getNodeStyle, getEdgeStyle, hexToRgba } from './theme.js';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  antialias: true,
  showLabels: true,
  showEdgeLabels: false,
  showMinimap: true,
  showFPS: false,
  nodeOpacity: 1,
  edgeOpacity: 0.8,
  minimapSize: 160,
  pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  curvedEdges: true,
  arrowSize: 8,
};

// ─── FPS Counter ──────────────────────────────────────────────────────────────

class FPSCounter {
  private _frames: number[] = [];
  private _fps: number = 0;

  tick(now: number): void {
    this._frames.push(now);
    const cutoff = now - 1000;
    while (this._frames.length > 0 && this._frames[0] < cutoff) {
      this._frames.shift();
    }
    this._fps = this._frames.length;
  }

  get fps(): number { return this._fps; }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class GraphRenderer {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _camera: Camera;
  private _interaction: InteractionManager;

  private _nodes: Map<string, VisualNode> = new Map();
  private _edges: Map<string, VisualEdge> = new Map();

  private _theme: GraphTheme = lightTheme;
  private _options: RenderOptions;

  private _rafId: number = 0;
  private _running: boolean = false;
  private _fps = new FPSCounter();
  private _lastFrameTime: number = 0;

  // Bidirectional edge tracking (source+target pair → count)
  private _edgePairs: Map<string, number> = new Map();

  constructor(
    canvas: HTMLCanvasElement,
    options: Partial<RenderOptions> = {},
  ) {
    this._canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D context unavailable');
    this._ctx = ctx;
    this._options = { ...DEFAULT_RENDER_OPTIONS, ...options };

    const { width, height } = canvas.getBoundingClientRect();
    this._camera = new Camera(width || canvas.width, height || canvas.height);
    this._interaction = new InteractionManager(canvas, this._camera);

    this._applyPixelRatio();
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  private _applyPixelRatio(): void {
    const pr = this._options.pixelRatio;
    const rect = this._canvas.getBoundingClientRect();
    const w = rect.width || this._canvas.width;
    const h = rect.height || this._canvas.height;
    this._canvas.width = w * pr;
    this._canvas.height = h * pr;
    this._ctx.scale(pr, pr);
    this._camera.resize(w, h);
  }

  resize(width: number, height: number): void {
    const pr = this._options.pixelRatio;
    this._canvas.width = width * pr;
    this._canvas.height = height * pr;
    this._ctx.scale(pr, pr);
    this._camera.resize(width, height);
  }

  // ─── Data ───────────────────────────────────────────────────────────────────

  setGraph(nodes: VisualNode[], edges: VisualEdge[]): void {
    this._nodes.clear();
    for (const n of nodes) this._nodes.set(n.id, n);
    this._edges.clear();
    for (const e of edges) this._edges.set(e.id, e);
    this._buildEdgePairs();
    this._interaction.setNodes(nodes);
    this._interaction.setEdges(edges);
  }

  addNode(node: VisualNode): void {
    this._nodes.set(node.id, node);
    this._buildEdgePairs();
    this._interaction.updateNode(node);
  }

  removeNode(id: string): void {
    this._nodes.delete(id);
    // Remove connected edges
    for (const [eid, edge] of this._edges) {
      if (edge.source === id || edge.target === id) this._edges.delete(eid);
    }
    this._buildEdgePairs();
  }

  addEdge(edge: VisualEdge): void {
    this._edges.set(edge.id, edge);
    this._buildEdgePairs();
  }

  removeEdge(id: string): void {
    this._edges.delete(id);
    this._buildEdgePairs();
  }

  updateNodePosition(id: string, x: number, y: number): void {
    const node = this._nodes.get(id);
    if (node) { node.x = x; node.y = y; }
  }

  private _buildEdgePairs(): void {
    this._edgePairs.clear();
    for (const edge of this._edges.values()) {
      const key = [edge.source, edge.target].sort().join('::');
      this._edgePairs.set(key, (this._edgePairs.get(key) ?? 0) + 1);
    }
  }

  private _isBidirectional(edge: VisualEdge): boolean {
    const key = [edge.source, edge.target].sort().join('::');
    return (this._edgePairs.get(key) ?? 0) > 1;
  }

  // ─── Theme & Options ─────────────────────────────────────────────────────────

  setTheme(theme: GraphTheme): void {
    this._theme = theme;
  }

  setOptions(options: Partial<RenderOptions>): void {
    this._options = { ...this._options, ...options };
  }

  get camera(): Camera { return this._camera; }
  get interaction(): InteractionManager { return this._interaction; }
  get theme(): GraphTheme { return this._theme; }

  // ─── Render Loop ─────────────────────────────────────────────────────────────

  start(): void {
    if (this._running) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this._frame.bind(this));
  }

  stop(): void {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _frame(now: number): void {
    if (!this._running) return;
    const dt = now - this._lastFrameTime;
    this._lastFrameTime = now;
    this._fps.tick(now);
    this._camera.tick(now);
    this.render();
    this._rafId = requestAnimationFrame(this._frame.bind(this));
    void dt; // suppress unused warning
  }

  /** Render one frame synchronously (useful for testing / export). */
  render(): void {
    const ctx = this._ctx;
    const w = this._canvas.width / this._options.pixelRatio;
    const h = this._canvas.height / this._options.pixelRatio;

    // Clear
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this._theme.background;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.restore();

    // Apply grid (if enabled)
    if (this._theme.grid.visible) {
      this._renderGrid(ctx, w, h);
    }

    // Apply camera transform
    this._camera.applyToContext(ctx);

    // Render edges
    this._renderEdges(ctx);

    // Render nodes
    this._renderNodes(ctx);

    // Render box select
    ctx.restore && ctx.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._renderBoxSelect(ctx);

    // Minimap
    if (this._options.showMinimap) {
      this._renderMinimap(ctx, w, h);
    }

    // FPS counter
    if (this._options.showFPS) {
      this._renderFPS(ctx, w);
    }

    ctx.restore();
  }

  // ─── Grid ────────────────────────────────────────────────────────────────────

  private _renderGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const { color, spacing } = this._theme.grid;
    const visibleBounds = this._camera.getVisibleBounds();
    const zoom = this._camera.zoom;

    // Adjust spacing based on zoom
    let s = spacing;
    while (s * zoom < 20) s *= 5;
    while (s * zoom > 200) s /= 5;

    ctx.save();
    this._camera.applyToContext(ctx);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / zoom;

    const startX = Math.floor(visibleBounds.minX / s) * s;
    const startY = Math.floor(visibleBounds.minY / s) * s;

    ctx.beginPath();
    for (let x = startX; x <= visibleBounds.maxX; x += s) {
      ctx.moveTo(x, visibleBounds.minY);
      ctx.lineTo(x, visibleBounds.maxY);
    }
    for (let y = startY; y <= visibleBounds.maxY; y += s) {
      ctx.moveTo(visibleBounds.minX, y);
      ctx.lineTo(visibleBounds.maxX, y);
    }
    ctx.stroke();
    ctx.restore();
    void w; void h;
  }

  // ─── Edges ───────────────────────────────────────────────────────────────────

  private _renderEdges(ctx: CanvasRenderingContext2D): void {
    const zoom = this._camera.zoom;
    const visibleBounds = this._camera.getVisibleBounds();

    for (const edge of this._edges.values()) {
      const src = this._nodes.get(edge.source);
      const tgt = this._nodes.get(edge.target);
      if (!src || !tgt) continue;

      // Cull if both nodes are off screen
      const srcVisible =
        src.x >= visibleBounds.minX - src.radius &&
        src.x <= visibleBounds.maxX + src.radius &&
        src.y >= visibleBounds.minY - src.radius &&
        src.y <= visibleBounds.maxY + src.radius;
      const tgtVisible =
        tgt.x >= visibleBounds.minX - tgt.radius &&
        tgt.x <= visibleBounds.maxX + tgt.radius &&
        tgt.y >= visibleBounds.minY - tgt.radius &&
        tgt.y <= visibleBounds.maxY + tgt.radius;

      if (!srcVisible && !tgtVisible) continue;

      const style = getEdgeStyle(this._theme, edge.type);
      const isSelected = this._interaction.selectedEdges.has(edge.id);
      const isHovered = this._interaction.hoveredEdgeId === edge.id;

      const color = isSelected
        ? this._theme.selection.edgeColor
        : isHovered
        ? this._theme.hover.edgeColor
        : (edge.color ?? style.color);

      const width = (edge.width ?? style.width) / zoom;

      ctx.save();
      ctx.globalAlpha = this._options.edgeOpacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;

      if (edge.dashed ?? style.dashed) {
        const pattern = style.dashPattern ?? [6, 3];
        ctx.setLineDash(pattern.map(v => v / zoom));
      } else {
        ctx.setLineDash([]);
      }

      const isBidi = this._isBidirectional(edge);
      const curved = (this._options.curvedEdges && isBidi) || (edge.type === 'references');

      if (curved) {
        this._renderCurvedEdge(ctx, src, tgt, style, edge.directed ?? true, zoom);
      } else {
        this._renderStraightEdge(ctx, src, tgt, style, edge.directed ?? true, zoom);
      }

      // Edge label
      if (this._options.showEdgeLabels && edge.label) {
        this._renderEdgeLabel(ctx, src, tgt, edge.label, curved, zoom);
      }

      ctx.restore();
    }
  }

  private _renderStraightEdge(
    ctx: CanvasRenderingContext2D,
    src: VisualNode,
    tgt: VisualNode,
    style: EdgeTypeStyle,
    directed: boolean,
    zoom: number,
  ): void {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Adjust endpoints to node radius
    const sx = src.x + nx * src.radius;
    const sy = src.y + ny * src.radius;
    const ex = tgt.x - nx * tgt.radius;
    const ey = tgt.y - ny * tgt.radius;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    if (directed) {
      this._renderArrow(ctx, ex, ey, nx, ny, style.arrowSize / zoom);
    }
  }

  private _renderCurvedEdge(
    ctx: CanvasRenderingContext2D,
    src: VisualNode,
    tgt: VisualNode,
    style: EdgeTypeStyle,
    directed: boolean,
    zoom: number,
  ): void {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Control point offset (perpendicular)
    const curvature = 0.25;
    const cpx = (src.x + tgt.x) / 2 - dy * curvature;
    const cpy = (src.y + tgt.y) / 2 + dx * curvature;

    // Find intersection of curve tangent with node circle at target
    const ex = tgt.x - nx * tgt.radius;
    const ey = tgt.y - ny * tgt.radius;
    const sx = src.x + nx * src.radius;
    const sy = src.y + ny * src.radius;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();

    if (directed) {
      // Arrow direction: tangent at end of quadratic curve
      const tdx = ex - cpx;
      const tdy = ey - cpy;
      const tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      this._renderArrow(ctx, ex, ey, tdx / tl, tdy / tl, style.arrowSize / zoom);
    }
  }

  private _renderArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    nx: number,
    ny: number,
    size: number,
  ): void {
    const ax = -nx * size + ny * size * 0.5;
    const ay = -ny * size - nx * size * 0.5;
    const bx = -nx * size - ny * size * 0.5;
    const by = -ny * size + nx * size * 0.5;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  }

  private _renderEdgeLabel(
    ctx: CanvasRenderingContext2D,
    src: VisualNode,
    tgt: VisualNode,
    label: string,
    curved: boolean,
    zoom: number,
  ): void {
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;

    let lx = mx, ly = my;
    if (curved) {
      lx = mx - dy * 0.15;
      ly = my + dx * 0.15;
    }

    const fontSize = Math.max(8, this._theme.font.size * 0.85) / zoom;
    ctx.font = `${this._theme.font.weight} ${fontSize}px ${this._theme.font.family}`;
    ctx.fillStyle = this._theme.defaultEdge.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Background pill
    const metrics = ctx.measureText(label);
    const pad = 3 / zoom;
    ctx.fillStyle = hexToRgba(this._theme.background, 0.85);
    ctx.fillRect(lx - metrics.width / 2 - pad, ly - fontSize / 2 - pad, metrics.width + pad * 2, fontSize + pad * 2);
    ctx.fillStyle = this._theme.defaultEdge.color;
    ctx.fillText(label, lx, ly);
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────────

  private _renderNodes(ctx: CanvasRenderingContext2D): void {
    const zoom = this._camera.zoom;
    const visibleBounds = this._camera.getVisibleBounds();
    const { showLabels } = this._options;

    for (const node of this._nodes.values()) {
      // Culling
      const margin = node.radius * 2;
      if (
        node.x + margin < visibleBounds.minX ||
        node.x - margin > visibleBounds.maxX ||
        node.y + margin < visibleBounds.minY ||
        node.y - margin > visibleBounds.maxY
      ) continue;

      const style = getNodeStyle(this._theme, node.type);
      const isSelected = this._interaction.selectedNodes.has(node.id);
      const isHovered = this._interaction.hoveredNodeId === node.id;

      this._renderNode(ctx, node, style, isSelected, isHovered, zoom, showLabels);
    }
  }

  private _renderNode(
    ctx: CanvasRenderingContext2D,
    node: VisualNode,
    style: NodeTypeStyle,
    selected: boolean,
    hovered: boolean,
    zoom: number,
    showLabel: boolean,
  ): void {
    const scale = hovered ? this._theme.hover.scale : 1;
    const r = node.radius * scale;
    const color = node.color ?? style.color;
    const borderColor = selected
      ? this._theme.selection.nodeColor
      : hovered
      ? this._theme.hover.nodeColor
      : (node.borderColor ?? style.borderColor);

    ctx.save();
    ctx.globalAlpha = this._options.nodeOpacity;

    // Selection glow
    if (selected) {
      ctx.shadowColor = this._theme.selection.nodeColor;
      ctx.shadowBlur = 12 / zoom;
    } else if (hovered) {
      ctx.shadowColor = this._theme.hover.nodeColor;
      ctx.shadowBlur = 8 / zoom;
    }

    // Fill circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = (selected || hovered ? 2.5 : 1.5) / zoom;
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Pin indicator
    if (node.pinned) {
      ctx.fillStyle = borderColor;
      ctx.beginPath();
      ctx.arc(node.x + r * 0.6, node.y - r * 0.6, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    if (showLabel && node.label) {
      this._renderNodeLabel(ctx, node, style, r, zoom);
    }

    ctx.restore();
  }

  private _renderNodeLabel(
    ctx: CanvasRenderingContext2D,
    node: VisualNode,
    style: NodeTypeStyle,
    r: number,
    zoom: number,
  ): void {
    const fontSize = Math.max(7, this._theme.font.size) / zoom;
    if (fontSize * zoom < 5) return; // Don't render tiny labels

    ctx.font = `${this._theme.font.weight} ${fontSize}px ${this._theme.font.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;

    const label = node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label;
    const labelColor = node.labelColor ?? style.labelColor;

    // Draw text below node with a subtle background
    const ty = node.y + r + 3 / zoom;
    const metrics = ctx.measureText(label);
    const tw = metrics.width;
    const th = fontSize;
    const pad = 2 / zoom;

    ctx.fillStyle = hexToRgba(this._theme.background, 0.75);
    ctx.fillRect(node.x - tw / 2 - pad, ty - pad, tw + pad * 2, th + pad * 2);

    ctx.fillStyle = labelColor;
    ctx.fillText(label, node.x, ty);
  }

  // ─── Box Select ───────────────────────────────────────────────────────────────

  private _renderBoxSelect(ctx: CanvasRenderingContext2D): void {
    const rect = this._interaction.boxSelectRect;
    if (!rect) return;

    ctx.save();
    ctx.fillStyle = this._theme.selection.boxFill;
    ctx.strokeStyle = this._theme.selection.boxStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  // ─── Minimap ─────────────────────────────────────────────────────────────────

  private _renderMinimap(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
  ): void {
    const size = this._options.minimapSize;
    const padding = 12;
    const mx = canvasW - size - padding;
    const my = canvasH - size - padding;

    if (this._nodes.size === 0) return;

    // Compute world bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this._nodes.values()) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scale = Math.min(size / worldW, size / worldH) * 0.9;

    const offX = mx + (size - worldW * scale) / 2;
    const offY = my + (size - worldH * scale) / 2;

    ctx.save();

    // Background
    ctx.fillStyle = this._theme.minimap.background;
    ctx.strokeStyle = this._theme.minimap.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 6);
    ctx.fill();
    ctx.stroke();

    // Clip to minimap bounds
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 6);
    ctx.clip();

    // Render edges
    ctx.strokeStyle = this._theme.minimap.nodeColor;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.5;
    for (const edge of this._edges.values()) {
      const src = this._nodes.get(edge.source);
      const tgt = this._nodes.get(edge.target);
      if (!src || !tgt) continue;
      ctx.beginPath();
      ctx.moveTo(offX + (src.x - minX) * scale, offY + (src.y - minY) * scale);
      ctx.lineTo(offX + (tgt.x - minX) * scale, offY + (tgt.y - minY) * scale);
      ctx.stroke();
    }

    // Render nodes
    ctx.globalAlpha = 1;
    for (const node of this._nodes.values()) {
      const nx = offX + (node.x - minX) * scale;
      const ny = offY + (node.y - minY) * scale;
      const nr = Math.max(1.5, node.radius * scale);
      const style = getNodeStyle(this._theme, node.type);
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fillStyle = node.color ?? style.color;
      ctx.fill();
    }

    // Render viewport rectangle
    const visibleBounds = this._camera.getVisibleBounds();
    const vx = offX + (visibleBounds.minX - minX) * scale;
    const vy = offY + (visibleBounds.minY - minY) * scale;
    const vw = (visibleBounds.maxX - visibleBounds.minX) * scale;
    const vh = (visibleBounds.maxY - visibleBounds.minY) * scale;

    ctx.fillStyle = this._theme.minimap.viewportColor;
    ctx.strokeStyle = this._theme.selection.nodeColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
  }

  // ─── FPS Display ─────────────────────────────────────────────────────────────

  private _renderFPS(ctx: CanvasRenderingContext2D, canvasW: number): void {
    const text = `${this._fps.fps} FPS`;
    ctx.save();
    ctx.font = `bold 11px ${this._theme.font.family}`;
    ctx.fillStyle = 'rgba(100,200,100,0.8)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(text, canvasW - 8, 8);
    ctx.restore();
  }

  // ─── Fit View ─────────────────────────────────────────────────────────────────

  getBoundingBox(): BoundingBox | null {
    if (this._nodes.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this._nodes.values()) {
      const margin = n.radius;
      if (n.x - margin < minX) minX = n.x - margin;
      if (n.y - margin < minY) minY = n.y - margin;
      if (n.x + margin > maxX) maxX = n.x + margin;
      if (n.y + margin > maxY) maxY = n.y + margin;
    }
    return {
      x: minX, y: minY,
      width: maxX - minX, height: maxY - minY,
      minX, minY, maxX, maxY,
    };
  }

  fitView(animated: boolean = true): void {
    const bounds = this.getBoundingBox();
    if (!bounds) return;
    if (animated) {
      this._camera.animateFitBounds(bounds, 0.08, 400);
    } else {
      this._camera.fitBounds(bounds, 0.08);
    }
  }

  centerOnNode(nodeId: string, zoom?: number): void {
    const node = this._nodes.get(nodeId);
    if (!node) return;
    this._camera.animateToNode(node.x, node.y, zoom);
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  /**
   * Export the current graph as a PNG data URL.
   */
  exportPNG(scale: number = 2): string {
    const w = this._canvas.width / this._options.pixelRatio;
    const h = this._canvas.height / this._options.pixelRatio;

    const offscreen = document.createElement('canvas');
    offscreen.width = w * scale;
    offscreen.height = h * scale;

    const offCtx = offscreen.getContext('2d')!;
    offCtx.scale(scale, scale);

    // Temporarily render to offscreen
    const origCtx = this._ctx;
    (this as unknown as { _ctx: CanvasRenderingContext2D })._ctx = offCtx;
    this.render();
    (this as unknown as { _ctx: CanvasRenderingContext2D })._ctx = origCtx;

    return offscreen.toDataURL('image/png');
  }

  /**
   * Export the current visible graph as SVG.
   */
  exportSVG(): string {
    const w = this._canvas.width / this._options.pixelRatio;
    const h = this._canvas.height / this._options.pixelRatio;
    const lines: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
      `<rect width="${w}" height="${h}" fill="${this._theme.background}"/>`,
    ];

    const t = this._camera.getTransform();

    lines.push(
      `<g transform="matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})">`,
    );

    // Edges
    for (const edge of this._edges.values()) {
      const src = this._nodes.get(edge.source);
      const tgt = this._nodes.get(edge.target);
      if (!src || !tgt) continue;
      const style = getEdgeStyle(this._theme, edge.type);
      const color = edge.color ?? style.color;
      const width = edge.width ?? style.width;
      lines.push(
        `<line x1="${src.x}" y1="${src.y}" x2="${tgt.x}" y2="${tgt.y}" stroke="${color}" stroke-width="${width}" opacity="${this._options.edgeOpacity}"/>`,
      );
    }

    // Nodes
    for (const node of this._nodes.values()) {
      const style = getNodeStyle(this._theme, node.type);
      const color = node.color ?? style.color;
      const border = node.borderColor ?? style.borderColor;
      lines.push(
        `<circle cx="${node.x}" cy="${node.y}" r="${node.radius}" fill="${color}" stroke="${border}" stroke-width="1.5"/>`,
      );
      if (this._options.showLabels && node.label) {
        const labelColor = node.labelColor ?? style.labelColor;
        lines.push(
          `<text x="${node.x}" y="${node.y + node.radius + 14}" text-anchor="middle" font-family="${this._theme.font.family}" font-size="${this._theme.font.size}" fill="${labelColor}">${this._escapeXml(node.label)}</text>`,
        );
      }
    }

    lines.push('</g>');
    lines.push('</svg>');
    return lines.join('\n');
  }

  private _escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ─── Performance Metrics ─────────────────────────────────────────────────────

  getMetrics(): { fps: number; nodeCount: number; edgeCount: number } {
    return {
      fps: this._fps.fps,
      nodeCount: this._nodes.size,
      edgeCount: this._edges.size,
    };
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this._interaction.destroy();
    this._nodes.clear();
    this._edges.clear();
  }
}
