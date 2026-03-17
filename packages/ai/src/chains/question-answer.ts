/**
 * QAChain - answer questions about the knowledge graph using RAG pattern.
 */

import { AIProvider, ChatMessage, CompletionOptions } from '../types.js';
import { PromptBuilder } from '../prompt-builder.js';

// ─── Context node (from knowledge graph) ─────────────────────────────────────

export interface ContextNode {
  id: string;
  content: string;
  /** Relevance score from retrieval (0–1) */
  score?: number;
  /** Optional source label, e.g. "document", "entity" */
  source?: string;
  metadata?: Record<string, string>;
}

// ─── QA options ───────────────────────────────────────────────────────────────

export interface QAOptions extends CompletionOptions {
  /** Maximum number of context nodes to include (default: 5) */
  maxContextNodes?: number;
  /** Whether to include source citations in the answer */
  citeSources?: boolean;
  /** Whether to detect and return follow-up questions */
  detectFollowUps?: boolean;
  /** Fallback answer when no relevant context is found */
  fallbackAnswer?: string;
  /** Minimum relevance score for including a context node (default: 0) */
  minRelevanceScore?: number;
}

// ─── QA result ────────────────────────────────────────────────────────────────

export interface Citation {
  nodeId: string;
  source?: string;
  excerpt: string;
}

export interface QAResult {
  answer: string;
  citations: Citation[];
  followUpQuestions: string[];
  /** Whether the answer was grounded in provided context */
  grounded: boolean;
  /** IDs of context nodes used */
  usedContextIds: string[];
}

// ─── Conversation history entry ────────────────────────────────────────────────

export interface ConversationTurn {
  question: string;
  answer: string;
}

// ─── QAChain class ────────────────────────────────────────────────────────────

export class QAChain {
  private readonly provider: AIProvider;
  private readonly conversationHistory: ConversationTurn[] = [];

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Answer a question given retrieved context nodes.
   */
  async answer(
    question: string,
    contextNodes: ContextNode[],
    options: QAOptions = {},
  ): Promise<QAResult> {
    const {
      maxContextNodes = 5,
      citeSources = true,
      detectFollowUps = true,
      minRelevanceScore = 0,
    } = options;

    // Filter and rank context nodes
    const filtered = contextNodes
      .filter((n) => (n.score ?? 1) >= minRelevanceScore)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxContextNodes);

    // Format context
    const contextText = this.formatContext(filtered, citeSources);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(citeSources, detectFollowUps);

    // Include recent conversation history for multi-turn support
    const history = this.conversationHistory.slice(-3);
    const historyText =
      history.length > 0
        ? history.map((t) => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n') + '\n\n'
        : '';

    const userMessage = `${historyText}Context:\n${contextText}\n\nQuestion: ${question}`;

    const messages: ChatMessage[] = new PromptBuilder()
      .system(systemPrompt)
      .user(userMessage)
      .build();

    const result = await this.provider.complete(messages, options);

    // Parse response
    const parsed = this.parseResponse(result.text, filtered, citeSources, detectFollowUps);

    // Record in conversation history
    this.conversationHistory.push({ question, answer: parsed.answer });

    return parsed;
  }

  /**
   * Answer without any context (direct LLM knowledge).
   */
  async answerDirect(question: string, options: QAOptions = {}): Promise<QAResult> {
    const messages: ChatMessage[] = new PromptBuilder()
      .system('You are a helpful and knowledgeable assistant. Answer questions clearly and accurately.')
      .user(question)
      .build();

    const result = await this.provider.complete(messages, options);
    return {
      answer: result.text.trim(),
      citations: [],
      followUpQuestions: [],
      grounded: false,
      usedContextIds: [],
    };
  }

  /**
   * Check whether a question can be answered from the given context.
   */
  async isAnswerable(question: string, contextNodes: ContextNode[]): Promise<boolean> {
    if (contextNodes.length === 0) return false;
    const contextText = contextNodes.map((n) => n.content).join('\n');
    const messages: ChatMessage[] = new PromptBuilder()
      .system(
        'Determine whether the question can be answered from the provided context. Respond with only "yes" or "no".',
      )
      .user(`Context:\n${contextText}\n\nQuestion: ${question}`)
      .build();

    const result = await this.provider.complete(messages, { maxTokens: 10, temperature: 0 });
    return result.text.trim().toLowerCase().startsWith('yes');
  }

  /** Clear conversation history. */
  clearHistory(): void {
    this.conversationHistory.length = 0;
  }

  /** Return the current conversation history. */
  getHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private formatContext(nodes: ContextNode[], includIds: boolean): string {
    if (nodes.length === 0) return '(no context provided)';
    return nodes
      .map((n, i) => {
        const id = includIds ? `[${i + 1}] (id: ${n.id})` : `[${i + 1}]`;
        const src = n.source ? ` [${n.source}]` : '';
        return `${id}${src}\n${n.content}`;
      })
      .join('\n\n');
  }

  private buildSystemPrompt(citeSources: boolean, detectFollowUps: boolean): string {
    const citeInstr = citeSources
      ? '\n- Cite sources using [1], [2], etc. corresponding to the context numbers.'
      : '';
    const followUpInstr = detectFollowUps
      ? '\n- After your answer, add a section "Follow-up questions:" with 2-3 related questions the user might want to ask.'
      : '';
    const groundingInstr =
      '\n- Base your answer only on the provided context. If the answer is not in the context, say "I don\'t have enough information to answer that."';

    return `You are a precise question-answering assistant.${groundingInstr}${citeInstr}${followUpInstr}`;
  }

  private parseResponse(
    raw: string,
    contextNodes: ContextNode[],
    citeSources: boolean,
    detectFollowUps: boolean,
  ): QAResult {
    let answer = raw.trim();
    const followUpQuestions: string[] = [];
    const citations: Citation[] = [];

    // Extract follow-up questions section
    if (detectFollowUps) {
      const followUpMatch = raw.match(/follow[- ]up questions?:?\s*([\s\S]*?)(?:\n\n|$)/i);
      if (followUpMatch) {
        const block = followUpMatch[1]!;
        const questions = block
          .split('\n')
          .map((l) => l.replace(/^[\d.\-*]\s*/, '').trim())
          .filter((l) => l.length > 0 && l.endsWith('?'));
        followUpQuestions.push(...questions);
        // Remove the follow-up section from the answer
        answer = raw.replace(followUpMatch[0], '').trim();
      }
    }

    // Extract citation references [1], [2] etc.
    if (citeSources) {
      const cited = new Set<number>();
      const refs = answer.matchAll(/\[(\d+)\]/g);
      for (const ref of refs) {
        cited.add(parseInt(ref[1]!, 10));
      }
      for (const idx of cited) {
        const node = contextNodes[idx - 1];
        if (node) {
          citations.push({
            nodeId: node.id,
            source: node.source,
            excerpt: node.content.slice(0, 200),
          });
        }
      }
    }

    const grounded =
      !answer.toLowerCase().includes("don't have enough information") &&
      !answer.toLowerCase().includes("i don't know");

    const usedContextIds = citations.map((c) => c.nodeId);

    return { answer, citations, followUpQuestions, grounded, usedContextIds };
  }
}
