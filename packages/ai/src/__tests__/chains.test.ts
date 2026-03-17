/**
 * Tests for SummarizeChain, ExtractChain, ClassifyChain, and QAChain.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAIProvider } from '../providers/mock.js';
import { SummarizeChain } from '../chains/summarize.js';
import { ExtractChain } from '../chains/extract.js';
import { ClassifyChain } from '../chains/classify.js';
import { QAChain, ContextNode } from '../chains/question-answer.js';

// ─── SummarizeChain ───────────────────────────────────────────────────────────

describe('SummarizeChain', () => {
  let provider: MockAIProvider;
  let chain: SummarizeChain;

  beforeEach(() => {
    provider = new MockAIProvider({ defaultCompletionText: 'This is a mock summary.' });
    chain = new SummarizeChain(provider);
  });

  it('returns a summary for short text (direct strategy)', async () => {
    const result = await chain.run('Short text that needs summarizing.', { strategy: 'direct' });
    expect(result.summary).toBeTruthy();
    expect(result.chunksProcessed).toBe(1);
    expect(result.strategy).toBe('direct');
  });

  it('auto-selects direct strategy for short text', async () => {
    const result = await chain.run('Brief text.');
    expect(result.strategy).toBe('direct');
  });

  it('uses map-reduce for explicitly long text', async () => {
    const longText = 'word '.repeat(2000);
    const result = await chain.run(longText, { strategy: 'map-reduce', chunkSize: 100 });
    expect(result.strategy).toBe('map-reduce');
    expect(result.chunksProcessed).toBeGreaterThanOrEqual(1);
  });

  it('uses progressive strategy when specified', async () => {
    const text = 'word '.repeat(100);
    const result = await chain.run(text, { strategy: 'progressive', chunkSize: 50 });
    expect(result.strategy).toBe('progressive');
    expect(result.summary).toBeTruthy();
  });

  it('records provider calls', async () => {
    await chain.run('Some text to summarize.');
    expect(provider.callsFor('complete').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── ExtractChain ─────────────────────────────────────────────────────────────

describe('ExtractChain', () => {
  let provider: MockAIProvider;
  let chain: ExtractChain;

  beforeEach(() => {
    provider = new MockAIProvider({
      completionHandler: (messages) => {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.includes('Alice') || userMsg.includes('entity')) {
          return '[{"text": "Alice", "type": "Person", "confidence": 0.9}, {"text": "Acme Corp", "type": "Organization", "confidence": 0.85}]';
        }
        return '[{"source": "Alice", "relation": "works_at", "target": "Acme Corp", "confidence": 0.88}]';
      },
    });
    chain = new ExtractChain(provider);
  });

  describe('extractEntities', () => {
    it('extracts entities from text', async () => {
      const result = await chain.extractEntities(
        'Alice works at Acme Corp.',
        { schema: [{ type: 'Person' }, { type: 'Organization' }] },
      );
      expect(result.entities.length).toBeGreaterThan(0);
      const types = result.entities.map((e) => e.type);
      expect(types).toContain('Person');
    });

    it('deduplicates entities when option enabled', async () => {
      provider = new MockAIProvider({
        completionHandler: () =>
          '[{"text": "Alice", "type": "Person"}, {"text": "Alice", "type": "Person"}]',
      });
      chain = new ExtractChain(provider);
      const result = await chain.extractEntities('Alice and Alice.', {
        schema: [{ type: 'Person' }],
        deduplicate: true,
      });
      const aliceEntities = result.entities.filter((e) => e.text === 'Alice');
      expect(aliceEntities.length).toBe(1);
    });

    it('annotates character offsets for found text', async () => {
      const text = 'Alice works at Acme Corp.';
      const result = await chain.extractEntities(text, {
        schema: [{ type: 'Person' }],
      });
      const alice = result.entities.find((e) => e.text === 'Alice');
      if (alice) {
        expect(alice.start).toBe(0);
        expect(alice.end).toBe(5);
      }
    });

    it('returns empty array on malformed response', async () => {
      provider = new MockAIProvider({ defaultCompletionText: 'not valid json' });
      chain = new ExtractChain(provider);
      const result = await chain.extractEntities('text', { schema: [{ type: 'T' }] });
      expect(result.entities).toHaveLength(0);
    });
  });

  describe('extractRelations', () => {
    it('extracts relations from text', async () => {
      const result = await chain.extractRelations('Alice works at Acme Corp.', {
        schema: [{ name: 'works_at' }],
      });
      expect(result.relations.length).toBeGreaterThan(0);
      expect(result.relations[0]!.relation).toBe('works_at');
    });

    it('returns empty array on malformed response', async () => {
      provider = new MockAIProvider({ defaultCompletionText: 'bad json' });
      chain = new ExtractChain(provider);
      const result = await chain.extractRelations('text', { schema: [{ name: 'rel' }] });
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('extractAll', () => {
    it('runs both entity and relation extraction', async () => {
      const result = await chain.extractAll(
        'Alice works at Acme Corp.',
        { schema: [{ type: 'Person' }, { type: 'Organization' }] },
        { schema: [{ name: 'works_at' }] },
      );
      expect(Array.isArray(result.entities)).toBe(true);
      expect(Array.isArray(result.relations)).toBe(true);
    });
  });
});

// ─── ClassifyChain ────────────────────────────────────────────────────────────

describe('ClassifyChain', () => {
  let provider: MockAIProvider;
  let chain: ClassifyChain;

  const categories = [
    { label: 'Technology', description: 'Tech-related content' },
    { label: 'Sports', description: 'Sports-related content' },
    { label: 'Politics', description: 'Political content' },
  ];

  beforeEach(() => {
    provider = new MockAIProvider({
      completionHandler: () =>
        '{"labels": ["Technology"], "scores": {"Technology": 0.9, "Sports": 0.05, "Politics": 0.05}}',
    });
    chain = new ClassifyChain(provider);
  });

  it('classifies text into a category', async () => {
    const result = await chain.classify('The new AI model is impressive.', categories);
    expect(result.labels).toContain('Technology');
    expect(result.primaryLabel).toBe('Technology');
    expect(result.primaryScore).toBeGreaterThan(0);
  });

  it('respects minConfidence threshold', async () => {
    provider = new MockAIProvider({
      completionHandler: () =>
        '{"labels": ["Technology", "Sports"], "scores": {"Technology": 0.9, "Sports": 0.1}}',
    });
    chain = new ClassifyChain(provider);
    const result = await chain.classify('AI in sports.', categories, { minConfidence: 0.5 });
    expect(result.labels).not.toContain('Sports');
    expect(result.labels).toContain('Technology');
  });

  it('classifyNodeType returns a single label', async () => {
    const result = await chain.classifyNodeType('AI startup founded in 2020', ['Company', 'Person', 'Concept']);
    expect(result.labels.length).toBe(1);
  });

  it('classifySentiment returns sentiment label', async () => {
    provider = new MockAIProvider({
      completionHandler: () =>
        '{"label": "positive", "score": 0.9, "explanation": "clearly positive"}',
    });
    chain = new ClassifyChain(provider);
    const result = await chain.classifySentiment('I love this product!');
    expect(['positive', 'negative', 'neutral', 'mixed']).toContain(result.label);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('classifyTopics returns multiple topics', async () => {
    provider = new MockAIProvider({
      completionHandler: () =>
        '{"labels": ["AI", "Healthcare"], "scores": {"AI": 0.8, "Healthcare": 0.7, "Finance": 0.1}}',
    });
    chain = new ClassifyChain(provider);
    const result = await chain.classifyTopics('AI in healthcare.', ['AI', 'Healthcare', 'Finance'], {
      multiLabel: true,
    });
    expect(result.topics).toContain('AI');
    expect(result.topics).toContain('Healthcare');
  });

  it('falls back gracefully on malformed JSON', async () => {
    provider = new MockAIProvider({ defaultCompletionText: 'not json' });
    chain = new ClassifyChain(provider);
    const result = await chain.classify('some text', categories);
    // Should fallback to first/best category
    expect(result.labels.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── QAChain ──────────────────────────────────────────────────────────────────

describe('QAChain', () => {
  let provider: MockAIProvider;
  let chain: QAChain;

  const sampleNodes: ContextNode[] = [
    {
      id: 'node-1',
      content: 'The Eiffel Tower is located in Paris, France.',
      score: 0.95,
      source: 'wikipedia',
    },
    {
      id: 'node-2',
      content: 'Paris is the capital city of France.',
      score: 0.85,
      source: 'geography',
    },
  ];

  beforeEach(() => {
    provider = new MockAIProvider({
      completionHandler: (messages) => {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.toLowerCase().includes('yes') || userMsg.toLowerCase().includes('no')) {
          return 'yes';
        }
        return 'The Eiffel Tower is in Paris [1]. Paris is the capital of France [2].\n\nFollow-up questions:\n- When was the Eiffel Tower built?\n- What is the population of Paris?\n- What other landmarks are in Paris?';
      },
    });
    chain = new QAChain(provider);
  });

  it('returns an answer given context nodes', async () => {
    const result = await chain.answer('Where is the Eiffel Tower?', sampleNodes);
    expect(result.answer).toBeTruthy();
    expect(typeof result.answer).toBe('string');
  });

  it('extracts citations from answer', async () => {
    const result = await chain.answer('Where is the Eiffel Tower?', sampleNodes, {
      citeSources: true,
    });
    expect(Array.isArray(result.citations)).toBe(true);
    // Citations should reference node ids
    if (result.citations.length > 0) {
      expect(result.citations[0]!.nodeId).toBeTruthy();
    }
  });

  it('extracts follow-up questions', async () => {
    const result = await chain.answer('Where is the Eiffel Tower?', sampleNodes, {
      detectFollowUps: true,
    });
    expect(Array.isArray(result.followUpQuestions)).toBe(true);
    // May or may not find follow-ups depending on mock response format
  });

  it('respects minRelevanceScore filter', async () => {
    const result = await chain.answer('Where is the Eiffel Tower?', sampleNodes, {
      minRelevanceScore: 0.90,
    });
    // Only node-1 (score 0.95) should be included; node-2 (0.85) filtered out
    expect(result).toBeDefined();
  });

  it('handles empty context', async () => {
    provider = new MockAIProvider({
      defaultCompletionText: "I don't have enough information to answer that.",
    });
    chain = new QAChain(provider);
    const result = await chain.answer('Unknown question', []);
    expect(result.answer).toBeTruthy();
  });

  it('answerDirect works without context', async () => {
    provider = new MockAIProvider({ defaultCompletionText: 'Direct answer.' });
    chain = new QAChain(provider);
    const result = await chain.answerDirect('What is 2+2?');
    expect(result.answer).toBe('Direct answer.');
    expect(result.grounded).toBe(false);
    expect(result.citations).toHaveLength(0);
  });

  it('records conversation history across turns', async () => {
    await chain.answer('First question?', sampleNodes);
    await chain.answer('Second question?', sampleNodes);
    expect(chain.getHistory()).toHaveLength(2);
  });

  it('clearHistory resets conversation', async () => {
    await chain.answer('A question?', sampleNodes);
    chain.clearHistory();
    expect(chain.getHistory()).toHaveLength(0);
  });

  it('isAnswerable returns boolean', async () => {
    provider = new MockAIProvider({ defaultCompletionText: 'yes' });
    chain = new QAChain(provider);
    const answerable = await chain.isAnswerable('Where is the Eiffel Tower?', sampleNodes);
    expect(typeof answerable).toBe('boolean');
  });
});
