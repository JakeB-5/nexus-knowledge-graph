import { describe, it, expect } from "vitest";
import {
  Rectangle, Circle, LineSegment, Polygon,
  dist2D, dist3D, distPointToSegment, distPointToLine, boundingBox, QuadTree
} from "../geometry.js";

describe("Rectangle", () => {
  it("computes basic properties", () => {
    const r = new Rectangle(0, 0, 10, 5);
    expect(r.area).toBe(50);
    expect(r.perimeter).toBe(30);
    expect(r.centerX).toBe(5);
    expect(r.centerY).toBe(2.5);
    expect(r.right).toBe(10);
    expect(r.bottom).toBe(5);
  });

  it("contains point inside", () => {
    const r = new Rectangle(0, 0, 10, 10);
    expect(r.contains({ x: 5, y: 5 })).toBe(true);
    expect(r.contains({ x: 0, y: 0 })).toBe(true);
    expect(r.contains({ x: 10, y: 10 })).toBe(true);
    expect(r.contains({ x: 11, y: 5 })).toBe(false);
    expect(r.contains({ x: 5, y: -1 })).toBe(false);
  });

  it("intersects overlapping rectangles", () => {
    const a = new Rectangle(0, 0, 5, 5);
    const b = new Rectangle(3, 3, 5, 5);
    expect(a.intersects(b)).toBe(true);
  });

  it("does not intersect non-overlapping rectangles", () => {
    const a = new Rectangle(0, 0, 2, 2);
    const b = new Rectangle(5, 5, 2, 2);
    expect(a.intersects(b)).toBe(false);
  });

  it("union of two rectangles", () => {
    const a = new Rectangle(0, 0, 5, 5);
    const b = new Rectangle(3, 3, 5, 5);
    const u = a.union(b);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.right).toBe(8);
    expect(u.bottom).toBe(8);
  });

  it("intersection returns correct rect", () => {
    const a = new Rectangle(0, 0, 5, 5);
    const b = new Rectangle(3, 3, 5, 5);
    const i = a.intersection(b);
    expect(i).not.toBeNull();
    expect(i!.x).toBeCloseTo(3);
    expect(i!.width).toBeCloseTo(2);
  });

  it("intersection returns null for non-overlapping", () => {
    const a = new Rectangle(0, 0, 2, 2);
    const b = new Rectangle(5, 5, 2, 2);
    expect(a.intersection(b)).toBeNull();
  });
});

describe("Circle", () => {
  it("computes area and circumference", () => {
    const c = new Circle({ x: 0, y: 0 }, 5);
    expect(c.area).toBeCloseTo(Math.PI * 25);
    expect(c.circumference).toBeCloseTo(2 * Math.PI * 5);
  });

  it("contains point inside radius", () => {
    const c = new Circle({ x: 0, y: 0 }, 5);
    expect(c.contains({ x: 3, y: 4 })).toBe(true);   // exactly on boundary
    expect(c.contains({ x: 0, y: 0 })).toBe(true);
    expect(c.contains({ x: 6, y: 0 })).toBe(false);
  });

  it("intersects overlapping circles", () => {
    const a = new Circle({ x: 0, y: 0 }, 5);
    const b = new Circle({ x: 3, y: 0 }, 5);
    expect(a.intersects(b)).toBe(true);
  });

  it("does not intersect distant circles", () => {
    const a = new Circle({ x: 0, y: 0 }, 2);
    const b = new Circle({ x: 10, y: 0 }, 2);
    expect(a.intersects(b)).toBe(false);
  });

  it("bounding box contains circle", () => {
    const c = new Circle({ x: 2, y: 3 }, 4);
    const bb = c.boundingBox();
    expect(bb.x).toBeCloseTo(-2);
    expect(bb.y).toBeCloseTo(-1);
    expect(bb.width).toBeCloseTo(8);
  });
});

describe("LineSegment", () => {
  it("computes length", () => {
    const l = new LineSegment({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(l.length).toBeCloseTo(5);
  });

  it("computes midpoint", () => {
    const l = new LineSegment({ x: 0, y: 0 }, { x: 4, y: 6 });
    expect(l.midpoint).toEqual({ x: 2, y: 3 });
  });

  it("finds intersection of crossing segments", () => {
    const a = new LineSegment({ x: 0, y: 0 }, { x: 2, y: 2 });
    const b = new LineSegment({ x: 0, y: 2 }, { x: 2, y: 0 });
    const pt = a.intersection(b);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(1);
    expect(pt!.y).toBeCloseTo(1);
  });

  it("returns null for parallel segments", () => {
    const a = new LineSegment({ x: 0, y: 0 }, { x: 1, y: 0 });
    const b = new LineSegment({ x: 0, y: 1 }, { x: 1, y: 1 });
    expect(a.intersection(b)).toBeNull();
  });

  it("returns null for non-intersecting segments", () => {
    const a = new LineSegment({ x: 0, y: 0 }, { x: 1, y: 0 });
    const b = new LineSegment({ x: 5, y: 5 }, { x: 6, y: 5 });
    expect(a.intersection(b)).toBeNull();
  });

  it("point on segment at t", () => {
    const l = new LineSegment({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(l.pointAt(0.5)).toEqual({ x: 5, y: 0 });
  });
});

describe("Polygon", () => {
  const square = new Polygon([
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }
  ]);

  it("computes area of square", () => {
    expect(square.area()).toBeCloseTo(16);
  });

  it("computes perimeter of square", () => {
    expect(square.perimeter()).toBeCloseTo(16);
  });

  it("contains interior point", () => {
    expect(square.contains({ x: 2, y: 2 })).toBe(true);
  });

  it("does not contain exterior point", () => {
    expect(square.contains({ x: 5, y: 5 })).toBe(false);
  });

  it("convex hull of square is same square", () => {
    const hull = square.convexHull();
    expect(hull.vertices.length).toBe(4);
    expect(hull.area()).toBeCloseTo(16);
  });

  it("convex hull removes interior points", () => {
    const poly = new Polygon([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }
    ]);
    const hull = poly.convexHull();
    expect(hull.vertices.length).toBeLessThanOrEqual(5);
  });

  it("centroid of square is center", () => {
    const c = square.centroid();
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
  });

  it("throws with fewer than 3 vertices", () => {
    expect(() => new Polygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow();
  });
});

describe("distance utilities", () => {
  it("dist2D", () => {
    expect(dist2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it("dist3D", () => {
    expect(dist3D({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBeCloseTo(3);
  });

  it("distPointToSegment - point perpendicular to segment", () => {
    const d = distPointToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(5);
  });

  it("distPointToSegment - point past endpoint", () => {
    const d = distPointToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(5);
  });

  it("distPointToLine", () => {
    const d = distPointToLine({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(5);
  });

  it("boundingBox", () => {
    const pts = [{ x: 1, y: 2 }, { x: 5, y: 0 }, { x: 3, y: 8 }];
    const bb = boundingBox(pts);
    expect(bb.x).toBe(1);
    expect(bb.y).toBe(0);
    expect(bb.width).toBe(4);
    expect(bb.height).toBe(8);
  });
});

describe("QuadTree", () => {
  it("inserts and queries points in range", () => {
    const qt = new QuadTree<string>(new Rectangle(0, 0, 100, 100), 4);
    qt.insert({ x: 10, y: 10 }, "A");
    qt.insert({ x: 50, y: 50 }, "B");
    qt.insert({ x: 90, y: 90 }, "C");

    const results = qt.queryRange(new Rectangle(0, 0, 20, 20));
    expect(results.length).toBe(1);
    expect(results[0]!.data).toBe("A");
  });

  it("queries multiple results in range", () => {
    const qt = new QuadTree<number>(new Rectangle(0, 0, 100, 100), 4);
    for (let i = 0; i < 10; i++) qt.insert({ x: i * 5, y: 0 }, i);
    const results = qt.queryRange(new Rectangle(0, 0, 25, 10));
    expect(results.length).toBe(6); // x=0,5,10,15,20,25
  });

  it("finds nearest neighbor", () => {
    const qt = new QuadTree<string>(new Rectangle(0, 0, 100, 100), 4);
    qt.insert({ x: 10, y: 10 }, "near");
    qt.insert({ x: 90, y: 90 }, "far");
    qt.insert({ x: 50, y: 50 }, "mid");

    const result = qt.nearestNeighbor({ x: 12, y: 12 });
    expect(result).not.toBeNull();
    expect(result!.data).toBe("near");
  });

  it("returns null for empty quadtree", () => {
    const qt = new QuadTree<string>(new Rectangle(0, 0, 100, 100));
    expect(qt.nearestNeighbor({ x: 50, y: 50 })).toBeNull();
  });

  it("handles many insertions with subdivision", () => {
    const qt = new QuadTree<number>(new Rectangle(0, 0, 100, 100), 2);
    for (let i = 0; i < 50; i++) {
      qt.insert({ x: Math.random() * 100, y: Math.random() * 100 }, i);
    }
    const all = qt.queryRange(new Rectangle(0, 0, 100, 100));
    expect(all.length).toBe(50);
  });
});
