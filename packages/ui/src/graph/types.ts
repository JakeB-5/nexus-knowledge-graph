// Core types for the Nexus graph visualization system

// ─── Node & Edge ──────────────────────────────────────────────────────────────

export interface VisualNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  type: string;
  color?: string;
  borderColor?: string;
  labelColor?: string;
  mass?: number;
  pinned?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: string;
  weight?: number;
  directed?: boolean;
  color?: string;
  width?: number;
  dashed?: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Viewport & Camera ────────────────────────────────────────────────────────

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  width: number;
  height: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Transform {
  a: number; // scale x
  b: number; // skew y
  c: number; // skew x
  d: number; // scale y
  e: number; // translate x
  f: number; // translate y
}

export interface Point {
  x: number;
  y: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface LayoutOptions {
  type: LayoutType;
  width: number;
  height: number;
  padding: number;
  // force-directed
  iterations?: number;
  springLength?: number;
  springStrength?: number;
  repulsionStrength?: number;
  gravity?: number;
  // hierarchical
  rankSeparation?: number;
  nodeSeparation?: number;
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  // radial
  centerNodeId?: string;
  levelSpacing?: number;
  // circular
  startAngle?: number;
  // grid
  columns?: number;
  cellWidth?: number;
  cellHeight?: number;
}

export type LayoutType =
  | 'force'
  | 'circular'
  | 'hierarchical'
  | 'grid'
  | 'radial';

export interface LayoutResult {
  nodes: Map<string, Point>;
  edges?: Map<string, Point[]>; // edge bend points
}

// ─── Render ───────────────────────────────────────────────────────────────────

export interface RenderOptions {
  antialias: boolean;
  showLabels: boolean;
  showEdgeLabels: boolean;
  showMinimap: boolean;
  showFPS: boolean;
  nodeOpacity: number;
  edgeOpacity: number;
  minimapSize: number;
  pixelRatio: number;
  curvedEdges: boolean;
  arrowSize: number;
}

// ─── Interaction Events ───────────────────────────────────────────────────────

export type GraphEventType =
  | 'node:click'
  | 'node:dblclick'
  | 'node:hover'
  | 'node:hoverend'
  | 'node:dragstart'
  | 'node:drag'
  | 'node:dragend'
  | 'edge:click'
  | 'edge:hover'
  | 'canvas:click'
  | 'canvas:pan'
  | 'canvas:zoom'
  | 'selection:change'
  | 'context:menu'
  | 'node:expand'
  | 'node:create';

export interface GraphEvent<T = unknown> {
  type: GraphEventType;
  payload: T;
  originalEvent?: MouseEvent | TouchEvent | KeyboardEvent | WheelEvent;
}

export interface NodeClickPayload {
  node: VisualNode;
  point: Point;
}

export interface EdgeClickPayload {
  edge: VisualEdge;
  point: Point;
}

export interface SelectionChangePayload {
  nodes: Set<string>;
  edges: Set<string>;
}

export interface ContextMenuPayload {
  point: Point;
  worldPoint: Point;
  nodeId?: string;
  edgeId?: string;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export interface NodeTypeStyle {
  color: string;
  borderColor: string;
  labelColor: string;
  radius: number;
  icon?: string;
}

export interface EdgeTypeStyle {
  color: string;
  width: number;
  dashed: boolean;
  dashPattern?: number[];
  arrowSize: number;
}

export interface GraphTheme {
  name: string;
  background: string;
  nodeTypes: Record<string, NodeTypeStyle>;
  edgeTypes: Record<string, EdgeTypeStyle>;
  defaultNode: NodeTypeStyle;
  defaultEdge: EdgeTypeStyle;
  selection: {
    nodeColor: string;
    edgeColor: string;
    boxFill: string;
    boxStroke: string;
  };
  hover: {
    nodeColor: string;
    edgeColor: string;
    scale: number;
  };
  minimap: {
    background: string;
    nodeColor: string;
    viewportColor: string;
    border: string;
  };
  font: {
    family: string;
    size: number;
    weight: string;
  };
  grid: {
    color: string;
    spacing: number;
    visible: boolean;
  };
}

// ─── Physics ──────────────────────────────────────────────────────────────────

export interface PhysicsOptions {
  springLength: number;
  springStrength: number;
  repulsionStrength: number;
  gravity: number;
  damping: number;
  maxVelocity: number;
  minEnergy: number;
  theta: number; // Barnes-Hut approximation threshold
  timeStep: number;
  collisionRadius?: number;
}

export interface PhysicsBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  mass: number;
  radius: number;
  pinned: boolean;
}
