// Visual theme system for the Nexus graph visualization

import type { GraphTheme, NodeTypeStyle, EdgeTypeStyle } from './types.js';

// ─── Default Node Styles ──────────────────────────────────────────────────────

const defaultLightNode: NodeTypeStyle = {
  color: '#6366f1',
  borderColor: '#4f46e5',
  labelColor: '#1e1b4b',
  radius: 20,
};

const defaultDarkNode: NodeTypeStyle = {
  color: '#818cf8',
  borderColor: '#6366f1',
  labelColor: '#e0e7ff',
  radius: 20,
};

const defaultLightEdge: EdgeTypeStyle = {
  color: '#94a3b8',
  width: 1.5,
  dashed: false,
  arrowSize: 8,
};

const defaultDarkEdge: EdgeTypeStyle = {
  color: '#475569',
  width: 1.5,
  dashed: false,
  arrowSize: 8,
};

// ─── Light Theme ──────────────────────────────────────────────────────────────

export const lightTheme: GraphTheme = {
  name: 'light',
  background: '#f8fafc',
  defaultNode: defaultLightNode,
  defaultEdge: defaultLightEdge,
  nodeTypes: {
    concept: {
      color: '#6366f1',
      borderColor: '#4f46e5',
      labelColor: '#1e1b4b',
      radius: 22,
    },
    entity: {
      color: '#0ea5e9',
      borderColor: '#0284c7',
      labelColor: '#0c4a6e',
      radius: 20,
    },
    document: {
      color: '#f59e0b',
      borderColor: '#d97706',
      labelColor: '#78350f',
      radius: 18,
    },
    person: {
      color: '#10b981',
      borderColor: '#059669',
      labelColor: '#064e3b',
      radius: 20,
    },
    place: {
      color: '#ec4899',
      borderColor: '#db2777',
      labelColor: '#831843',
      radius: 20,
    },
    event: {
      color: '#ef4444',
      borderColor: '#dc2626',
      labelColor: '#7f1d1d',
      radius: 20,
    },
    tag: {
      color: '#8b5cf6',
      borderColor: '#7c3aed',
      labelColor: '#2e1065',
      radius: 14,
    },
    root: {
      color: '#1e293b',
      borderColor: '#0f172a',
      labelColor: '#f8fafc',
      radius: 28,
    },
  },
  edgeTypes: {
    related: {
      color: '#94a3b8',
      width: 1.5,
      dashed: false,
      arrowSize: 8,
    },
    contains: {
      color: '#64748b',
      width: 2,
      dashed: false,
      arrowSize: 10,
    },
    references: {
      color: '#cbd5e1',
      width: 1,
      dashed: true,
      dashPattern: [6, 3],
      arrowSize: 7,
    },
    parent: {
      color: '#475569',
      width: 2.5,
      dashed: false,
      arrowSize: 12,
    },
    tagged: {
      color: '#a855f7',
      width: 1,
      dashed: true,
      dashPattern: [4, 4],
      arrowSize: 6,
    },
  },
  selection: {
    nodeColor: '#f97316',
    edgeColor: '#fb923c',
    boxFill: 'rgba(249, 115, 22, 0.08)',
    boxStroke: '#f97316',
  },
  hover: {
    nodeColor: '#fbbf24',
    edgeColor: '#fcd34d',
    scale: 1.15,
  },
  minimap: {
    background: 'rgba(248, 250, 252, 0.9)',
    nodeColor: '#6366f1',
    viewportColor: 'rgba(99, 102, 241, 0.2)',
    border: '#e2e8f0',
  },
  font: {
    family: 'Inter, system-ui, sans-serif',
    size: 11,
    weight: '500',
  },
  grid: {
    color: 'rgba(148, 163, 184, 0.2)',
    spacing: 40,
    visible: false,
  },
};

// ─── Dark Theme ───────────────────────────────────────────────────────────────

export const darkTheme: GraphTheme = {
  name: 'dark',
  background: '#0f172a',
  defaultNode: defaultDarkNode,
  defaultEdge: defaultDarkEdge,
  nodeTypes: {
    concept: {
      color: '#818cf8',
      borderColor: '#6366f1',
      labelColor: '#e0e7ff',
      radius: 22,
    },
    entity: {
      color: '#38bdf8',
      borderColor: '#0ea5e9',
      labelColor: '#bae6fd',
      radius: 20,
    },
    document: {
      color: '#fbbf24',
      borderColor: '#f59e0b',
      labelColor: '#fef3c7',
      radius: 18,
    },
    person: {
      color: '#34d399',
      borderColor: '#10b981',
      labelColor: '#d1fae5',
      radius: 20,
    },
    place: {
      color: '#f472b6',
      borderColor: '#ec4899',
      labelColor: '#fce7f3',
      radius: 20,
    },
    event: {
      color: '#f87171',
      borderColor: '#ef4444',
      labelColor: '#fee2e2',
      radius: 20,
    },
    tag: {
      color: '#a78bfa',
      borderColor: '#8b5cf6',
      labelColor: '#ede9fe',
      radius: 14,
    },
    root: {
      color: '#f1f5f9',
      borderColor: '#e2e8f0',
      labelColor: '#0f172a',
      radius: 28,
    },
  },
  edgeTypes: {
    related: {
      color: '#475569',
      width: 1.5,
      dashed: false,
      arrowSize: 8,
    },
    contains: {
      color: '#64748b',
      width: 2,
      dashed: false,
      arrowSize: 10,
    },
    references: {
      color: '#334155',
      width: 1,
      dashed: true,
      dashPattern: [6, 3],
      arrowSize: 7,
    },
    parent: {
      color: '#94a3b8',
      width: 2.5,
      dashed: false,
      arrowSize: 12,
    },
    tagged: {
      color: '#7c3aed',
      width: 1,
      dashed: true,
      dashPattern: [4, 4],
      arrowSize: 6,
    },
  },
  selection: {
    nodeColor: '#fb923c',
    edgeColor: '#fdba74',
    boxFill: 'rgba(251, 146, 60, 0.1)',
    boxStroke: '#fb923c',
  },
  hover: {
    nodeColor: '#fcd34d',
    edgeColor: '#fde68a',
    scale: 1.15,
  },
  minimap: {
    background: 'rgba(15, 23, 42, 0.9)',
    nodeColor: '#818cf8',
    viewportColor: 'rgba(129, 140, 248, 0.25)',
    border: '#1e293b',
  },
  font: {
    family: 'Inter, system-ui, sans-serif',
    size: 11,
    weight: '500',
  },
  grid: {
    color: 'rgba(51, 65, 85, 0.4)',
    spacing: 40,
    visible: false,
  },
};

// ─── Theme Utilities ──────────────────────────────────────────────────────────

export function getNodeStyle(
  theme: GraphTheme,
  nodeType: string,
): NodeTypeStyle {
  return theme.nodeTypes[nodeType] ?? theme.defaultNode;
}

export function getEdgeStyle(
  theme: GraphTheme,
  edgeType: string,
): EdgeTypeStyle {
  return theme.edgeTypes[edgeType] ?? theme.defaultEdge;
}

/**
 * Create a custom theme by merging overrides into a base theme.
 */
export function createTheme(
  base: GraphTheme,
  overrides: Partial<GraphTheme>,
): GraphTheme {
  return {
    ...base,
    ...overrides,
    nodeTypes: { ...base.nodeTypes, ...(overrides.nodeTypes ?? {}) },
    edgeTypes: { ...base.edgeTypes, ...(overrides.edgeTypes ?? {}) },
    selection: { ...base.selection, ...(overrides.selection ?? {}) },
    hover: { ...base.hover, ...(overrides.hover ?? {}) },
    minimap: { ...base.minimap, ...(overrides.minimap ?? {}) },
    font: { ...base.font, ...(overrides.font ?? {}) },
    grid: { ...base.grid, ...(overrides.grid ?? {}) },
  };
}

/**
 * Parse hex color and return rgba string with given alpha.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Interpolate between two hex colors.
 */
export function interpolateColor(
  colorA: string,
  colorB: string,
  t: number,
): string {
  const parseHex = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parseHex(colorA);
  const [r2, g2, b2] = parseHex(colorB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
