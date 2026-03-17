/**
 * Tests for PromptBuilder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptBuilder } from '../prompt-builder.js';

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  describe('basic message building', () => {
    it('builds a system message', () => {
      const messages = builder.system('You are helpful.').build();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('builds user and assistant messages', () => {
      const messages = builder
        .system('sys')
        .user('Hello')
        .assistant('Hi there')
        .user('How are you?')
        .build();
      expect(messages).toHaveLength(4);
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi there' });
      expect(messages[3]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('builds without system message', () => {
      const messages = builder.user('Hello').build();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('user');
    });

    it('turn() adds user+assistant pair', () => {
      const messages = builder.turn('Q', 'A').build();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Q' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'A' });
    });
  });

  describe('few-shot examples', () => {
    it('prepends examples before main messages', () => {
      const messages = builder
        .system('sys')
        .addExample({ user: 'ex-q', assistant: 'ex-a' })
        .user('real-q')
        .build();

      expect(messages).toHaveLength(4);
      expect(messages[1]).toEqual({ role: 'user', content: 'ex-q' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'ex-a' });
      expect(messages[3]).toEqual({ role: 'user', content: 'real-q' });
    });

    it('addExamples adds multiple examples', () => {
      const messages = builder
        .addExamples([
          { user: 'q1', assistant: 'a1' },
          { user: 'q2', assistant: 'a2' },
        ])
        .user('q')
        .build();
      expect(messages).toHaveLength(5);
    });
  });

  describe('template interpolation', () => {
    it('replaces variables in template strings', () => {
      const result = PromptBuilder.interpolate('Hello {{name}}, you are {{age}}.', {
        name: 'Alice',
        age: '30',
      });
      expect(result).toBe('Hello Alice, you are 30.');
    });

    it('leaves undefined variables as-is', () => {
      const result = PromptBuilder.interpolate('Hello {{name}}.', {});
      expect(result).toBe('Hello {{name}}.');
    });
  });

  describe('fromTemplate', () => {
    it('loads a built-in summarize template', () => {
      const messages = builder.fromTemplate('summarize', { text: 'content', length: '3' }).build();
      expect(messages.some((m) => m.role === 'system')).toBe(true);
      const userMsg = messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('content');
    });

    it('loads qa template with context and question', () => {
      const messages = builder
        .fromTemplate('qa', { context: 'Some facts.', question: 'What?' })
        .build();
      const user = messages.find((m) => m.role === 'user');
      expect(user?.content).toContain('Some facts.');
      expect(user?.content).toContain('What?');
    });

    it('throws for unknown template', () => {
      expect(() => builder.fromTemplate('nonexistent')).toThrow('Unknown template');
    });

    it('lists available templates', () => {
      const templates = PromptBuilder.listTemplates();
      expect(templates).toContain('summarize');
      expect(templates).toContain('qa');
      expect(templates).toContain('classify');
    });

    it('allows registering custom templates', () => {
      PromptBuilder.registerTemplate({
        name: 'test-custom',
        system: 'Custom system.',
        userTemplate: 'Custom {{value}}.',
      });
      const messages = new PromptBuilder()
        .fromTemplate('test-custom', { value: 'hello' })
        .build();
      expect(messages.some((m) => m.content === 'Custom system.')).toBe(true);
      expect(messages.some((m) => m.content === 'Custom hello.')).toBe(true);
    });
  });

  describe('token budget management', () => {
    it('estimateTokens approximates message token count', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello world' },
        { role: 'assistant' as const, content: 'Hi there' },
      ];
      const tokens = PromptBuilder.estimateTokens(messages);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100);
    });

    it('chunkText splits text into token-bounded chunks', () => {
      const longText = 'word '.repeat(1000);
      const chunks = PromptBuilder.chunkText(longText, 50);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        // Each chunk should be no longer than maxTokens * charsPerToken
        expect(chunk.length).toBeLessThanOrEqual(50 * 4 + 5);
      }
    });

    it('trimToFit removes middle messages to stay within budget', () => {
      const smallBudget = 10;
      const messages = builder
        .system('Short sys.')
        .turn('Q1', 'A1')
        .turn('Q2', 'A2')
        .user('Final question?')
        .build({ maxTokens: smallBudget });
      // Should still have system + last user at minimum
      expect(messages.length).toBeGreaterThanOrEqual(1);
      const roles = messages.map((m) => m.role);
      // Last user message should be present
      expect(roles[roles.length - 1]).toBe('user');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      builder.system('sys').user('hello').addExample({ user: 'q', assistant: 'a' });
      builder.reset();
      const messages = builder.build();
      expect(messages).toHaveLength(0);
    });
  });
});
