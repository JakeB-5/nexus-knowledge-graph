/**
 * Tests for ImageProcessor.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ImageProcessor } from '../image-processor.js';

// Helpers to build minimal valid image headers

function makePNG(width: number, height: number): Buffer {
  // 8-byte PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR chunk: 4-byte length + 4-byte "IHDR" + 4-byte width + 4-byte height + 5 more bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from('IHDR');
  return Buffer.concat([sig, ihdrLen, ihdrType, ihdrData]);
}

function makeJPEG(width: number, height: number): Buffer {
  // SOI marker FF D8
  // APP0 marker FF E0 with length 16
  // SOF0 marker FF C0 + length 11 + precision 8 + height 2 bytes + width 2 bytes
  const buf = Buffer.alloc(30);
  // SOI
  buf[0] = 0xff;
  buf[1] = 0xd8;
  // APP0
  buf[2] = 0xff;
  buf[3] = 0xe0;
  buf.writeUInt16BE(16, 4); // length = 16
  // Fill APP0 data (14 bytes of padding)
  // SOF0 at offset 2 + 2 + 16 = 20
  buf[18] = 0xff;
  buf[19] = 0xc0;
  buf.writeUInt16BE(11, 20); // segment length
  buf[22] = 8;               // precision
  buf.writeUInt16BE(height, 23);
  buf.writeUInt16BE(width, 25);
  return buf;
}

function makeGIF(width: number, height: number): Buffer {
  // GIF89a header: 6 bytes signature + 2-byte width + 2-byte height
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function makeWebPVP8X(width: number, height: number): Buffer {
  // RIFF header (12 bytes) + VP8X chunk (18 bytes)
  const buf = Buffer.alloc(30);
  // RIFF
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4); // file size - 8
  buf.write('WEBP', 8, 'ascii');
  // VP8X chunk type
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16); // chunk size
  // flags at byte 20 (4 bytes)
  // width-1 at bytes 24-26 (3 bytes LE)
  buf.writeUIntLE(width - 1, 24, 3);
  // height-1 at bytes 27-29 (3 bytes LE)
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe('ImageProcessor', () => {
  let processor: ImageProcessor;

  beforeEach(() => {
    processor = new ImageProcessor();
  });

  describe('detectFormat', () => {
    it('detects PNG', () => {
      const buf = makePNG(100, 100);
      expect(processor.detectFormat(buf)).toBe('png');
    });

    it('detects JPEG', () => {
      const buf = makeJPEG(100, 100);
      expect(processor.detectFormat(buf)).toBe('jpeg');
    });

    it('detects GIF', () => {
      const buf = makeGIF(100, 100);
      expect(processor.detectFormat(buf)).toBe('gif');
    });

    it('detects WebP', () => {
      const buf = makeWebPVP8X(100, 100);
      expect(processor.detectFormat(buf)).toBe('webp');
    });

    it('returns unknown for arbitrary bytes', () => {
      expect(processor.detectFormat(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('unknown');
    });

    it('returns unknown for empty buffer', () => {
      expect(processor.detectFormat(Buffer.alloc(0))).toBe('unknown');
    });
  });

  describe('extractMetadata - PNG', () => {
    it('extracts correct dimensions', () => {
      const meta = processor.extractMetadata(makePNG(800, 600));
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(600);
      expect(meta.contentType).toBe('image/png');
      expect(meta.parsed).toBe(true);
    });

    it('reports correct byte size', () => {
      const buf = makePNG(1, 1);
      const meta = processor.extractMetadata(buf);
      expect(meta.sizeBytes).toBe(buf.length);
    });
  });

  describe('extractMetadata - JPEG', () => {
    it('extracts correct dimensions', () => {
      const meta = processor.extractMetadata(makeJPEG(1920, 1080));
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.contentType).toBe('image/jpeg');
      expect(meta.parsed).toBe(true);
    });
  });

  describe('extractMetadata - GIF', () => {
    it('extracts correct dimensions', () => {
      const meta = processor.extractMetadata(makeGIF(320, 240));
      expect(meta.format).toBe('gif');
      expect(meta.width).toBe(320);
      expect(meta.height).toBe(240);
      expect(meta.contentType).toBe('image/gif');
      expect(meta.parsed).toBe(true);
    });
  });

  describe('extractMetadata - WebP', () => {
    it('extracts correct dimensions from VP8X', () => {
      const meta = processor.extractMetadata(makeWebPVP8X(1024, 768));
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(1024);
      expect(meta.height).toBe(768);
      expect(meta.contentType).toBe('image/webp');
      expect(meta.parsed).toBe(true);
    });
  });

  describe('extractMetadata - unknown format', () => {
    it('returns parsed=false for unknown format', () => {
      const meta = processor.extractMetadata(Buffer.from('not an image'));
      expect(meta.format).toBe('unknown');
      expect(meta.parsed).toBe(false);
      expect(meta.width).toBe(0);
      expect(meta.height).toBe(0);
    });
  });

  describe('validateContentType', () => {
    it('accepts valid image types', () => {
      expect(processor.validateContentType('image/png')).toBe(true);
      expect(processor.validateContentType('image/jpeg')).toBe(true);
      expect(processor.validateContentType('image/gif')).toBe(true);
      expect(processor.validateContentType('image/webp')).toBe(true);
      expect(processor.validateContentType('image/svg+xml')).toBe(true);
    });

    it('rejects non-image types', () => {
      expect(processor.validateContentType('application/pdf')).toBe(false);
      expect(processor.validateContentType('text/plain')).toBe(false);
      expect(processor.validateContentType('video/mp4')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('rejects empty file', () => {
      const result = processor.validateFileSize(0);
      expect(result.valid).toBe(false);
    });

    it('rejects oversized file', () => {
      const result = processor.validateFileSize(51 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds limit');
    });

    it('accepts valid size', () => {
      const result = processor.validateFileSize(1024);
      expect(result.valid).toBe(true);
    });

    it('accepts custom max size', () => {
      const strict = new ImageProcessor(100);
      expect(strict.validateFileSize(101).valid).toBe(false);
      expect(strict.validateFileSize(100).valid).toBe(true);
    });
  });

  describe('generateThumbnailSVG', () => {
    it('generates valid SVG string', () => {
      const svg = processor.generateThumbnailSVG({ format: 'png', width: 800, height: 600 });
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('PNG');
      expect(svg).toContain('800×600');
    });

    it('respects custom thumbnail dimensions', () => {
      const svg = processor.generateThumbnailSVG(
        { format: 'jpeg', width: 100, height: 100 },
        400,
        300,
      );
      expect(svg).toContain('width="400"');
      expect(svg).toContain('height="300"');
    });

    it('shows "unknown size" when dimensions are zero', () => {
      const svg = processor.generateThumbnailSVG({ format: 'unknown', width: 0, height: 0 });
      expect(svg).toContain('unknown size');
    });
  });
});
