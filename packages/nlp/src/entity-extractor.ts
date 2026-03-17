/**
 * Rule-based named entity recognition.
 * Supports pattern matching for emails, URLs, dates, numbers, currencies,
 * capitalized proper nouns, and custom user-defined patterns.
 */

import type { Entity, EntityType } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in patterns
// ---------------------------------------------------------------------------

interface PatternRule {
  type: EntityType;
  pattern: RegExp;
}

const BUILT_IN_PATTERNS: PatternRule[] = [
  // Email – must come before URL
  {
    type: "EMAIL",
    pattern: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g,
  },
  // URL
  {
    type: "URL",
    pattern: /https?:\/\/[^\s\])'">]+|www\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s\])'">]*/g,
  },
  // Currency – $, €, £, ¥ followed by number
  {
    type: "CURRENCY",
    pattern: /[$€£¥₩]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion|thousand|k|m|b))?/gi,
  },
  // Date – various common formats
  {
    type: "DATE",
    pattern:
      /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+\d{4})?)\b/gi,
  },
  // Number – standalone integers and decimals (not already matched as currency/date)
  {
    type: "NUMBER",
    pattern: /\b\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion|thousand|percent|%))?\b/g,
  },
];

// ---------------------------------------------------------------------------
// Capitalized word heuristics for proper nouns
// ---------------------------------------------------------------------------

// Common English words that start a sentence – not proper nouns
const SENTENCE_STARTERS = new Set([
  "The", "A", "An", "This", "That", "These", "Those", "It", "He", "She",
  "They", "We", "I", "You", "In", "On", "At", "By", "For", "With", "As",
  "But", "And", "Or", "So", "Yet", "Nor", "If", "When", "While", "After",
  "Before", "Since", "Although", "However", "Therefore", "Thus", "Hence",
  "Moreover", "Furthermore", "Nevertheless", "Meanwhile", "Indeed",
]);

// Known organization suffixes
const ORG_SUFFIXES = new Set([
  "Inc", "Corp", "Ltd", "LLC", "LLP", "Co", "Company", "Corporation",
  "Group", "Holdings", "Industries", "Technologies", "Solutions",
  "Institute", "University", "College", "School", "Foundation",
  "Association", "Organization", "Department", "Ministry", "Agency",
  "Committee", "Council", "Commission", "Bureau", "Office",
]);

// Known location words
const LOCATION_WORDS = new Set([
  "Street", "St", "Avenue", "Ave", "Boulevard", "Blvd", "Road", "Rd",
  "Lane", "Drive", "Dr", "Court", "Ct", "Place", "Pl", "Square", "Sq",
  "City", "Town", "Village", "District", "County", "State", "Province",
  "Country", "Region", "Territory", "Island", "Mountain", "River", "Lake",
  "Ocean", "Sea", "Bay", "Gulf", "Cape", "Valley", "Desert", "Forest",
  "Park", "Garden", "Airport", "Station", "Port", "Harbor",
]);

// ---------------------------------------------------------------------------
// Entity extractor
// ---------------------------------------------------------------------------

export interface EntityExtractorOptions {
  /** Which entity types to detect (default: all) */
  enabledTypes?: Set<EntityType>;
  /** Merge adjacent entities of the same type within this char distance */
  mergeDistance?: number;
  /** Custom pattern rules added on top of built-ins */
  customPatterns?: Array<{ type: EntityType; pattern: RegExp }>;
}

export class EntityExtractor {
  private readonly enabledTypes: Set<EntityType>;
  private readonly mergeDistance: number;
  private readonly patterns: PatternRule[];

  constructor(options: EntityExtractorOptions = {}) {
    this.enabledTypes = options.enabledTypes ?? new Set<EntityType>([
      "EMAIL", "URL", "DATE", "NUMBER", "CURRENCY",
      "PERSON", "ORGANIZATION", "LOCATION", "MISC",
    ]);
    this.mergeDistance = options.mergeDistance ?? 1;
    this.patterns = [
      ...BUILT_IN_PATTERNS,
      ...(options.customPatterns ?? []),
    ];
  }

  /**
   * Register an additional custom pattern at runtime.
   */
  registerPattern(type: EntityType, pattern: RegExp): void {
    this.patterns.push({ type, pattern });
  }

  extract(text: string): Entity[] {
    const entities: Entity[] = [];

    // 1. Pattern-based extraction
    for (const rule of this.patterns) {
      if (!this.enabledTypes.has(rule.type)) continue;
      // Reset lastIndex – patterns must have /g flag
      const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        entities.push({
          name: match[0],
          type: rule.type,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    // 2. Capitalized word / proper noun detection
    if (
      this.enabledTypes.has("PERSON") ||
      this.enabledTypes.has("ORGANIZATION") ||
      this.enabledTypes.has("LOCATION") ||
      this.enabledTypes.has("MISC")
    ) {
      const properNounEntities = this.extractProperNouns(text, entities);
      entities.push(...properNounEntities);
    }

    // 3. Remove overlapping (keep longest match)
    const deduped = this.removeOverlaps(entities);

    // 4. Merge adjacent same-type entities
    const merged = this.mergeAdjacent(deduped, text);

    return merged.sort((a, b) => a.start - b.start);
  }

  // ---------------------------------------------------------------------------
  // Proper noun extraction
  // ---------------------------------------------------------------------------

  private extractProperNouns(text: string, existing: Entity[]): Entity[] {
    // Build a set of already-covered ranges
    const covered = this.buildCoveredSet(existing);

    const entities: Entity[] = [];

    // Match sequences of capitalized words (possibly with conjunctions: "of", "and", "the")
    const re = /\b([A-Z][a-zA-Z'\-]+(?:\s+(?:of|and|the|de|van|von|du|la|le)\s+[A-Z][a-zA-Z'\-]+|\s+[A-Z][a-zA-Z'\-]+)*)\b/g;

    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const name = match[0];
      const start = match.index;
      const end = start + name.length;

      // Skip if already covered by pattern-based entity
      if (this.isCovered(start, end, covered)) continue;

      // Skip common sentence starters when at start of sentence
      const prevChar = text[start - 1] ?? "";
      const isAfterSentenceEnd = /[.!?]\s*$/.test(text.slice(0, start));
      if (isAfterSentenceEnd && SENTENCE_STARTERS.has(name.split(" ")[0]!)) continue;

      // Skip if it's a single word and is a sentence starter
      const words = name.split(/\s+/);
      if (words.length === 1 && SENTENCE_STARTERS.has(name)) continue;

      // Classify
      const type = this.classifyProperNoun(words);
      if (!this.enabledTypes.has(type)) continue;

      entities.push({ name, type, start, end });
    }

    return entities;
  }

  private classifyProperNoun(words: string[]): EntityType {
    const last = words[words.length - 1] ?? "";
    if (ORG_SUFFIXES.has(last)) return "ORGANIZATION";
    if (LOCATION_WORDS.has(last)) return "LOCATION";

    // Heuristic: single capitalized word → PERSON or MISC
    // Multi-word without known suffix → depends on count
    if (words.length >= 2 && words.length <= 3) {
      // Two or three words, no org/location suffix → likely a PERSON name
      return "PERSON";
    }
    if (words.length > 3) {
      return "ORGANIZATION";
    }
    return "MISC";
  }

  // ---------------------------------------------------------------------------
  // Overlap removal
  // ---------------------------------------------------------------------------

  private removeOverlaps(entities: Entity[]): Entity[] {
    if (entities.length === 0) return [];
    const sorted = [...entities].sort((a, b) => a.start - b.start || b.end - a.end);
    const result: Entity[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const prev = result[result.length - 1]!;
      const curr = sorted[i]!;
      if (curr.start >= prev.end) {
        result.push(curr);
      } else if (curr.end > prev.end) {
        // Partial overlap – keep the longer one
        result[result.length - 1] = curr.end - curr.start >= prev.end - prev.start ? curr : prev;
      }
      // Otherwise curr is fully contained in prev – skip
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Adjacent merge
  // ---------------------------------------------------------------------------

  private mergeAdjacent(entities: Entity[], text: string): Entity[] {
    if (entities.length <= 1) return entities;

    const result: Entity[] = [];
    let i = 0;

    while (i < entities.length) {
      let current = entities[i]!;
      let j = i + 1;

      while (j < entities.length) {
        const next = entities[j]!;
        const gap = next.start - current.end;
        if (next.type === current.type && gap <= this.mergeDistance) {
          // Merge: extend current to include next
          current = {
            name: text.slice(current.start, next.end),
            type: current.type,
            start: current.start,
            end: next.end,
          };
          j++;
        } else {
          break;
        }
      }

      result.push(current);
      i = j;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildCoveredSet(entities: Entity[]): Array<[number, number]> {
    return entities.map((e) => [e.start, e.end]);
  }

  private isCovered(
    start: number,
    end: number,
    covered: Array<[number, number]>,
  ): boolean {
    for (const [s, e] of covered) {
      if (start >= s && end <= e) return true;
      if (start < e && end > s) return true; // any overlap
    }
    return false;
  }
}
