import { randomUUID } from "crypto";
import type { CreateNode, CreateEdge } from "@nexus/shared";
import type {
  Importer,
  ImportOptions,
  ImportResult,
  ImportWarning,
  ImportError,
  ParsedJSONDocument,
  ValidationResult,
} from "../types.js";
import { detectNodeType, extractTitle } from "../transforms.js";

// JSON-LD context keywords
const JSON_LD_KEYWORDS = new Set(["@context", "@id", "@type", "@value", "@graph", "@list"]);

export class JSONImporter implements Importer<ParsedJSONDocument> {
  readonly name = "json";
  readonly supportedExtensions = [".json", ".jsonl", ".ndjson"];

  async parse(content: string, _source?: string): Promise<ParsedJSONDocument> {
    let root: unknown;
    try {
      root = JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON: ${String(e)}`);
    }

    const depth = this.measureDepth(root, 0);
    const isArray = Array.isArray(root);
    const isJsonLd = this.detectJsonLd(root);
    const nodeCount = this.estimateNodeCount(root);

    return { root, nodeCount, depth, isArray, isJsonLd };
  }

  validate(parsed: ParsedJSONDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (parsed.root === null || parsed.root === undefined) {
      errors.push("JSON root is null or undefined");
    }

    if (parsed.depth > 10) {
      warnings.push(`Deeply nested JSON (depth=${parsed.depth}); some nesting will be flattened`);
    }

    if (parsed.nodeCount > 10_000) {
      warnings.push(`Large JSON (~${parsed.nodeCount} potential nodes); consider chunking`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async import(parsed: ParsedJSONDocument, options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const nodes: CreateNode[] = [];
    const edges: CreateEdge[] = [];
    const warnings: ImportWarning[] = [];
    const errors: ImportError[] = [];

    options.onProgress?.({
      phase: "parsing",
      current: 0,
      total: parsed.nodeCount,
      percentage: 0,
      message: "Starting JSON import",
    });

    if (parsed.isJsonLd) {
      this.importJsonLd(parsed.root, nodes, edges, warnings, errors, options);
    } else if (parsed.isArray) {
      this.importArray(parsed.root as unknown[], nodes, edges, warnings, errors, options);
    } else {
      this.importObject(parsed.root as Record<string, unknown>, nodes, edges, warnings, errors, options, "root");
    }

    options.onProgress?.({
      phase: "importing",
      current: nodes.length,
      total: nodes.length,
      percentage: 100,
      message: `Imported ${nodes.length} nodes`,
    });

    return {
      nodes,
      edges,
      warnings,
      errors,
      stats: {
        totalProcessed: parsed.nodeCount,
        nodesCreated: nodes.length,
        edgesCreated: edges.length,
        duplicatesSkipped: 0,
        errorsEncountered: errors.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Import a JSON array: each item becomes a node
  private importArray(
    arr: unknown[],
    nodes: CreateNode[],
    edges: CreateEdge[],
    warnings: ImportWarning[],
    errors: ImportError[],
    options: ImportOptions,
  ): void {
    const parentId = randomUUID();

    // Create a container node for the array
    nodes.push({
      type: "document",
      title: "JSON Array Import",
      content: undefined,
      metadata: { itemCount: arr.length, source: "json-array" },
      ownerId: options.ownerId,
    });

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const itemId = randomUUID();

      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        const title = extractTitle(obj) ?? `Item ${i + 1}`;
        const content = this.extractContent(obj);
        const type = detectNodeType(String(obj["type"] ?? ""), title, content ?? "");

        nodes.push({
          type,
          title: title.slice(0, 500),
          content: content?.slice(0, 100_000) ?? undefined,
          metadata: this.flattenMetadata(obj, ["title", "name", "label", "content", "body", "type"]),
          ownerId: options.ownerId,
        });

        edges.push({
          type: "contains",
          sourceId: parentId,
          targetId: itemId,
          weight: 1,
          metadata: { index: i },
        });

        // Recurse into nested arrays/objects
        this.processNestedFields(obj, itemId, nodes, edges, warnings, options, 1);
      } else if (typeof item === "string" || typeof item === "number") {
        nodes.push({
          type: "concept",
          title: String(item).slice(0, 500),
          content: undefined,
          metadata: { index: i, primitiveValue: true },
          ownerId: options.ownerId,
        });

        edges.push({
          type: "contains",
          sourceId: parentId,
          targetId: itemId,
          weight: 1,
          metadata: { index: i },
        });
      } else {
        warnings.push({ message: `Item ${i}: unsupported type ${typeof item}` });
      }

      void errors;
    }
  }

  // Import a JSON object: keys become edges, nested objects become child nodes
  private importObject(
    obj: Record<string, unknown>,
    nodes: CreateNode[],
    edges: CreateEdge[],
    warnings: ImportWarning[],
    errors: ImportError[],
    options: ImportOptions,
    label: string,
  ): void {
    const title = extractTitle(obj) ?? label;
    const content = this.extractContent(obj);
    const type = detectNodeType(String(obj["type"] ?? ""), title, content ?? "");
    const rootId = randomUUID();

    nodes.push({
      type,
      title: title.slice(0, 500),
      content: content?.slice(0, 100_000) ?? undefined,
      metadata: this.flattenMetadata(obj, ["title", "name", "label", "content", "body", "type"]),
      ownerId: options.ownerId,
    });

    this.processNestedFields(obj, rootId, nodes, edges, warnings, options, 0);

    void errors;
  }

  // Process nested object/array fields, creating child nodes
  private processNestedFields(
    obj: Record<string, unknown>,
    parentId: string,
    nodes: CreateNode[],
    edges: CreateEdge[],
    warnings: ImportWarning[],
    options: ImportOptions,
    depth: number,
  ): void {
    if (depth > 5) return; // limit recursion

    for (const [key, value] of Object.entries(obj)) {
      if (["title", "name", "label", "id", "type", "content", "body", "description"].includes(key)) {
        continue; // already used for the parent node
      }

      if (Array.isArray(value) && value.length > 0) {
        const childId = randomUUID();
        nodes.push({
          type: "concept",
          title: key,
          content: undefined,
          metadata: { arrayKey: true, itemCount: value.length },
          ownerId: options.ownerId,
        });
        edges.push({
          type: "contains",
          sourceId: parentId,
          targetId: childId,
          weight: 1,
          metadata: { key },
        });

        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "object" && item !== null) {
            this.processNestedFields(
              item as Record<string, unknown>,
              childId,
              nodes,
              edges,
              warnings,
              options,
              depth + 1,
            );
          }
        }
      } else if (typeof value === "object" && value !== null) {
        const nested = value as Record<string, unknown>;
        const childTitle = extractTitle(nested) ?? key;
        const childId = randomUUID();
        nodes.push({
          type: "concept",
          title: childTitle.slice(0, 500),
          content: this.extractContent(nested)?.slice(0, 10_000) ?? undefined,
          metadata: { parentKey: key },
          ownerId: options.ownerId,
        });
        edges.push({
          type: "contains",
          sourceId: parentId,
          targetId: childId,
          weight: 1,
          metadata: { key },
        });
        this.processNestedFields(nested, childId, nodes, edges, warnings, options, depth + 1);
      }
    }
  }

  // Import JSON-LD structured data
  private importJsonLd(
    root: unknown,
    nodes: CreateNode[],
    edges: CreateEdge[],
    warnings: ImportWarning[],
    errors: ImportError[],
    options: ImportOptions,
  ): void {
    const graph: unknown[] = [];

    if (Array.isArray(root)) {
      graph.push(...root);
    } else if (typeof root === "object" && root !== null) {
      const obj = root as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) {
        graph.push(...(obj["@graph"] as unknown[]));
      } else {
        graph.push(obj);
      }
    }

    const idToNodeTitle = new Map<string, string>();

    // First pass: create nodes
    for (const item of graph) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const id = String(obj["@id"] ?? randomUUID());
      const rawType = obj["@type"];
      const typeName = Array.isArray(rawType) ? String(rawType[0] ?? "") : String(rawType ?? "");
      const title = extractTitle(obj) ?? typeName ?? id;
      const type = detectNodeType(typeName, title, "");

      const metadata: Record<string, unknown> = { jsonLdId: id, jsonLdType: rawType };
      for (const [key, val] of Object.entries(obj)) {
        if (!JSON_LD_KEYWORDS.has(key)) {
          metadata[key] = val;
        }
      }

      nodes.push({
        type,
        title: title.slice(0, 500),
        content: undefined,
        metadata,
        ownerId: options.ownerId,
      });

      idToNodeTitle.set(id, title);
    }

    // Second pass: resolve @id references as edges
    for (const item of graph) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;
      const srcId = String(obj["@id"] ?? "");
      if (!srcId) continue;

      for (const [key, val] of Object.entries(obj)) {
        if (JSON_LD_KEYWORDS.has(key)) continue;
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          const valObj = val as Record<string, unknown>;
          const targetRef = String(valObj["@id"] ?? "");
          if (targetRef && idToNodeTitle.has(targetRef)) {
            edges.push({
              type: "references",
              sourceId: srcId,
              targetId: targetRef,
              weight: 1,
              metadata: { predicate: key },
            });
          }
        }
      }
    }

    void warnings;
    void errors;
  }

  private extractContent(obj: Record<string, unknown>): string | null {
    for (const key of ["content", "body", "description", "text", "summary"]) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) return val;
    }
    return null;
  }

  private flattenMetadata(
    obj: Record<string, unknown>,
    exclude: string[],
  ): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (exclude.includes(key)) continue;
      if (typeof val !== "object" || val === null) {
        meta[key] = val;
      }
    }
    return meta;
  }

  private measureDepth(value: unknown, current: number): number {
    if (typeof value !== "object" || value === null) return current;
    if (Array.isArray(value)) {
      return Math.max(...value.map((v) => this.measureDepth(v, current + 1)), current);
    }
    const depths = Object.values(value as Record<string, unknown>).map((v) =>
      this.measureDepth(v, current + 1),
    );
    return depths.length > 0 ? Math.max(...depths) : current;
  }

  private estimateNodeCount(value: unknown): number {
    if (typeof value !== "object" || value === null) return 0;
    if (Array.isArray(value)) return value.length + value.reduce((s, v) => s + this.estimateNodeCount(v), 0);
    return 1 + Object.values(value as Record<string, unknown>).reduce(
      (s, v) => s + this.estimateNodeCount(v), 0,
    );
  }

  private detectJsonLd(root: unknown): boolean {
    if (typeof root !== "object" || root === null) return false;
    const obj = root as Record<string, unknown>;
    return "@context" in obj || "@graph" in obj || "@type" in obj;
  }
}
