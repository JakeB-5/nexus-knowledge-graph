/**
 * SignedURL generator using HMAC-SHA256.
 *
 * URL format:
 *   <baseUrl>/<key>?X-Nexus-Expires=<epoch>&X-Nexus-Permission=<perm>&X-Nexus-Signature=<hmac>
 *
 * The HMAC covers: key + expires + permission (+ optional metadata entries sorted by key).
 */

import crypto from 'node:crypto';
import { SignedUrlOptions, SignedUrl, SignedUrlPermission } from './types.js';

export class SignedUrlGenerator {
  private readonly secret: Buffer;
  private readonly baseUrl: string;

  /**
   * @param secret - HMAC secret key (at least 32 bytes recommended)
   * @param baseUrl - Base URL prefix, e.g. "https://storage.example.com"
   */
  constructor(secret: string | Buffer, baseUrl: string) {
    this.secret = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Generate a signed URL for the given storage key.
   */
  sign(key: string, options: SignedUrlOptions): SignedUrl {
    const expiresAt = new Date(Date.now() + options.expiresInSeconds * 1000);
    const expiresEpoch = Math.floor(expiresAt.getTime() / 1000);

    const signature = this.computeSignature(key, expiresEpoch, options.permission, options.metadata);

    const params = new URLSearchParams({
      'X-Nexus-Expires': String(expiresEpoch),
      'X-Nexus-Permission': options.permission,
      'X-Nexus-Signature': signature,
    });

    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        params.set(`X-Nexus-Meta-${encodeURIComponent(k)}`, encodeURIComponent(v));
      }
    }

    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/${encodedKey}?${params.toString()}`;

    return { url, expiresAt, permission: options.permission };
  }

  /**
   * Verify a signed URL.
   * Returns the key and permission if valid, throws otherwise.
   */
  verify(url: string): { key: string; permission: SignedUrlPermission; expiresAt: Date } {
    const parsed = new URL(url);
    const expiresStr = parsed.searchParams.get('X-Nexus-Expires');
    const permission = parsed.searchParams.get('X-Nexus-Permission') as SignedUrlPermission | null;
    const signature = parsed.searchParams.get('X-Nexus-Signature');

    if (!expiresStr || !permission || !signature) {
      throw new Error('SignedURL: missing required query parameters');
    }

    if (permission !== 'read' && permission !== 'write') {
      throw new Error(`SignedURL: invalid permission "${permission}"`);
    }

    const expiresEpoch = parseInt(expiresStr, 10);
    if (isNaN(expiresEpoch)) {
      throw new Error('SignedURL: invalid expiry timestamp');
    }

    const expiresAt = new Date(expiresEpoch * 1000);
    if (expiresAt < new Date()) {
      throw new Error('SignedURL: URL has expired');
    }

    // Extract key from path (strip leading slash, decode components)
    const rawPath = parsed.pathname.replace(/^\//, '');
    const key = rawPath.split('/').map(decodeURIComponent).join('/');

    // Extract metadata params
    const metadata: Record<string, string> = {};
    for (const [paramKey, paramVal] of parsed.searchParams.entries()) {
      if (paramKey.startsWith('X-Nexus-Meta-')) {
        const metaKey = decodeURIComponent(paramKey.slice('X-Nexus-Meta-'.length));
        metadata[metaKey] = decodeURIComponent(paramVal);
      }
    }

    const expectedSignature = this.computeSignature(
      key,
      expiresEpoch,
      permission,
      Object.keys(metadata).length > 0 ? metadata : undefined,
    );

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      throw new Error('SignedURL: signature mismatch');
    }

    return { key, permission, expiresAt };
  }

  /**
   * Check if a signed URL is still valid (not expired, signature correct).
   */
  isValid(url: string): boolean {
    try {
      this.verify(url);
      return true;
    } catch {
      return false;
    }
  }

  private computeSignature(
    key: string,
    expiresEpoch: number,
    permission: SignedUrlPermission,
    metadata?: Record<string, string>,
  ): string {
    // Build a canonical string to sign
    const parts: string[] = [key, String(expiresEpoch), permission];

    if (metadata && Object.keys(metadata).length > 0) {
      const sortedMeta = Object.entries(metadata)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      parts.push(sortedMeta);
    }

    const message = parts.join('\n');
    return crypto.createHmac('sha256', this.secret).update(message).digest('hex');
  }

  /**
   * Generate a short-lived read URL (5 minutes).
   */
  quickReadUrl(key: string): SignedUrl {
    return this.sign(key, { permission: 'read', expiresInSeconds: 300 });
  }

  /**
   * Generate a short-lived write URL (15 minutes).
   */
  quickWriteUrl(key: string): SignedUrl {
    return this.sign(key, { permission: 'write', expiresInSeconds: 900 });
  }
}
