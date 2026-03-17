/**
 * 2D/3D geometry utilities: shapes, distances, spatial indexing.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

// --- Rectangle ---

export class Rectangle {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number
  ) {}

  get left(): number { return this.x; }
  get right(): number { return this.x + this.width; }
  get top(): number { return this.y; }
  get bottom(): number { return this.y + this.height; }
  get centerX(): number { return this.x + this.width / 2; }
  get centerY(): number { return this.y + this.height / 2; }
  get area(): number { return this.width * this.height; }
  get perimeter(): number { return 2 * (this.width + this.height); }

  contains(p: Point2D): boolean {
    return p.x >= this.left && p.x <= this.right && p.y >= this.top && p.y <= this.bottom;
  }

  intersects(other: Rectangle): boolean {
    return (
      this.left <= other.right &&
      this.right >= other.left &&
      this.top <= other.bottom &&
      this.bottom >= other.top
    );
  }

  union(other: Rectangle): Rectangle {
    const x = Math.min(this.left, other.left);
    const y = Math.min(this.top, other.top);
    const right = Math.max(this.right, other.right);
    const bottom = Math.max(this.bottom, other.bottom);
    return new Rectangle(x, y, right - x, bottom - y);
  }

  intersection(other: Rectangle): Rectangle | null {
    if (!this.intersects(other)) return null;
    const x = Math.max(this.left, other.left);
    const y = Math.max(this.top, other.top);
    const right = Math.min(this.right, other.right);
    const bottom = Math.min(this.bottom, other.bottom);
    return new Rectangle(x, y, right - x, bottom - y);
  }

  expand(amount: number): Rectangle {
    return new Rectangle(this.x - amount, this.y - amount, this.width + 2 * amount, this.height + 2 * amount);
  }
}

// --- Circle ---

export class Circle {
  constructor(public readonly center: Point2D, public readonly radius: number) {}

  get area(): number { return Math.PI * this.radius ** 2; }
  get circumference(): number { return 2 * Math.PI * this.radius; }

  contains(p: Point2D): boolean {
    return dist2D(p, this.center) <= this.radius;
  }

  intersects(other: Circle): boolean {
    return dist2D(this.center, other.center) <= this.radius + other.radius;
  }

  boundingBox(): Rectangle {
    return new Rectangle(
      this.center.x - this.radius,
      this.center.y - this.radius,
      this.radius * 2,
      this.radius * 2
    );
  }
}

// --- Line Segment ---

export class LineSegment {
  constructor(public readonly start: Point2D, public readonly end: Point2D) {}

  get length(): number {
    return dist2D(this.start, this.end);
  }

  get midpoint(): Point2D {
    return { x: (this.start.x + this.end.x) / 2, y: (this.start.y + this.end.y) / 2 };
  }

  /** Returns intersection point of two line segments, or null if none */
  intersection(other: LineSegment): Point2D | null {
    const { x: x1, y: y1 } = this.start;
    const { x: x2, y: y2 } = this.end;
    const { x: x3, y: y3 } = other.start;
    const { x: x4, y: y4 } = other.end;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-12) return null; // parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  /** Distance from point to this line segment */
  distanceToPoint(p: Point2D): number {
    return distPointToSegment(p, this.start, this.end);
  }

  /** Point on segment at parameter t in [0,1] */
  pointAt(t: number): Point2D {
    return {
      x: this.start.x + t * (this.end.x - this.start.x),
      y: this.start.y + t * (this.end.y - this.start.y),
    };
  }
}

// --- Polygon ---

export class Polygon {
  readonly vertices: Point2D[];

  constructor(vertices: Point2D[]) {
    if (vertices.length < 3) throw new Error("Polygon requires at least 3 vertices");
    this.vertices = [...vertices];
  }

  /** Shoelace formula */
  area(): number {
    const n = this.vertices.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const curr = this.vertices[i]!;
      const next = this.vertices[(i + 1) % n]!;
      sum += curr.x * next.y - next.x * curr.y;
    }
    return Math.abs(sum) / 2;
  }

  perimeter(): number {
    const n = this.vertices.length;
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += dist2D(this.vertices[i]!, this.vertices[(i + 1) % n]!);
    }
    return total;
  }

  /** Ray casting algorithm */
  contains(p: Point2D): boolean {
    const n = this.vertices.length;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = this.vertices[i]!;
      const vj = this.vertices[j]!;
      const intersects =
        vi.y > p.y !== vj.y > p.y &&
        p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /** Convex hull (Graham scan) */
  convexHull(): Polygon {
    const pts = [...this.vertices].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    const cross = (o: Point2D, a: Point2D, b: Point2D) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower: Point2D[] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper: Point2D[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]!;
      while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    upper.pop();
    lower.pop();
    return new Polygon([...lower, ...upper]);
  }

  centroid(): Point2D {
    const n = this.vertices.length;
    let cx = 0, cy = 0, area = 0;
    for (let i = 0; i < n; i++) {
      const curr = this.vertices[i]!;
      const next = this.vertices[(i + 1) % n]!;
      const cross = curr.x * next.y - next.x * curr.y;
      area += cross;
      cx += (curr.x + next.x) * cross;
      cy += (curr.y + next.y) * cross;
    }
    area /= 2;
    return { x: cx / (6 * area), y: cy / (6 * area) };
  }

  boundingBox(): Rectangle {
    return boundingBox(this.vertices);
  }
}

// --- Distance Utilities ---

export function dist2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function dist3D(a: Point3D, b: Point3D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

export function distPointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist2D(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist2D(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function distPointToLine(p: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return dist2D(p, lineStart);
  return Math.abs((p.x - lineStart.x) * dy - (p.y - lineStart.y) * dx) / len;
}

export function boundingBox(points: Point2D[]): Rectangle {
  if (points.length === 0) throw new Error("Cannot compute bounding box of empty points");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}

// --- QuadTree ---

interface QuadTreeNode<T> {
  bounds: Rectangle;
  items: Array<{ point: Point2D; data: T }>;
  children: [QuadTreeNode<T>, QuadTreeNode<T>, QuadTreeNode<T>, QuadTreeNode<T>] | null;
}

export class QuadTree<T> {
  private root: QuadTreeNode<T>;
  private readonly capacity: number;

  constructor(bounds: Rectangle, capacity = 4) {
    this.capacity = capacity;
    this.root = { bounds, items: [], children: null };
  }

  insert(point: Point2D, data: T): boolean {
    return this.insertIntoNode(this.root, point, data);
  }

  private insertIntoNode(node: QuadTreeNode<T>, point: Point2D, data: T): boolean {
    if (!node.bounds.contains(point)) return false;

    if (node.children === null) {
      if (node.items.length < this.capacity) {
        node.items.push({ point, data });
        return true;
      }
      this.subdivide(node);
    }

    for (const child of node.children!) {
      if (this.insertIntoNode(child, point, data)) return true;
    }
    return false;
  }

  private subdivide(node: QuadTreeNode<T>): void {
    const { x, y, width, height } = node.bounds;
    const hw = width / 2;
    const hh = height / 2;
    node.children = [
      { bounds: new Rectangle(x, y, hw, hh), items: [], children: null },
      { bounds: new Rectangle(x + hw, y, hw, hh), items: [], children: null },
      { bounds: new Rectangle(x, y + hh, hw, hh), items: [], children: null },
      { bounds: new Rectangle(x + hw, y + hh, hw, hh), items: [], children: null },
    ];
    for (const item of node.items) {
      for (const child of node.children) {
        if (this.insertIntoNode(child, item.point, item.data)) break;
      }
    }
    node.items = [];
  }

  queryRange(range: Rectangle): Array<{ point: Point2D; data: T }> {
    return this.queryNode(this.root, range);
  }

  private queryNode(node: QuadTreeNode<T>, range: Rectangle): Array<{ point: Point2D; data: T }> {
    if (!node.bounds.intersects(range)) return [];
    const found: Array<{ point: Point2D; data: T }> = [];
    for (const item of node.items) {
      if (range.contains(item.point)) found.push(item);
    }
    if (node.children) {
      for (const child of node.children) {
        found.push(...this.queryNode(child, range));
      }
    }
    return found;
  }

  nearestNeighbor(target: Point2D): { point: Point2D; data: T; distance: number } | null {
    let best: { point: Point2D; data: T; distance: number } | null = null;
    this.nearestInNode(this.root, target, best, (b) => { best = b; });
    return best;
  }

  private nearestInNode(
    node: QuadTreeNode<T>,
    target: Point2D,
    best: { point: Point2D; data: T; distance: number } | null,
    setBest: (b: { point: Point2D; data: T; distance: number }) => void
  ): void {
    // Check if this node can contain anything closer
    const { x, y, width, height } = node.bounds;
    const closestX = Math.max(x, Math.min(target.x, x + width));
    const closestY = Math.max(y, Math.min(target.y, y + height));
    const distToBox = dist2D(target, { x: closestX, y: closestY });
    if (best && distToBox >= best.distance) return;

    for (const item of node.items) {
      const d = dist2D(target, item.point);
      if (!best || d < best.distance) {
        setBest({ ...item, distance: d });
        best = { ...item, distance: d };
      }
    }

    if (node.children) {
      // Visit children sorted by distance to target
      const sorted = [...node.children].sort((a, b) => {
        const da = dist2D(target, { x: a.bounds.centerX, y: a.bounds.centerY });
        const db = dist2D(target, { x: b.bounds.centerX, y: b.bounds.centerY });
        return da - db;
      });
      for (const child of sorted) {
        this.nearestInNode(child, target, best, (b) => { setBest(b); best = b; });
      }
    }
  }
}
