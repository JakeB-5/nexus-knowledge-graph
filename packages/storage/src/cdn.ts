/**
 * CDN URL builder with transform parameters, cache-busting, and fallback origins.
 */

import crypto from 'node:crypto';

export interface CDNTransformOptions {
  /** Target width in pixels */
  width?: number;
  /** Target height in pixels */
  height?: number;
  /** Resize/crop mode */
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  /** Output format */
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  /** JPEG/WebP quality (1-100) */
  quality?: number;
  /** Whether to strip metadata */
  strip?: boolean;
}

export interface CDNOrigin {
  url: string;
  /** Optional weight for load balancing (higher = more traffic) */
  weight?: number;
  /** Whether this origin is a fallback (used only when primary fails) */
  fallback?: boolean;
}

export interface CDNConfig {
  origins: CDNOrigin[];
  /** Path prefix added to all keys, e.g. "/assets" */
  pathPrefix?: string;
  /** Whether to add content-hash-based cache-busting params */
  cacheBusting?: boolean;
  /** Default transform applied to all URLs unless overridden */
  defaultTransform?: CDNTransformOptions;
}

export class CDNUrlBuilder {
  private readonly config: CDNConfig;
  private readonly primaryOrigins: CDNOrigin[];
  private readonly fallbackOrigins: CDNOrigin[];

  constructor(config: CDNConfig) {
    this.config = config;
    this.primaryOrigins = config.origins.filter((o) => !o.fallback);
    this.fallbackOrigins = config.origins.filter((o) => o.fallback);

    if (this.primaryOrigins.length === 0 && config.origins.length > 0) {
      // If all origins are marked fallback, treat them all as primary
      this.primaryOrigins.push(...config.origins);
    }
  }

  /**
   * Build a CDN URL for the given storage key.
   */
  buildUrl(
    key: string,
    transform?: CDNTransformOptions,
    options: { contentHash?: string; originIndex?: number } = {},
  ): string {
    const origin = this.selectOrigin(options.originIndex);
    const base = origin.url.replace(/\/$/, '');
    const prefix = this.config.pathPrefix ? `/${this.config.pathPrefix.replace(/^\//, '')}` : '';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const path = `${base}${prefix}/${encodedKey}`;

    const mergedTransform = { ...this.config.defaultTransform, ...transform };
    const params = this.buildTransformParams(mergedTransform);

    if (this.config.cacheBusting && options.contentHash) {
      params.set('v', options.contentHash.slice(0, 8));
    }

    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  /**
   * Build a URL for all origins (primary + fallbacks), in priority order.
   * Useful for generating <source> sets or retry chains.
   */
  buildFallbackChain(
    key: string,
    transform?: CDNTransformOptions,
    contentHash?: string,
  ): string[] {
    const allOrigins = [...this.primaryOrigins, ...this.fallbackOrigins];
    return allOrigins.map((_, idx) =>
      this.buildUrl(key, transform, { contentHash, originIndex: idx }),
    );
  }

  /**
   * Generate a cache-busting hash from content bytes.
   */
  computeContentHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Build a responsive image srcset string.
   * widths: array of pixel widths to generate, e.g. [320, 640, 1280]
   */
  buildSrcSet(
    key: string,
    widths: number[],
    baseTransform: Omit<CDNTransformOptions, 'width'> = {},
    contentHash?: string,
  ): string {
    return widths
      .map((w) => {
        const url = this.buildUrl(key, { ...baseTransform, width: w }, { contentHash });
        return `${url} ${w}w`;
      })
      .join(', ');
  }

  /**
   * Build transform query parameters from options.
   */
  private buildTransformParams(transform: CDNTransformOptions): URLSearchParams {
    const params = new URLSearchParams();

    if (transform.width !== undefined) params.set('w', String(transform.width));
    if (transform.height !== undefined) params.set('h', String(transform.height));
    if (transform.fit) params.set('fit', transform.fit);
    if (transform.format) params.set('fm', transform.format);
    if (transform.quality !== undefined) params.set('q', String(transform.quality));
    if (transform.strip) params.set('strip', '1');

    return params;
  }

  /**
   * Select an origin by index, or use weighted random selection.
   */
  private selectOrigin(index?: number): CDNOrigin {
    const origins = this.primaryOrigins;
    if (origins.length === 0) {
      throw new Error('CDNUrlBuilder: no origins configured');
    }

    if (index !== undefined) {
      const allOrigins = [...this.primaryOrigins, ...this.fallbackOrigins];
      return allOrigins[index % allOrigins.length] ?? origins[0]!;
    }

    // Weighted random selection
    const totalWeight = origins.reduce((sum, o) => sum + (o.weight ?? 1), 0);
    let rand = Math.random() * totalWeight;
    for (const origin of origins) {
      rand -= origin.weight ?? 1;
      if (rand <= 0) return origin;
    }
    return origins[origins.length - 1]!;
  }

  /**
   * Return a URL pointing to the first fallback origin.
   */
  buildFallbackUrl(key: string, transform?: CDNTransformOptions): string | null {
    if (this.fallbackOrigins.length === 0) return null;
    const totalPrimary = this.primaryOrigins.length;
    return this.buildUrl(key, transform, { originIndex: totalPrimary });
  }

  /** Return configured origins summary */
  getOriginsSummary(): { primary: string[]; fallback: string[] } {
    return {
      primary: this.primaryOrigins.map((o) => o.url),
      fallback: this.fallbackOrigins.map((o) => o.url),
    };
  }
}
