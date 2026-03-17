/**
 * PromptBuilder - fluent API for constructing chat message arrays.
 *
 * Features:
 * - system / user / assistant messages
 * - template variable substitution
 * - few-shot examples
 * - context window management (trim to fit token budget)
 * - template library for common tasks
 */

import { ChatMessage } from './types.js';

export interface FewShotExample {
  user: string;
  assistant: string;
}

export interface PromptTemplate {
  name: string;
  system: string;
  userTemplate: string;
  examples?: FewShotExample[];
}

export interface BuildOptions {
  /** Hard token limit for the entire prompt (0 = no limit) */
  maxTokens?: number;
  /** Chars-per-token ratio for estimation (default: 4) */
  charsPerToken?: number;
}

// Built-in template library
const TEMPLATE_LIBRARY: Record<string, PromptTemplate> = {
  summarize: {
    name: 'summarize',
    system:
      'You are an expert summarizer. Produce clear, concise summaries that preserve key information.',
    userTemplate: 'Please summarize the following text in {{length}} sentences:\n\n{{text}}',
  },
  extract_entities: {
    name: 'extract_entities',
    system:
      'You are an information extraction assistant. Extract named entities and return them as a JSON array: [{"text": "...", "type": "..."}].',
    userTemplate: 'Extract all named entities from this text:\n\n{{text}}',
  },
  classify: {
    name: 'classify',
    system:
      'You are a classification assistant. Classify the input and respond with JSON: {"label": "...", "confidence": 0.0}.',
    userTemplate: 'Classify the following text:\n\n{{text}}',
  },
  qa: {
    name: 'qa',
    system:
      'You are a helpful assistant that answers questions based only on the provided context. If the answer is not in the context, say "I don\'t know".',
    userTemplate: 'Context:\n{{context}}\n\nQuestion: {{question}}',
  },
  rewrite: {
    name: 'rewrite',
    system: 'You are a writing assistant. Rewrite the text according to the given instructions.',
    userTemplate: 'Instructions: {{instructions}}\n\nText to rewrite:\n{{text}}',
  },
};

export class PromptBuilder {
  private _system: string | undefined;
  private readonly _messages: ChatMessage[] = [];
  private readonly _examples: FewShotExample[] = [];

  // ─── Message builders ───────────────────────────────────────────────────────

  system(content: string): this {
    this._system = content;
    return this;
  }

  user(content: string): this {
    this._messages.push({ role: 'user', content });
    return this;
  }

  assistant(content: string): this {
    this._messages.push({ role: 'assistant', content });
    return this;
  }

  /** Add a turn pair (user + assistant) */
  turn(user: string, assistant: string): this {
    this._messages.push({ role: 'user', content: user });
    this._messages.push({ role: 'assistant', content: assistant });
    return this;
  }

  // ─── Few-shot examples ──────────────────────────────────────────────────────

  addExample(example: FewShotExample): this {
    this._examples.push(example);
    return this;
  }

  addExamples(examples: FewShotExample[]): this {
    this._examples.push(...examples);
    return this;
  }

  // ─── Template variable substitution ────────────────────────────────────────

  /**
   * Apply template variables to a string.
   * Variables use {{variableName}} syntax.
   */
  static interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
  }

  // ─── Template library ───────────────────────────────────────────────────────

  /**
   * Load a named template and apply variables to the user message.
   */
  fromTemplate(name: string, vars: Record<string, string> = {}): this {
    const tpl = TEMPLATE_LIBRARY[name];
    if (!tpl) throw new Error(`Unknown template: "${name}". Available: ${Object.keys(TEMPLATE_LIBRARY).join(', ')}`);

    this._system = tpl.system;

    if (tpl.examples) {
      this.addExamples(tpl.examples);
    }

    const userMessage = PromptBuilder.interpolate(tpl.userTemplate, vars);
    this._messages.push({ role: 'user', content: userMessage });

    return this;
  }

  /**
   * Register a custom template.
   */
  static registerTemplate(template: PromptTemplate): void {
    TEMPLATE_LIBRARY[template.name] = template;
  }

  static listTemplates(): string[] {
    return Object.keys(TEMPLATE_LIBRARY);
  }

  // ─── Build ───────────────────────────────────────────────────────────────────

  /**
   * Build the final message array.
   */
  build(options: BuildOptions = {}): ChatMessage[] {
    const { maxTokens = 0, charsPerToken = 4 } = options;

    const messages: ChatMessage[] = [];

    if (this._system) {
      messages.push({ role: 'system', content: this._system });
    }

    // Add few-shot examples before the main conversation
    for (const ex of this._examples) {
      messages.push({ role: 'user', content: ex.user });
      messages.push({ role: 'assistant', content: ex.assistant });
    }

    messages.push(...this._messages);

    if (maxTokens > 0) {
      return this.trimToFit(messages, maxTokens, charsPerToken);
    }

    return messages;
  }

  /**
   * Trim messages from the middle of the conversation to fit within a token budget.
   * System message and the last user message are always preserved.
   */
  private trimToFit(
    messages: ChatMessage[],
    maxTokens: number,
    charsPerToken: number,
  ): ChatMessage[] {
    const estimateTokens = (msgs: ChatMessage[]): number =>
      msgs.reduce((sum, m) => sum + Math.ceil(m.content.length / charsPerToken), 0);

    if (estimateTokens(messages) <= maxTokens) return messages;

    // Always keep: system (index 0 if present), last user message
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : undefined;
    const lastUserIdx = messages.reduceRight(
      (idx, m, i) => (idx === -1 && m.role === 'user' ? i : idx),
      -1,
    );
    const lastUser = lastUserIdx >= 0 ? messages[lastUserIdx] : undefined;

    const mustKeep: ChatMessage[] = [];
    if (systemMsg) mustKeep.push(systemMsg);
    if (lastUser) mustKeep.push(lastUser);

    if (estimateTokens(mustKeep) >= maxTokens) {
      // Even required messages don't fit; truncate system message
      const available = maxTokens * charsPerToken;
      const truncated: ChatMessage[] = [];
      if (systemMsg) {
        truncated.push({
          ...systemMsg,
          content: systemMsg.content.slice(0, Math.floor(available * 0.3)),
        });
      }
      if (lastUser) {
        truncated.push({
          ...lastUser,
          content: lastUser.content.slice(0, Math.floor(available * 0.7)),
        });
      }
      return truncated;
    }

    // Greedily add middle messages from newest to oldest (excluding system and lastUser)
    const middle = messages.filter(
      (m, i) => m !== systemMsg && i !== lastUserIdx,
    ).reverse();

    const result: ChatMessage[] = [...mustKeep];
    let used = estimateTokens(mustKeep);

    for (const msg of middle) {
      const cost = Math.ceil(msg.content.length / charsPerToken);
      if (used + cost <= maxTokens) {
        // Insert after system message
        result.splice(systemMsg ? 1 : 0, 0, msg);
        used += cost;
      }
    }

    // Restore chronological order
    return result;
  }

  // ─── Token budget helpers ───────────────────────────────────────────────────

  /**
   * Estimate token count for a list of messages.
   */
  static estimateTokens(messages: ChatMessage[], charsPerToken = 4): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / charsPerToken), 0);
  }

  /**
   * Split a long text into chunks that fit within a token budget.
   */
  static chunkText(text: string, maxTokens: number, charsPerToken = 4): string[] {
    const maxChars = maxTokens * charsPerToken;
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + maxChars));
      start += maxChars;
    }
    return chunks;
  }

  /** Reset builder state */
  reset(): this {
    this._system = undefined;
    this._messages.length = 0;
    this._examples.length = 0;
    return this;
  }
}
