import chalk from "chalk";

export type NodeType =
  | "document"
  | "concept"
  | "person"
  | "place"
  | "event"
  | "generic";

const TYPE_ICONS: Record<NodeType | string, string> = {
  document: "📄",
  concept: "💡",
  person: "👤",
  place: "📍",
  event: "📅",
  generic: "○",
};

export interface TreeNode {
  id: string;
  label: string;
  type?: string;
  children?: TreeNode[];
  collapsed?: boolean;
  meta?: string;
}

export interface TreeOptions {
  /** Show node type icons */
  showIcons?: boolean;
  /** Show metadata string next to label */
  showMeta?: boolean;
  /** Use compact (no blank lines between branches) mode */
  compact?: boolean;
  /** Maximum depth to render (-1 = unlimited) */
  maxDepth?: number;
  /** Color for branch lines */
  branchColor?: string;
  /** Color for leaf node labels */
  leafColor?: string;
  /** Color for inner node labels */
  innerColor?: string;
}

const DEFAULT_OPTIONS: Required<TreeOptions> = {
  showIcons: true,
  showMeta: true,
  compact: false,
  maxDepth: -1,
  branchColor: "#666666",
  leafColor: "#aaaaaa",
  innerColor: "#ffffff",
};

const BOX = {
  vertical: "│",
  tee: "├",
  corner: "└",
  horizontal: "─",
  space: " ",
};

function getIcon(type?: string): string {
  if (!type) return TYPE_ICONS["generic"] ?? "○";
  return TYPE_ICONS[type] ?? TYPE_ICONS["generic"] ?? "○";
}

function renderNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  depth: number,
  opts: Required<TreeOptions>,
): string[] {
  if (opts.maxDepth >= 0 && depth > opts.maxDepth) return [];

  const lines: string[] = [];
  const branchChar = isLast ? BOX.corner : BOX.tee;
  const branch = chalk.hex(opts.branchColor)(
    `${prefix}${branchChar}${BOX.horizontal}${BOX.horizontal} `,
  );

  const icon = opts.showIcons ? `${getIcon(node.type)} ` : "";
  const hasChildren = node.children && node.children.length > 0;
  const labelColor = hasChildren ? opts.innerColor : opts.leafColor;
  const label = chalk.hex(labelColor)(node.label);
  const meta =
    opts.showMeta && node.meta
      ? chalk.gray(` [${node.meta}]`)
      : "";
  const collapsed =
    node.collapsed && hasChildren ? chalk.gray(" (collapsed)") : "";
  const typeTag = node.type ? chalk.gray(` <${node.type}>`) : "";

  lines.push(`${branch}${icon}${label}${typeTag}${meta}${collapsed}`);

  if (!node.collapsed && hasChildren) {
    const childPrefix =
      prefix + chalk.hex(opts.branchColor)(isLast ? "   " : `${BOX.vertical}  `);
    const children = node.children!;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;
      const childIsLast = i === children.length - 1;
      const childLines = renderNode(child, childPrefix, childIsLast, depth + 1, opts);
      lines.push(...childLines);
    }
  }

  return lines;
}

export class TreeFormatter {
  private root: TreeNode;
  private opts: Required<TreeOptions>;

  constructor(root: TreeNode, options: TreeOptions = {}) {
    this.root = root;
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  render(): string {
    const lines: string[] = [];

    // Root node
    const icon = this.opts.showIcons ? `${getIcon(this.root.type)} ` : "";
    const meta =
      this.opts.showMeta && this.root.meta
        ? chalk.gray(` [${this.root.meta}]`)
        : "";
    const typeTag = this.root.type ? chalk.gray(` <${this.root.type}>`) : "";
    lines.push(
      `${icon}${chalk.bold.white(this.root.label)}${typeTag}${meta}`,
    );

    if (!this.root.collapsed && this.root.children) {
      const children = this.root.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) continue;
        const isLast = i === children.length - 1;
        const childLines = renderNode(child, "", isLast, 1, this.opts);
        lines.push(...childLines);
      }
    }

    return lines.join("\n");
  }

  print(): void {
    console.log(this.render());
  }

  /** Collapse all nodes beyond given depth */
  collapseAtDepth(maxDepth: number): void {
    collapseNodes(this.root, 0, maxDepth);
  }

  /** Expand all nodes */
  expandAll(): void {
    expandNodes(this.root);
  }
}

function collapseNodes(node: TreeNode, depth: number, maxDepth: number): void {
  if (depth >= maxDepth) {
    node.collapsed = true;
    return;
  }
  node.collapsed = false;
  for (const child of node.children ?? []) {
    collapseNodes(child, depth + 1, maxDepth);
  }
}

function expandNodes(node: TreeNode): void {
  node.collapsed = false;
  for (const child of node.children ?? []) {
    expandNodes(child);
  }
}

/**
 * Build a TreeNode from a flat list of edges/relationships.
 * sourceId → targetIds defines parent → children.
 */
export function buildTree(
  rootId: string,
  rootLabel: string,
  edges: Array<{ sourceId: string; targetId: string; type?: string }>,
  nodeLabels: Map<string, { label: string; type?: string }>,
  maxDepth = 5,
): TreeNode {
  const childrenMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!childrenMap.has(edge.sourceId)) childrenMap.set(edge.sourceId, []);
    childrenMap.get(edge.sourceId)!.push(edge.targetId);
  }

  function buildNode(id: string, depth: number, visited: Set<string>): TreeNode {
    const info = nodeLabels.get(id);
    const node: TreeNode = {
      id,
      label: info?.label ?? id.slice(0, 8),
      type: info?.type,
    };

    if (depth < maxDepth && !visited.has(id)) {
      const childIds = childrenMap.get(id) ?? [];
      if (childIds.length > 0) {
        const nextVisited = new Set(visited).add(id);
        node.children = childIds.map((childId) =>
          buildNode(childId, depth + 1, nextVisited),
        );
      }
    } else if (visited.has(id)) {
      node.meta = "cycle";
      node.collapsed = true;
    }

    return node;
  }

  const root = buildNode(rootId, 0, new Set());
  root.label = rootLabel;
  return root;
}

/**
 * Quick helper to print a tree from a root node
 */
export function printTree(root: TreeNode, options?: TreeOptions): void {
  new TreeFormatter(root, options).print();
}

/**
 * Render a path (linear list) as a vertical tree
 */
export function renderPath(
  nodes: Array<{ id: string; label: string; type?: string }>,
  options?: TreeOptions,
): string {
  if (nodes.length === 0) return chalk.gray("(empty path)");

  const root = nodes[0];
  if (!root) return chalk.gray("(empty path)");

  let current: TreeNode = {
    id: root.id,
    label: root.label,
    type: root.type,
    children: [],
  };
  const treeRoot = current;

  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    const child: TreeNode = {
      id: n.id,
      label: n.label,
      type: n.type,
      children: [],
    };
    current.children = [child];
    current = child;
  }

  return new TreeFormatter(treeRoot, options).render();
}
