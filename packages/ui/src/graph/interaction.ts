// User interaction handler for the Nexus graph visualization

import type {
  VisualNode,
  VisualEdge,
  Point,
  GraphEvent,
  GraphEventType,
  NodeClickPayload,
  EdgeClickPayload,
  SelectionChangePayload,
  ContextMenuPayload,
} from './types.js';
import type { Camera } from './camera.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventHandler<T = unknown> = (event: GraphEvent<T>) => void;

interface DragState {
  active: boolean;
  nodeId: string | null;
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  hasMoved: boolean;
}

interface PanState {
  active: boolean;
  lastX: number;
  lastY: number;
}

interface BoxSelectState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface PinchState {
  active: boolean;
  lastDistance: number;
  lastMidX: number;
  lastMidY: number;
}

export interface BoxSelectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Interaction Manager ──────────────────────────────────────────────────────

export class InteractionManager {
  private _canvas: HTMLCanvasElement;
  private _camera: Camera;

  private _nodes: Map<string, VisualNode> = new Map();
  private _edges: Map<string, VisualEdge> = new Map();

  private _selectedNodes: Set<string> = new Set();
  private _selectedEdges: Set<string> = new Set();
  private _hoveredNodeId: string | null = null;
  private _hoveredEdgeId: string | null = null;

  private _drag: DragState = {
    active: false, nodeId: null,
    startScreenX: 0, startScreenY: 0,
    startWorldX: 0, startWorldY: 0,
    hasMoved: false,
  };
  private _pan: PanState = { active: false, lastX: 0, lastY: 0 };
  private _boxSelect: BoxSelectState = {
    active: false, startX: 0, startY: 0, currentX: 0, currentY: 0,
  };
  private _pinch: PinchState = {
    active: false, lastDistance: 0, lastMidX: 0, lastMidY: 0,
  };

  private _handlers: Map<GraphEventType, EventHandler<unknown>[]> = new Map();

  private _lastClickTime: number = 0;
  private _lastClickNodeId: string | null = null;
  private _dblClickDelay: number = 300;

  private _keydownHandler: (e: KeyboardEvent) => void;
  private _wheelHandler: (e: WheelEvent) => void;
  private _mousedownHandler: (e: MouseEvent) => void;
  private _mousemoveHandler: (e: MouseEvent) => void;
  private _mouseupHandler: (e: MouseEvent) => void;
  private _contextmenuHandler: (e: MouseEvent) => void;
  private _touchstartHandler: (e: TouchEvent) => void;
  private _touchmoveHandler: (e: TouchEvent) => void;
  private _touchendHandler: (e: TouchEvent) => void;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this._canvas = canvas;
    this._camera = camera;

    this._keydownHandler = this._onKeydown.bind(this);
    this._wheelHandler = this._onWheel.bind(this);
    this._mousedownHandler = this._onMousedown.bind(this);
    this._mousemoveHandler = this._onMousemove.bind(this);
    this._mouseupHandler = this._onMouseup.bind(this);
    this._contextmenuHandler = this._onContextmenu.bind(this);
    this._touchstartHandler = this._onTouchstart.bind(this);
    this._touchmoveHandler = this._onTouchmove.bind(this);
    this._touchendHandler = this._onTouchend.bind(this);

    this._attach();
  }

  // ─── Graph Data ─────────────────────────────────────────────────────────────

  setNodes(nodes: VisualNode[]): void {
    this._nodes.clear();
    for (const n of nodes) this._nodes.set(n.id, n);
  }

  setEdges(edges: VisualEdge[]): void {
    this._edges.clear();
    for (const e of edges) this._edges.set(e.id, e);
  }

  updateNode(node: VisualNode): void {
    this._nodes.set(node.id, node);
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  get selectedNodes(): Set<string> { return this._selectedNodes; }
  get selectedEdges(): Set<string> { return this._selectedEdges; }
  get hoveredNodeId(): string | null { return this._hoveredNodeId; }
  get hoveredEdgeId(): string | null { return this._hoveredEdgeId; }

  selectNode(id: string, additive: boolean = false): void {
    if (!additive) {
      this._selectedNodes.clear();
      this._selectedEdges.clear();
    }
    this._selectedNodes.add(id);
    this._emitSelectionChange();
  }

  selectNodes(ids: string[], additive: boolean = false): void {
    if (!additive) {
      this._selectedNodes.clear();
      this._selectedEdges.clear();
    }
    for (const id of ids) this._selectedNodes.add(id);
    this._emitSelectionChange();
  }

  clearSelection(): void {
    this._selectedNodes.clear();
    this._selectedEdges.clear();
    this._emitSelectionChange();
  }

  selectAll(): void {
    for (const id of this._nodes.keys()) this._selectedNodes.add(id);
    for (const id of this._edges.keys()) this._selectedEdges.add(id);
    this._emitSelectionChange();
  }

  // ─── Box Select State ────────────────────────────────────────────────────────

  get boxSelectRect(): BoxSelectRect | null {
    if (!this._boxSelect.active) return null;
    const x = Math.min(this._boxSelect.startX, this._boxSelect.currentX);
    const y = Math.min(this._boxSelect.startY, this._boxSelect.currentY);
    const w = Math.abs(this._boxSelect.currentX - this._boxSelect.startX);
    const h = Math.abs(this._boxSelect.currentY - this._boxSelect.startY);
    return { x, y, width: w, height: h };
  }

  // ─── Event System ────────────────────────────────────────────────────────────

  on<T>(type: GraphEventType, handler: EventHandler<T>): void {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type)!.push(handler as EventHandler<unknown>);
  }

  off<T>(type: GraphEventType, handler: EventHandler<T>): void {
    const list = this._handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler as EventHandler<unknown>);
    if (idx >= 0) list.splice(idx, 1);
  }

  private _emit<T>(type: GraphEventType, payload: T, originalEvent?: Event): void {
    const handlers = this._handlers.get(type);
    if (!handlers) return;
    const event: GraphEvent<T> = {
      type,
      payload,
      originalEvent: originalEvent as MouseEvent | TouchEvent | KeyboardEvent | WheelEvent,
    };
    for (const h of handlers) h(event as GraphEvent<unknown>);
  }

  private _emitSelectionChange(): void {
    this._emit<SelectionChangePayload>('selection:change', {
      nodes: new Set(this._selectedNodes),
      edges: new Set(this._selectedEdges),
    });
  }

  // ─── Hit Testing ─────────────────────────────────────────────────────────────

  private _hitTestNode(worldX: number, worldY: number): string | null {
    // Test in reverse order (top-most rendered last)
    const ids = Array.from(this._nodes.keys()).reverse();
    for (const id of ids) {
      const n = this._nodes.get(id)!;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius) return id;
    }
    return null;
  }

  private _hitTestEdge(worldX: number, worldY: number): string | null {
    const threshold = 6;
    for (const [id, edge] of this._edges) {
      const src = this._nodes.get(edge.source);
      const tgt = this._nodes.get(edge.target);
      if (!src || !tgt) continue;

      const dist = this._pointToSegmentDist(
        worldX, worldY,
        src.x, src.y,
        tgt.x, tgt.y,
      );
      if (dist <= threshold) return id;
    }
    return null;
  }

  private _pointToSegmentDist(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  private _nodesInRect(screenRect: BoxSelectRect): string[] {
    const result: string[] = [];
    for (const [id, node] of this._nodes) {
      const s = this._camera.worldToScreen(node.x, node.y);
      if (
        s.x >= screenRect.x && s.x <= screenRect.x + screenRect.width &&
        s.y >= screenRect.y && s.y <= screenRect.y + screenRect.height
      ) {
        result.push(id);
      }
    }
    return result;
  }

  // ─── Canvas Event Attachment ──────────────────────────────────────────────────

  private _attach(): void {
    this._canvas.addEventListener('wheel', this._wheelHandler, { passive: false });
    this._canvas.addEventListener('mousedown', this._mousedownHandler);
    window.addEventListener('mousemove', this._mousemoveHandler);
    window.addEventListener('mouseup', this._mouseupHandler);
    this._canvas.addEventListener('contextmenu', this._contextmenuHandler);
    this._canvas.addEventListener('touchstart', this._touchstartHandler, { passive: false });
    this._canvas.addEventListener('touchmove', this._touchmoveHandler, { passive: false });
    this._canvas.addEventListener('touchend', this._touchendHandler);
    window.addEventListener('keydown', this._keydownHandler);
  }

  destroy(): void {
    this._canvas.removeEventListener('wheel', this._wheelHandler);
    this._canvas.removeEventListener('mousedown', this._mousedownHandler);
    window.removeEventListener('mousemove', this._mousemoveHandler);
    window.removeEventListener('mouseup', this._mouseupHandler);
    this._canvas.removeEventListener('contextmenu', this._contextmenuHandler);
    this._canvas.removeEventListener('touchstart', this._touchstartHandler);
    this._canvas.removeEventListener('touchmove', this._touchmoveHandler);
    this._canvas.removeEventListener('touchend', this._touchendHandler);
    window.removeEventListener('keydown', this._keydownHandler);
    this._handlers.clear();
  }

  // ─── Mouse Events ────────────────────────────────────────────────────────────

  private _canvasPoint(e: MouseEvent): Point {
    const rect = this._canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _onMousedown(e: MouseEvent): void {
    if (e.button === 2) return; // handled by contextmenu
    const screen = this._canvasPoint(e);
    const world = this._camera.screenToWorld(screen.x, screen.y);
    const nodeId = this._hitTestNode(world.x, world.y);

    if (nodeId) {
      const node = this._nodes.get(nodeId)!;
      this._drag = {
        active: true,
        nodeId,
        startScreenX: screen.x,
        startScreenY: screen.y,
        startWorldX: node.x,
        startWorldY: node.y,
        hasMoved: false,
      };
      this._canvas.style.cursor = 'grabbing';
      this._emit<NodeClickPayload>('node:dragstart', { node, point: world }, e);
    } else {
      // Start box select if shift held, otherwise pan
      if (e.shiftKey) {
        this._boxSelect = {
          active: true,
          startX: screen.x,
          startY: screen.y,
          currentX: screen.x,
          currentY: screen.y,
        };
      } else {
        this._pan = { active: true, lastX: screen.x, lastY: screen.y };
        this._canvas.style.cursor = 'grabbing';
      }
    }
  }

  private _onMousemove(e: MouseEvent): void {
    const screen = this._canvasPoint(e);
    const world = this._camera.screenToWorld(screen.x, screen.y);

    if (this._drag.active && this._drag.nodeId) {
      const dx = screen.x - this._drag.startScreenX;
      const dy = screen.y - this._drag.startScreenY;
      if (!this._drag.hasMoved && Math.sqrt(dx * dx + dy * dy) > 3) {
        this._drag.hasMoved = true;
      }
      const node = this._nodes.get(this._drag.nodeId);
      if (node) {
        const newPos = this._camera.screenToWorld(screen.x, screen.y);
        node.x = newPos.x;
        node.y = newPos.y;
        this._emit<NodeClickPayload>('node:drag', { node, point: newPos }, e);
      }
      return;
    }

    if (this._pan.active) {
      const dx = screen.x - this._pan.lastX;
      const dy = screen.y - this._pan.lastY;
      this._camera.pan(dx, dy);
      this._pan.lastX = screen.x;
      this._pan.lastY = screen.y;
      this._emit<Point>('canvas:pan', { x: dx, y: dy }, e);
      return;
    }

    if (this._boxSelect.active) {
      this._boxSelect.currentX = screen.x;
      this._boxSelect.currentY = screen.y;
      return;
    }

    // Hover detection
    const newHoveredNode = this._hitTestNode(world.x, world.y);
    if (newHoveredNode !== this._hoveredNodeId) {
      if (this._hoveredNodeId) {
        const old = this._nodes.get(this._hoveredNodeId);
        if (old) this._emit<NodeClickPayload>('node:hoverend', { node: old, point: world }, e);
      }
      this._hoveredNodeId = newHoveredNode;
      if (newHoveredNode) {
        const node = this._nodes.get(newHoveredNode)!;
        this._emit<NodeClickPayload>('node:hover', { node, point: world }, e);
        this._canvas.style.cursor = 'pointer';
      } else {
        const newHoveredEdge = this._hitTestEdge(world.x, world.y);
        this._hoveredEdgeId = newHoveredEdge;
        this._canvas.style.cursor = newHoveredEdge ? 'pointer' : 'default';
      }
    }
  }

  private _onMouseup(e: MouseEvent): void {
    const screen = this._canvasPoint(e);
    const world = this._camera.screenToWorld(screen.x, screen.y);

    if (this._drag.active && this._drag.nodeId) {
      const node = this._nodes.get(this._drag.nodeId);
      if (node) {
        if (!this._drag.hasMoved) {
          // It was a click
          this._handleNodeClick(node, world, e);
        } else {
          this._emit<NodeClickPayload>('node:dragend', { node, point: world }, e);
        }
      }
      this._drag = {
        active: false, nodeId: null,
        startScreenX: 0, startScreenY: 0,
        startWorldX: 0, startWorldY: 0,
        hasMoved: false,
      };
      this._canvas.style.cursor = 'default';
      return;
    }

    if (this._pan.active) {
      this._pan.active = false;
      this._canvas.style.cursor = 'default';
      return;
    }

    if (this._boxSelect.active) {
      this._boxSelect.active = false;
      const rect = this.boxSelectRect;
      if (rect && (rect.width > 5 || rect.height > 5)) {
        const ids = this._nodesInRect(rect);
        this.selectNodes(ids, e.shiftKey);
      } else {
        // Click on empty space
        this.clearSelection();
        this._emit<Point>('canvas:click', world, e);
      }
      return;
    }

    // Click on empty space
    const nodeId = this._hitTestNode(world.x, world.y);
    if (!nodeId) {
      const edgeId = this._hitTestEdge(world.x, world.y);
      if (edgeId) {
        const edge = this._edges.get(edgeId)!;
        if (!e.shiftKey) {
          this._selectedEdges.clear();
          this._selectedNodes.clear();
        }
        this._selectedEdges.add(edgeId);
        this._emitSelectionChange();
        this._emit<EdgeClickPayload>('edge:click', { edge, point: world }, e);
      } else {
        if (!e.shiftKey) this.clearSelection();
        this._emit<Point>('canvas:click', world, e);
      }
    }
  }

  private _handleNodeClick(node: VisualNode, world: Point, e: MouseEvent): void {
    const now = Date.now();
    const isDblClick =
      now - this._lastClickTime < this._dblClickDelay &&
      this._lastClickNodeId === node.id;

    if (isDblClick) {
      this._emit<NodeClickPayload>('node:dblclick', { node, point: world }, e);
      this._lastClickTime = 0;
      this._lastClickNodeId = null;
      // Emit expand event
      this._emit<NodeClickPayload>('node:expand', { node, point: world }, e);
    } else {
      this._lastClickTime = now;
      this._lastClickNodeId = node.id;

      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (this._selectedNodes.has(node.id)) {
          this._selectedNodes.delete(node.id);
        } else {
          this._selectedNodes.add(node.id);
        }
      } else {
        this._selectedNodes.clear();
        this._selectedEdges.clear();
        this._selectedNodes.add(node.id);
      }
      this._emitSelectionChange();
      this._emit<NodeClickPayload>('node:click', { node, point: world }, e);
    }
  }

  private _onContextmenu(e: MouseEvent): void {
    e.preventDefault();
    const screen = this._canvasPoint(e);
    const world = this._camera.screenToWorld(screen.x, screen.y);
    const nodeId = this._hitTestNode(world.x, world.y) ?? undefined;
    const edgeId = nodeId ? undefined : (this._hitTestEdge(world.x, world.y) ?? undefined);

    this._emit<ContextMenuPayload>('context:menu', {
      point: screen,
      worldPoint: world,
      nodeId,
      edgeId,
    }, e);
  }

  // ─── Wheel (Zoom) ────────────────────────────────────────────────────────────

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const screen = this._canvasPoint(e);
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this._camera.zoomAt(delta, screen.x, screen.y);
    this._emit<number>('canvas:zoom', this._camera.zoom, e);
  }

  // ─── Touch Events ─────────────────────────────────────────────────────────────

  private _touchPoint(touch: Touch): Point {
    const rect = this._canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  private _touchDistance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private _touchMid(t1: Touch, t2: Touch): Point {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top,
    };
  }

  private _onTouchstart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1) {
      const p = this._touchPoint(e.touches[0]);
      const world = this._camera.screenToWorld(p.x, p.y);
      const nodeId = this._hitTestNode(world.x, world.y);
      if (nodeId) {
        const node = this._nodes.get(nodeId)!;
        this._drag = {
          active: true, nodeId,
          startScreenX: p.x, startScreenY: p.y,
          startWorldX: node.x, startWorldY: node.y,
          hasMoved: false,
        };
      } else {
        this._pan = { active: true, lastX: p.x, lastY: p.y };
      }
    } else if (e.touches.length === 2) {
      this._drag.active = false;
      this._pan.active = false;
      const dist = this._touchDistance(e.touches[0], e.touches[1]);
      const mid = this._touchMid(e.touches[0], e.touches[1]);
      this._pinch = { active: true, lastDistance: dist, lastMidX: mid.x, lastMidY: mid.y };
    }
  }

  private _onTouchmove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1 && !this._pinch.active) {
      const p = this._touchPoint(e.touches[0]);
      if (this._drag.active && this._drag.nodeId) {
        this._drag.hasMoved = true;
        const world = this._camera.screenToWorld(p.x, p.y);
        const node = this._nodes.get(this._drag.nodeId);
        if (node) {
          node.x = world.x;
          node.y = world.y;
          this._emit<NodeClickPayload>('node:drag', { node, point: world }, e);
        }
      } else if (this._pan.active) {
        const dx = p.x - this._pan.lastX;
        const dy = p.y - this._pan.lastY;
        this._camera.pan(dx, dy);
        this._pan.lastX = p.x;
        this._pan.lastY = p.y;
      }
    } else if (e.touches.length === 2 && this._pinch.active) {
      const dist = this._touchDistance(e.touches[0], e.touches[1]);
      const mid = this._touchMid(e.touches[0], e.touches[1]);
      const factor = dist / this._pinch.lastDistance;
      this._camera.zoomAt(factor, mid.x, mid.y);
      // Pan by mid point delta
      this._camera.pan(mid.x - this._pinch.lastMidX, mid.y - this._pinch.lastMidY);
      this._pinch.lastDistance = dist;
      this._pinch.lastMidX = mid.x;
      this._pinch.lastMidY = mid.y;
      this._emit<number>('canvas:zoom', this._camera.zoom, e);
    }
  }

  private _onTouchend(e: TouchEvent): void {
    if (e.touches.length === 0) {
      this._pinch.active = false;
      if (this._drag.active && this._drag.nodeId && !this._drag.hasMoved) {
        const node = this._nodes.get(this._drag.nodeId);
        if (node) {
          this._selectedNodes.clear();
          this._selectedNodes.add(node.id);
          this._emitSelectionChange();
          const world = { x: node.x, y: node.y };
          this._emit<NodeClickPayload>('node:click', { node, point: world }, e);
        }
      }
      this._drag.active = false;
      this._pan.active = false;
    } else if (e.touches.length === 1) {
      this._pinch.active = false;
      const p = this._touchPoint(e.touches[0]);
      this._pan = { active: true, lastX: p.x, lastY: p.y };
    }
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

  private _onKeydown(e: KeyboardEvent): void {
    // Don't intercept when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        // Emit delete for selected nodes (caller handles actual removal)
        for (const id of this._selectedNodes) {
          const node = this._nodes.get(id);
          if (node) this._emit<NodeClickPayload>('node:dragend', { node, point: { x: node.x, y: node.y } }, e);
        }
        break;

      case 'a':
      case 'A':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          this.selectAll();
        }
        break;

      case 'Escape':
        this.clearSelection();
        this._drag.active = false;
        this._pan.active = false;
        this._boxSelect.active = false;
        break;

      case 'f':
      case 'F':
        // Fit view — emit as canvas event, renderer handles it
        this._emit<null>('canvas:zoom', null, e);
        break;

      case '+':
      case '=':
        this._camera.zoomAt(1.2, this._camera.width / 2, this._camera.height / 2);
        break;

      case '-':
        this._camera.zoomAt(1 / 1.2, this._camera.width / 2, this._camera.height / 2);
        break;

      case '0':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          this._camera.reset();
        }
        break;
    }
  }
}
