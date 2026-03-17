/**
 * SummarizeChain - summarize long documents using map-reduce and progressive strategies.
 */

import { AIProvider, ChatMessage, CompletionOptions } from '../types.js';
import { PromptBuilder } from '../prompt-builder.js';

export interface SummarizeOptions extends CompletionOptions {
  /** Maximum length of each chunk in characters (default: 6000) */
  chunkSize?: number;
  /** Desired output length: 'short' | 'medium' | 'long' | number of sentences */
  length?: 'short' | 'medium' | 'long' | number;
  /** Summarization strategy */
  strategy?: 'map-reduce' | 'progressive' | 'direct';
  /** Optional focus topic to guide summarization */
  focus?: string;
}

export interface SummarizeResult {
  summary: string;
  chunksProcessed: number;
  strategy: string;
}

function lengthInstruction(length: SummarizeOptions['length'] = 'medium'): string {
  if (typeof length === 'number') return `in exactly ${length} sentence${length === 1 ? '' : 's'}`;
  switch (length) {
    case 'short': return 'in 1-2 sentences';
    case 'long': return 'in 5-8 sentences covering key details';
    default: return 'in 3-4 sentences';
  }
}

export class SummarizeChain {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Summarize text, automatically choosing a strategy based on length.
   */
  async run(text: string, options: SummarizeOptions = {}): Promise<SummarizeResult> {
    const chunkSize = options.chunkSize ?? 6000;
    const strategy = options.strategy ?? (text.length > chunkSize ? 'map-reduce' : 'direct');

    switch (strategy) {
      case 'direct':
        return this.directSummarize(text, options);
      case 'map-reduce':
        return this.mapReduceSummarize(text, options, chunkSize);
      case 'progressive':
        return this.progressiveSummarize(text, options, chunkSize);
    }
  }

  // ─── Direct (single prompt) ─────────────────────────────────────────────────

  private async directSummarize(
    text: string,
    options: SummarizeOptions,
  ): Promise<SummarizeResult> {
    const focusClause = options.focus ? ` Focus especially on "${options.focus}".` : '';
    const messages: ChatMessage[] = new PromptBuilder()
      .system(`You are an expert summarizer.${focusClause} Be concise and accurate.`)
      .user(`Summarize the following text ${lengthInstruction(options.length)}:\n\n${text}`)
      .build();

    const result = await this.provider.complete(messages, options);
    return { summary: result.text.trim(), chunksProcessed: 1, strategy: 'direct' };
  }

  // ─── Map-reduce ─────────────────────────────────────────────────────────────

  private async mapReduceSummarize(
    text: string,
    options: SummarizeOptions,
    chunkSize: number,
  ): Promise<SummarizeResult> {
    // Split text into chunks
    const chunks = PromptBuilder.chunkText(text, chunkSize / 4, 4); // chars → tokens → chars

    // Map: summarize each chunk
    const chunkSummaries = await Promise.all(
      chunks.map((chunk) => this.summarizeChunk(chunk, options)),
    );

    // Reduce: summarize the summaries
    const combined = chunkSummaries.join('\n\n');
    const finalResult = await this.directSummarize(combined, options);

    return {
      summary: finalResult.summary,
      chunksProcessed: chunks.length,
      strategy: 'map-reduce',
    };
  }

  // ─── Progressive (summary of summaries) ────────────────────────────────────

  private async progressiveSummarize(
    text: string,
    options: SummarizeOptions,
    chunkSize: number,
  ): Promise<SummarizeResult> {
    const chunks = PromptBuilder.chunkText(text, chunkSize / 4, 4);
    let running = '';
    let processed = 0;

    for (const chunk of chunks) {
      const context = running
        ? `Previous summary: ${running}\n\nNew content to incorporate:`
        : 'Text to summarize:';
      const messages: ChatMessage[] = new PromptBuilder()
        .system('You are a summarizer. Update the running summary to incorporate the new content, keeping it concise.')
        .user(`${context}\n\n${chunk}`)
        .build();

      const result = await this.provider.complete(messages, options);
      running = result.text.trim();
      processed++;
    }

    return { summary: running, chunksProcessed: processed, strategy: 'progressive' };
  }

  // ─── Helper ──────────────────────────────────────────────────────────────────

  private async summarizeChunk(chunk: string, options: SummarizeOptions): Promise<string> {
    const messages: ChatMessage[] = new PromptBuilder()
      .system('Summarize the following text in 2-3 sentences, preserving key information.')
      .user(chunk)
      .build();
    const result = await this.provider.complete(messages, options);
    return result.text.trim();
  }
}
