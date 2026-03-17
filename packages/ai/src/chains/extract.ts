/**
 * ExtractChain - extract entities and relationships from text using AI.
 */

import { AIProvider, ChatMessage, CompletionOptions } from '../types.js';
import { PromptBuilder } from '../prompt-builder.js';

// ─── Entity extraction ────────────────────────────────────────────────────────

export interface EntitySchema {
  /** Entity type label, e.g. "Person", "Organization" */
  type: string;
  /** Optional description for the LLM */
  description?: string;
  /** Example values */
  examples?: string[];
}

export interface ExtractedEntity {
  text: string;
  type: string;
  /** Start character offset in source text (if detected) */
  start?: number;
  /** End character offset in source text (if detected) */
  end?: number;
  /** Confidence score (0–1) */
  confidence?: number;
}

export interface EntityExtractionOptions extends CompletionOptions {
  /** Schema of entity types to look for */
  schema: EntitySchema[];
  /** Whether to deduplicate entities by text+type */
  deduplicate?: boolean;
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  rawResponse: string;
}

// ─── Relationship extraction ──────────────────────────────────────────────────

export interface RelationSchema {
  /** Relation name, e.g. "works_at", "located_in" */
  name: string;
  description?: string;
  /** Allowed source entity types */
  sourceTypes?: string[];
  /** Allowed target entity types */
  targetTypes?: string[];
}

export interface ExtractedRelation {
  source: string;
  relation: string;
  target: string;
  /** Original sentence where the relation was found */
  evidence?: string;
  confidence?: number;
}

export interface RelationExtractionOptions extends CompletionOptions {
  schema: RelationSchema[];
  /** Known entities to use as anchors (optional) */
  entities?: string[];
}

export interface RelationExtractionResult {
  relations: ExtractedRelation[];
  rawResponse: string;
}

// ─── ExtractChain class ───────────────────────────────────────────────────────

export class ExtractChain {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Extract named entities from text.
   */
  async extractEntities(
    text: string,
    options: EntityExtractionOptions,
  ): Promise<EntityExtractionResult> {
    const schemaDesc = options.schema
      .map((s) => {
        const examples = s.examples ? ` (e.g. ${s.examples.join(', ')})` : '';
        const desc = s.description ? ` - ${s.description}` : '';
        return `- ${s.type}${desc}${examples}`;
      })
      .join('\n');

    const messages: ChatMessage[] = new PromptBuilder()
      .system(
        `You are an information extraction assistant. Extract named entities from the text.
Return ONLY a JSON array of objects with this shape:
[{"text": "entity text", "type": "EntityType", "confidence": 0.0}]

Entity types to extract:
${schemaDesc}

If no entities are found, return an empty array [].`,
      )
      .user(text)
      .build();

    const result = await this.provider.complete(messages, options);
    const rawResponse = result.text.trim();

    let entities: ExtractedEntity[] = [];
    try {
      const match = rawResponse.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
        entities = parsed
          .filter((e) => typeof e['text'] === 'string' && typeof e['type'] === 'string')
          .map((e) => ({
            text: e['text'] as string,
            type: e['type'] as string,
            confidence: typeof e['confidence'] === 'number' ? e['confidence'] : undefined,
          }));
      }
    } catch {
      // Return empty on parse failure
    }

    if (options.deduplicate) {
      const seen = new Set<string>();
      entities = entities.filter((e) => {
        const key = `${e.type}::${e.text.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Annotate character offsets where possible
    for (const entity of entities) {
      const idx = text.indexOf(entity.text);
      if (idx >= 0) {
        entity.start = idx;
        entity.end = idx + entity.text.length;
      }
    }

    return { entities, rawResponse };
  }

  /**
   * Extract relationships between entities from text.
   */
  async extractRelations(
    text: string,
    options: RelationExtractionOptions,
  ): Promise<RelationExtractionResult> {
    const schemaDesc = options.schema
      .map((r) => {
        const src = r.sourceTypes ? ` [source: ${r.sourceTypes.join('|')}]` : '';
        const tgt = r.targetTypes ? ` [target: ${r.targetTypes.join('|')}]` : '';
        const desc = r.description ? ` - ${r.description}` : '';
        return `- ${r.name}${src}${tgt}${desc}`;
      })
      .join('\n');

    const entityHint =
      options.entities && options.entities.length > 0
        ? `\nKnown entities: ${options.entities.join(', ')}\n`
        : '';

    const messages: ChatMessage[] = new PromptBuilder()
      .system(
        `You are a relationship extraction assistant. Extract relationships from the text.
Return ONLY a JSON array of objects with this shape:
[{"source": "entity1", "relation": "relation_name", "target": "entity2", "evidence": "sentence where found", "confidence": 0.0}]

Relation types to extract:
${schemaDesc}
${entityHint}
If no relationships are found, return an empty array [].`,
      )
      .user(text)
      .build();

    const result = await this.provider.complete(messages, options);
    const rawResponse = result.text.trim();

    let relations: ExtractedRelation[] = [];
    try {
      const match = rawResponse.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
        relations = parsed
          .filter(
            (r) =>
              typeof r['source'] === 'string' &&
              typeof r['relation'] === 'string' &&
              typeof r['target'] === 'string',
          )
          .map((r) => ({
            source: r['source'] as string,
            relation: r['relation'] as string,
            target: r['target'] as string,
            evidence: typeof r['evidence'] === 'string' ? r['evidence'] : undefined,
            confidence: typeof r['confidence'] === 'number' ? r['confidence'] : undefined,
          }));
      }
    } catch {
      // Return empty on parse failure
    }

    return { relations, rawResponse };
  }

  /**
   * Extract both entities and relations in a single call.
   */
  async extractAll(
    text: string,
    entityOptions: EntityExtractionOptions,
    relationOptions: Omit<RelationExtractionOptions, 'entities'>,
  ): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
    const { entities } = await this.extractEntities(text, entityOptions);
    const entityTexts = entities.map((e) => e.text);
    const { relations } = await this.extractRelations(text, {
      ...relationOptions,
      entities: entityTexts,
    });
    return { entities, relations };
  }
}
