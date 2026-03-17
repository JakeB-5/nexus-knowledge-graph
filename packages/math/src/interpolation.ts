/**
 * Interpolation and easing functions.
 */

// --- Linear Interpolation ---

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// --- Bilinear Interpolation ---

/** Interpolates within a 2D grid. q00=bottom-left, q10=bottom-right, q01=top-left, q11=top-right */
export function bilinearLerp(
  q00: number,
  q10: number,
  q01: number,
  q11: number,
  tx: number,
  ty: number
): number {
  return lerp(lerp(q00, q10, tx), lerp(q01, q11, tx), ty);
}

// --- Cubic Interpolation (Catmull-Rom style coefficients) ---

/** Cubic interpolation between p1 and p2 using p0 and p3 as tangent controls */
export function cubicInterp(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const a0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const a1 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const a2 = -0.5 * p0 + 0.5 * p2;
  const a3 = p1;
  return a0 * t ** 3 + a1 * t ** 2 + a2 * t + a3;
}

// --- Bezier Curves ---

export interface Point2D {
  x: number;
  y: number;
}

/** Quadratic Bezier: p0, p1 (control), p2 (end) */
export function quadraticBezier(p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** Cubic Bezier: p0, p1, p2 (controls), p3 (end) */
export function cubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/** Evaluate a cubic bezier curve at n points, returning an array */
export function sampleCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  n: number
): Point2D[] {
  return Array.from({ length: n }, (_, i) => cubicBezier(p0, p1, p2, p3, i / (n - 1)));
}

// --- Catmull-Rom Spline ---

/** Evaluate a Catmull-Rom spline through the given control points at parameter t (0=start, 1=end) */
export function catmullRom(points: Point2D[], t: number): Point2D {
  if (points.length < 2) throw new Error("Need at least 2 points for Catmull-Rom");
  const n = points.length;
  const segment = Math.min(Math.floor(t * (n - 1)), n - 2);
  const localT = t * (n - 1) - segment;

  const p0 = points[Math.max(0, segment - 1)]!;
  const p1 = points[segment]!;
  const p2 = points[Math.min(n - 1, segment + 1)]!;
  const p3 = points[Math.min(n - 1, segment + 2)]!;

  return {
    x: cubicInterp(p0.x, p1.x, p2.x, p3.x, localT),
    y: cubicInterp(p0.y, p1.y, p2.y, p3.y, localT),
  };
}

// --- Easing Functions ---

type EasingFn = (t: number) => number;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export const Easing = {
  linear: (t: number): number => clamp01(t),

  easeInQuad: (t: number): number => { t = clamp01(t); return t * t; },
  easeOutQuad: (t: number): number => { t = clamp01(t); return t * (2 - t); },
  easeInOutQuad: (t: number): number => {
    t = clamp01(t);
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },

  easeInCubic: (t: number): number => { t = clamp01(t); return t ** 3; },
  easeOutCubic: (t: number): number => { t = clamp01(t); return 1 - (1 - t) ** 3; },
  easeInOutCubic: (t: number): number => {
    t = clamp01(t);
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  },

  easeInQuart: (t: number): number => { t = clamp01(t); return t ** 4; },
  easeOutQuart: (t: number): number => { t = clamp01(t); return 1 - (1 - t) ** 4; },
  easeInOutQuart: (t: number): number => {
    t = clamp01(t);
    return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
  },

  easeInSine: (t: number): number => { t = clamp01(t); return 1 - Math.cos((t * Math.PI) / 2); },
  easeOutSine: (t: number): number => { t = clamp01(t); return Math.sin((t * Math.PI) / 2); },
  easeInOutSine: (t: number): number => { t = clamp01(t); return -(Math.cos(Math.PI * t) - 1) / 2; },

  easeInExpo: (t: number): number => { t = clamp01(t); return t === 0 ? 0 : 2 ** (10 * t - 10); },
  easeOutExpo: (t: number): number => { t = clamp01(t); return t === 1 ? 1 : 1 - 2 ** (-10 * t); },
  easeInOutExpo: (t: number): number => {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  },

  easeInElastic: (t: number): number => {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t: number): number => {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t: number): number => {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c5 = (2 * Math.PI) / 4.5;
    return t < 0.5
      ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  easeInBounce: (t: number): number => 1 - Easing.easeOutBounce(1 - clamp01(t)),
  easeOutBounce: (t: number): number => {
    t = clamp01(t);
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t: number): number => {
    t = clamp01(t);
    return t < 0.5
      ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2
      : (1 + Easing.easeOutBounce(2 * t - 1)) / 2;
  },
} as const satisfies Record<string, EasingFn>;

/** Apply an easing function to a lerp */
export function easedLerp(a: number, b: number, t: number, easingFn: EasingFn): number {
  return lerp(a, b, easingFn(t));
}

/** Smooth step (Ken Perlin) */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Smoother step (Perlin improved) */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
