/**
 * ClassifyChain - classify text by type, sentiment, topic, or custom categories.
 */

import { AIProvider, ChatMessage, CompletionOptions } from '../types.js';
import { PromptBuilder } from '../prompt-builder.js';

export interface ClassifyCategory {
  label: string;
  description?: string;
  examples?: string[];
}

export interface ClassifyOptions extends CompletionOptions {
  /** Whether the model may return multiple labels */
  multiLabel?: boolean;
  /** Minimum confidence threshold (0–1, default: 0) */
  minConfidence?: number;
  /** Return raw scores for all categories */
  returnAllScores?: boolean;
}

export interface ClassifyResult {
  labels: string[];
  scores: Record<string, number>;
  primaryLabel: string;
  primaryScore: number;
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  explanation?: string;
}

// ─── Topic ───────────────────────────────────────────────────────────────────

export interface TopicResult {
  topics: string[];
  scores: Record<string, number>;
}

// ─── ClassifyChain ────────────────────────────────────────────────────────────

export class ClassifyChain {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Classify text into custom categories.
   */
  async classify(
    text: string,
    categories: ClassifyCategory[],
    options: ClassifyOptions = {},
  ): Promise<ClassifyResult> {
    const categoryList = categories
      .map((c) => {
        const desc = c.description ? ` - ${c.description}` : '';
        const ex = c.examples ? ` (examples: ${c.examples.join(', ')})` : '';
        return `- "${c.label}"${desc}${ex}`;
      })
      .join('\n');

    const multiNote = options.multiLabel
      ? 'You may assign multiple labels if appropriate.'
      : 'Assign exactly one label.';

    const messages: ChatMessage[] = new PromptBuilder()
      .system(
        `You are a classification expert. ${multiNote}

Available categories:
${categoryList}

Respond ONLY with JSON in this format:
{"labels": ["label1"], "scores": {"label1": 0.95, "label2": 0.05}}`,
      )
      .user(`Classify the following text:\n\n${text}`)
      .build();

    const result = await this.provider.complete(messages, { temperature: 0, ...options });
    return this.parseClassifyResult(result.text, categories, options.minConfidence ?? 0);
  }

  /**
   * Classify nodes in a knowledge graph by type.
   */
  async classifyNodeType(
    nodeContent: string,
    possibleTypes: string[],
    options: ClassifyOptions = {},
  ): Promise<ClassifyResult> {
    const categories = possibleTypes.map((t) => ({ label: t }));
    return this.classify(nodeContent, categories, { ...options, multiLabel: false });
  }

  /**
   * Perform sentiment analysis.
   */
  async classifySentiment(
    text: string,
    options: CompletionOptions = {},
  ): Promise<SentimentResult> {
    const messages: ChatMessage[] = new PromptBuilder()
      .system(
        `You are a sentiment analysis expert. Analyze the sentiment of the text.
Respond ONLY with JSON:
{"label": "positive|negative|neutral|mixed", "score": 0.0, "explanation": "brief reason"}`,
      )
      .user(text)
      .build();

    const result = await this.provider.complete(messages, { temperature: 0, ...options });

    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          label?: string;
          score?: number;
          explanation?: string;
        };
        const label = (['positive', 'negative', 'neutral', 'mixed'].includes(parsed.label ?? '')
          ? parsed.label
          : 'neutral') as SentimentLabel;
        return {
          label,
          score: parsed.score ?? 0.5,
          explanation: parsed.explanation,
        };
      }
    } catch {
      // fall through
    }

    return { label: 'neutral', score: 0.5 };
  }

  /**
   * Classify text into topics.
   */
  async classifyTopics(
    text: string,
    possibleTopics: string[],
    options: ClassifyOptions = {},
  ): Promise<TopicResult> {
    const categories = possibleTopics.map((t) => ({ label: t }));
    const result = await this.classify(text, categories, { ...options, multiLabel: true });
    return { topics: result.labels, scores: result.scores };
  }

  /**
   * Classify text with confidence scoring for all categories.
   */
  async classifyWithConfidence(
    text: string,
    categories: ClassifyCategory[],
    options: ClassifyOptions = {},
  ): Promise<ClassifyResult> {
    return this.classify(text, categories, { ...options, returnAllScores: true });
  }

  // ─── Parser ──────────────────────────────────────────────────────────────────

  private parseClassifyResult(
    raw: string,
    categories: ClassifyCategory[],
    minConfidence: number,
  ): ClassifyResult {
    let labels: string[] = [];
    let scores: Record<string, number> = {};

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          labels?: unknown;
          scores?: unknown;
        };
        if (Array.isArray(parsed.labels)) {
          labels = parsed.labels.filter((l): l is string => typeof l === 'string');
        }
        if (parsed.scores && typeof parsed.scores === 'object') {
          scores = parsed.scores as Record<string, number>;
        }
      }
    } catch {
      // fallback: first category
    }

    // Filter by confidence threshold
    if (minConfidence > 0) {
      labels = labels.filter((l) => (scores[l] ?? 1) >= minConfidence);
    }

    // Validate labels are in the allowed set
    const validLabels = new Set(categories.map((c) => c.label));
    labels = labels.filter((l) => validLabels.has(l));

    // Fallback: pick highest-scoring known category
    if (labels.length === 0 && categories.length > 0) {
      const best = categories.reduce((a, b) =>
        (scores[a.label] ?? 0) >= (scores[b.label] ?? 0) ? a : b,
      );
      labels = [best.label];
    }

    const primaryLabel = labels[0] ?? '';
    const primaryScore = scores[primaryLabel] ?? 0;

    return { labels, scores, primaryLabel, primaryScore };
  }
}
