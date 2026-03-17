/**
 * Tests for SignedUrlGenerator.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SignedUrlGenerator } from '../signed-url.js';

describe('SignedUrlGenerator', () => {
  const SECRET = 'super-secret-key-for-testing-1234';
  const BASE_URL = 'https://storage.example.com';
  let generator: SignedUrlGenerator;

  beforeEach(() => {
    generator = new SignedUrlGenerator(SECRET, BASE_URL);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sign', () => {
    it('generates a URL with required parameters', () => {
      const signed = generator.sign('images/photo.jpg', {
        permission: 'read',
        expiresInSeconds: 3600,
      });
      expect(signed.url).toContain('X-Nexus-Expires=');
      expect(signed.url).toContain('X-Nexus-Permission=read');
      expect(signed.url).toContain('X-Nexus-Signature=');
    });

    it('sets correct expiration time', () => {
      const signed = generator.sign('file.txt', { permission: 'read', expiresInSeconds: 3600 });
      const expectedExpiry = new Date('2024-01-01T01:00:00Z');
      expect(signed.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('encodes key components in URL path', () => {
      const signed = generator.sign('folder/my file.txt', {
        permission: 'read',
        expiresInSeconds: 60,
      });
      expect(signed.url).toContain('my%20file.txt');
    });

    it('embeds metadata in URL', () => {
      const signed = generator.sign('doc.pdf', {
        permission: 'write',
        expiresInSeconds: 300,
        metadata: { userId: '42' },
      });
      expect(signed.url).toContain('userId');
    });

    it('sets permission in result', () => {
      const signed = generator.sign('x.txt', { permission: 'write', expiresInSeconds: 60 });
      expect(signed.permission).toBe('write');
    });
  });

  describe('verify', () => {
    it('verifies a valid signed URL', () => {
      const signed = generator.sign('images/test.png', {
        permission: 'read',
        expiresInSeconds: 300,
      });
      const result = generator.verify(signed.url);
      expect(result.key).toBe('images/test.png');
      expect(result.permission).toBe('read');
    });

    it('throws on expired URL', () => {
      const signed = generator.sign('file.txt', { permission: 'read', expiresInSeconds: 10 });
      // Advance time past expiry
      vi.setSystemTime(new Date('2024-01-01T00:01:00Z'));
      expect(() => generator.verify(signed.url)).toThrow('expired');
    });

    it('throws on tampered signature', () => {
      const signed = generator.sign('file.txt', { permission: 'read', expiresInSeconds: 3600 });
      const tampered = signed.url.replace(/X-Nexus-Signature=[a-f0-9]+/, 'X-Nexus-Signature=deadbeef');
      expect(() => generator.verify(tampered)).toThrow('signature mismatch');
    });

    it('throws on missing parameters', () => {
      expect(() => generator.verify('https://storage.example.com/file.txt')).toThrow(
        'missing required query parameters',
      );
    });

    it('throws on invalid permission value', () => {
      const signed = generator.sign('f.txt', { permission: 'read', expiresInSeconds: 3600 });
      const bad = signed.url.replace('X-Nexus-Permission=read', 'X-Nexus-Permission=admin');
      expect(() => generator.verify(bad)).toThrow();
    });

    it('verifies URL with metadata', () => {
      const signed = generator.sign('doc.txt', {
        permission: 'read',
        expiresInSeconds: 300,
        metadata: { role: 'viewer' },
      });
      const result = generator.verify(signed.url);
      expect(result.key).toBe('doc.txt');
    });

    it('rejects URL signed with different secret', () => {
      const other = new SignedUrlGenerator('different-secret', BASE_URL);
      const signed = other.sign('file.txt', { permission: 'read', expiresInSeconds: 3600 });
      expect(() => generator.verify(signed.url)).toThrow('signature mismatch');
    });
  });

  describe('isValid', () => {
    it('returns true for valid URL', () => {
      const signed = generator.sign('ok.txt', { permission: 'read', expiresInSeconds: 600 });
      expect(generator.isValid(signed.url)).toBe(true);
    });

    it('returns false for expired URL', () => {
      const signed = generator.sign('ok.txt', { permission: 'read', expiresInSeconds: 1 });
      vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
      expect(generator.isValid(signed.url)).toBe(false);
    });

    it('returns false for tampered URL', () => {
      const signed = generator.sign('ok.txt', { permission: 'read', expiresInSeconds: 3600 });
      const bad = signed.url + 'x';
      expect(generator.isValid(bad)).toBe(false);
    });
  });

  describe('quickReadUrl and quickWriteUrl', () => {
    it('quickReadUrl returns a read-permission URL expiring in 5 minutes', () => {
      const signed = generator.quickReadUrl('doc.pdf');
      expect(signed.permission).toBe('read');
      const diffMs = signed.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeCloseTo(5 * 60 * 1000, -3);
    });

    it('quickWriteUrl returns a write-permission URL expiring in 15 minutes', () => {
      const signed = generator.quickWriteUrl('upload.zip');
      expect(signed.permission).toBe('write');
      const diffMs = signed.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeCloseTo(15 * 60 * 1000, -3);
    });
  });

  describe('determinism', () => {
    it('generates different signatures for different keys', () => {
      const a = generator.sign('file-a.txt', { permission: 'read', expiresInSeconds: 60 });
      const b = generator.sign('file-b.txt', { permission: 'read', expiresInSeconds: 60 });
      expect(a.url).not.toBe(b.url);
    });

    it('generates different signatures for read vs write', () => {
      const r = generator.sign('file.txt', { permission: 'read', expiresInSeconds: 60 });
      const w = generator.sign('file.txt', { permission: 'write', expiresInSeconds: 60 });
      // Signatures should differ because permission is part of the signed string
      const rSig = new URL(r.url).searchParams.get('X-Nexus-Signature');
      const wSig = new URL(w.url).searchParams.get('X-Nexus-Signature');
      expect(rSig).not.toBe(wSig);
    });
  });
});
