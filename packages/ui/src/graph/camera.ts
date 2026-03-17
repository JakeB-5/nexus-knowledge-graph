// Viewport/camera system for the Nexus graph visualization

import type { Viewport, BoundingBox, Point, Transform } from './types.js';

// ─── Easing Functions ─────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

// ─── Animation State ──────────────────────────────────────────────────────────

interface AnimationState {
  startX: number;
  startY: number;
  startZoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  startTime: number;
  duration: number;
  easing: (t: number) => number;
  onComplete?: () => void;
}

// ─── Camera Class ─────────────────────────────────────────────────────────────

export class Camera {
  private _x: number = 0;
  private _y: number = 0;
  private _zoom: number = 1;
  private _rotation: number = 0;

  private _width: number;
  private _height: number;

  private _minZoom: number = 0.05;
  private _maxZoom: number = 10;

  private _animation: AnimationState | null = null;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get zoom(): number { return this._zoom; }
  get rotation(): number { return this._rotation; }
  get width(): number { return this._width; }
  get height(): number { return this._height; }

  get viewport(): Viewport {
    return {
      x: this._x,
      y: this._y,
      zoom: this._zoom,
      rotation: this._rotation,
      width: this._width,
      height: this._height,
    };
  }

  // ─── Resize ─────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  // ─── Transform Matrix ────────────────────────────────────────────────────────

  /**
   * Returns the current 2D transform for the canvas context.
   * The transform is: translate to center, zoom, rotate, then translate by camera offset.
   */
  getTransform(): Transform {
    const cos = Math.cos(this._rotation) * this._zoom;
    const sin = Math.sin(this._rotation) * this._zoom;
    return {
      a: cos,
      b: sin,
      c: -sin,
      d: cos,
      e: this._width / 2 + this._x * this._zoom,
      f: this._height / 2 + this._y * this._zoom,
    };
  }

  /**
   * Apply the transform to a canvas 2D context.
   */
  applyToContext(ctx: CanvasRenderingContext2D): void {
    const t = this.getTransform();
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  }

  // ─── Coordinate Conversion ───────────────────────────────────────────────────

  /**
   * Convert screen coordinates to world coordinates.
   */
  screenToWorld(screenX: number, screenY: number): Point {
    const dx = screenX - this._width / 2 - this._x * this._zoom;
    const dy = screenY - this._height / 2 - this._y * this._zoom;
    const cos = Math.cos(-this._rotation);
    const sin = Math.sin(-this._rotation);
    return {
      x: (dx * cos - dy * sin) / this._zoom,
      y: (dx * sin + dy * cos) / this._zoom,
    };
  }

  /**
   * Convert world coordinates to screen coordinates.
   */
  worldToScreen(worldX: number, worldY: number): Point {
    const cos = Math.cos(this._rotation);
    const sin = Math.sin(this._rotation);
    const rx = worldX * cos - worldY * sin;
    const ry = worldX * sin + worldY * cos;
    return {
      x: rx * this._zoom + this._x * this._zoom + this._width / 2,
      y: ry * this._zoom + this._y * this._zoom + this._height / 2,
    };
  }

  // ─── Pan & Zoom ──────────────────────────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this._animation = null;
    this._x += dx / this._zoom;
    this._y += dy / this._zoom;
  }

  /**
   * Zoom toward a specific screen point.
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    this._animation = null;
    const worldBefore = this.screenToWorld(screenX, screenY);
    this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, this._zoom * factor));
    const worldAfter = this.screenToWorld(screenX, screenY);
    this._x += worldAfter.x - worldBefore.x;
    this._y += worldAfter.y - worldBefore.y;
  }

  setZoom(zoom: number): void {
    this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
  }

  setPosition(x: number, y: number): void {
    this._x = x;
    this._y = y;
  }

  setZoomBounds(min: number, max: number): void {
    this._minZoom = min;
    this._maxZoom = max;
  }

  // ─── Fit to Bounds ───────────────────────────────────────────────────────────

  /**
   * Calculate zoom and position to fit a bounding box in the viewport.
   */
  fitBounds(bounds: BoundingBox, paddingFactor: number = 0.1): void {
    const pw = this._width * (1 - paddingFactor * 2);
    const ph = this._height * (1 - paddingFactor * 2);
    const zoom = Math.min(pw / bounds.width, ph / bounds.height);
    this._zoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
    this._x = -(bounds.x + bounds.width / 2);
    this._y = -(bounds.y + bounds.height / 2);
    this._animation = null;
  }

  /**
   * Smoothly animate to fit a bounding box.
   */
  animateFitBounds(
    bounds: BoundingBox,
    paddingFactor: number = 0.1,
    duration: number = 400,
    onComplete?: () => void,
  ): void {
    const pw = this._width * (1 - paddingFactor * 2);
    const ph = this._height * (1 - paddingFactor * 2);
    const zoom = Math.min(pw / bounds.width, ph / bounds.height);
    const targetZoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
    const targetX = -(bounds.x + bounds.width / 2);
    const targetY = -(bounds.y + bounds.height / 2);
    this._animateTo(targetX, targetY, targetZoom, duration, easeInOutCubic, onComplete);
  }

  /**
   * Smoothly animate to center on a world point with a specific zoom.
   */
  animateTo(
    worldX: number,
    worldY: number,
    zoom: number,
    duration: number = 300,
    onComplete?: () => void,
  ): void {
    const targetZoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
    this._animateTo(-worldX, -worldY, targetZoom, duration, easeOutQuart, onComplete);
  }

  /**
   * Animate to center a specific node.
   */
  animateToNode(
    nodeX: number,
    nodeY: number,
    zoom?: number,
    duration: number = 350,
  ): void {
    const targetZoom = zoom ?? Math.max(1, this._zoom);
    this._animateTo(-nodeX, -nodeY, targetZoom, duration, easeInOutCubic);
  }

  private _animateTo(
    x: number,
    y: number,
    zoom: number,
    duration: number,
    easing: (t: number) => number,
    onComplete?: () => void,
  ): void {
    this._animation = {
      startX: this._x,
      startY: this._y,
      startZoom: this._zoom,
      targetX: x,
      targetY: y,
      targetZoom: zoom,
      startTime: performance.now(),
      duration,
      easing,
      onComplete,
    };
  }

  // ─── Animation Tick ──────────────────────────────────────────────────────────

  /**
   * Call this each frame to advance animations. Returns true if animating.
   */
  tick(now: number): boolean {
    if (!this._animation) return false;

    const elapsed = now - this._animation.startTime;
    const rawT = Math.min(elapsed / this._animation.duration, 1);
    const t = this._animation.easing(rawT);

    this._x = this._animation.startX + (this._animation.targetX - this._animation.startX) * t;
    this._y = this._animation.startY + (this._animation.targetY - this._animation.startY) * t;
    this._zoom = this._animation.startZoom + (this._animation.targetZoom - this._animation.startZoom) * t;

    if (rawT >= 1) {
      this._x = this._animation.targetX;
      this._y = this._animation.targetY;
      this._zoom = this._animation.targetZoom;
      const cb = this._animation.onComplete;
      this._animation = null;
      cb?.();
      return false;
    }

    return true;
  }

  get isAnimating(): boolean {
    return this._animation !== null;
  }

  stopAnimation(): void {
    this._animation = null;
  }

  // ─── World Bounding Box ──────────────────────────────────────────────────────

  /**
   * Returns the visible world-space bounding box.
   */
  getVisibleBounds(): BoundingBox {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this._width, this._height);
    return {
      x: tl.x,
      y: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
      minX: tl.x,
      minY: tl.y,
      maxX: br.x,
      maxY: br.y,
    };
  }

  /**
   * Test whether a world-space point is visible.
   */
  isPointVisible(worldX: number, worldY: number, margin: number = 0): boolean {
    const s = this.worldToScreen(worldX, worldY);
    return (
      s.x >= -margin &&
      s.y >= -margin &&
      s.x <= this._width + margin &&
      s.y <= this._height + margin
    );
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────

  reset(): void {
    this._x = 0;
    this._y = 0;
    this._zoom = 1;
    this._rotation = 0;
    this._animation = null;
  }

  clone(): Camera {
    const c = new Camera(this._width, this._height);
    c._x = this._x;
    c._y = this._y;
    c._zoom = this._zoom;
    c._rotation = this._rotation;
    return c;
  }
}
