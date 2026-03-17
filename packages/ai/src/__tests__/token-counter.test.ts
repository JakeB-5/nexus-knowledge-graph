/**
 * Tests for TokenCounter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../token-counter.js';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter('gpt-4');
  });

  describe('count', () => {
    it('returns 0 for empty string', () => {
      expect(counter.count('')).toBe(0);
    });

    it('returns a positive number for non-empty text', () => {
      expect(counter.count('Hello world')).toBeGreaterThan(0);
    });

    it('longer text has more tokens than shorter text', () => {
      const short = counter.count('Hello');
      const long = counter.count('Hello world this is a longer sentence with more words');
      expect(long).toBeGreaterThan(short);
    });

    it('produces consistent results for same input', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      expect(counter.count(text)).toBe(counter.count(text));
    });

    it('handles punctuation', () => {
      expect(counter.count('Hello, world!')).toBeGreaterThan(0);
    });

    it('handles numeric text', () => {
      expect(counter.count('12345')).toBeGreaterThan(0);
    });
  });

  describe('countMessages', () => {
    it('counts tokens for message array', () => {
      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello!' },
      ];
      const tokens = counter.countMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('adds overhead per message', () => {
      const single = counter.countMessages([{ role: 'user' as const, content: 'hi' }]);
      const double = counter.countMessages([
        { role: 'user' as const, content: 'hi' },
        { role: 'assistant' as const, content: 'hi' },
      ]);
      expect(double).toBeGreaterThan(single);
    });
  });

  describe('getModelInfo', () => {
    it('returns known model info', () => {
      const info = counter.getModelInfo('gpt-4');
      expect(info.contextWindow).toBe(8192);
      expect(info.maxOutputTokens).toBe(8192);
    });

    it('returns fallback for unknown model', () => {
      const info = counter.getModelInfo('unknown-model-xyz');
      expect(info.contextWindow).toBeGreaterThan(0);
    });

    it('uses default model when none specified', () => {
      const info = counter.getModelInfo();
      expect(info.contextWindow).toBeGreaterThan(0);
    });
  });

  describe('remainingTokens', () => {
    it('returns positive number for small prompt', () => {
      const remaining = counter.remainingTokens(100, 'gpt-4');
      expect(remaining).toBeGreaterThan(0);
    });

    it('returns 0 when prompt exceeds context window', () => {
      const remaining = counter.remainingTokens(99999, 'gpt-3.5-turbo');
      expect(remaining).toBe(0);
    });

    it('decreases as prompt size increases', () => {
      const r1 = counter.remainingTokens(100, 'gpt-4');
      const r2 = counter.remainingTokens(500, 'gpt-4');
      expect(r1).toBeGreaterThan(r2);
    });
  });

  describe('fitsInContext', () => {
    it('returns true for short text', () => {
      expect(counter.fitsInContext('Hello', 'gpt-4')).toBe(true);
    });

    it('returns false for text exceeding context window', () => {
      const hugeText = 'word '.repeat(100000);
      expect(counter.fitsInContext(hugeText, 'gpt-3.5-turbo')).toBe(false);
    });
  });

  describe('allocateBudget', () => {
    it('allocates tokens proportionally by weight', () => {
      const allocation = counter.allocateBudget(
        [
          { name: 'system', weight: 1 },
          { name: 'context', weight: 3 },
          { name: 'history', weight: 2 },
        ],
        600,
      );
      expect(allocation['system']).toBeGreaterThan(0);
      expect(allocation['context']).toBeGreaterThan(allocation['system']!);
      // Sum should equal total budget
      const total = Object.values(allocation).reduce((s, v) => s + v, 0);
      expect(total).toBe(600);
    });

    it('handles single section', () => {
      const allocation = counter.allocateBudget([{ name: 'all', weight: 1 }], 100);
      expect(allocation['all']).toBe(100);
    });
  });

  describe('splitToFit', () => {
    it('returns single chunk for short text', () => {
      const chunks = counter.splitToFit('Hello world', 1000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Hello world');
    });

    it('splits long text into multiple chunks', () => {
      const text = 'sentence one. sentence two. sentence three. sentence four. sentence five. '.repeat(10);
      const chunks = counter.splitToFit(text, 20);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('each chunk fits within limit', () => {
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
      const maxTokens = 15;
      const chunks = counter.splitToFit(text, maxTokens);
      for (const chunk of chunks) {
        expect(counter.count(chunk)).toBeLessThanOrEqual(maxTokens + 5); // small tolerance
      }
    });

    it('reassembles to original content', () => {
      const text = 'word '.repeat(200).trim();
      const chunks = counter.splitToFit(text, 20);
      const rejoined = chunks.join(' ');
      // All words should be present
      expect(rejoined.split(' ').length).toBeGreaterThanOrEqual(text.split(' ').length - 5);
    });
  });

  describe('truncate', () => {
    it('returns original text if it fits', () => {
      expect(counter.truncate('Hello', 1000)).toBe('Hello');
    });

    it('truncates long text with ellipsis', () => {
      const longText = 'word '.repeat(1000);
      const truncated = counter.truncate(longText, 10);
      expect(truncated.endsWith('…')).toBe(true);
      expect(counter.count(truncated)).toBeLessThanOrEqual(15); // small tolerance
    });

    it('uses custom ellipsis', () => {
      const truncated = counter.truncate('word '.repeat(100), 5, '...');
      expect(truncated.endsWith('...')).toBe(true);
    });
  });

  describe('listKnownModels', () => {
    it('includes common models', () => {
      const models = counter.listKnownModels();
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5-turbo');
      expect(models).toContain('claude-3-opus');
    });
  });
});
