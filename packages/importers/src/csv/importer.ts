import { randomUUID } from "crypto";
import type { CreateNode, CreateEdge } from "@nexus/shared";
import type {
  Importer,
  ImportOptions,
  ImportResult,
  ImportWarning,
  ImportError,
  ParsedCSVDocument,
  ColumnMapping,
  CSVParseOptions,
  ValidationResult,
} from "../types.js";
import { CSVParser } from "./parser.js";
import { detectNodeType } from "../transforms.js";

export interface CSVImportOptions extends ImportOptions {
  columnMapping?: ColumnMapping;
  csvOptions?: CSVParseOptions;
  // If set, rows with this column populated create edges instead of nodes
  edgeMode?: boolean;
}

export class CSVImporter implements Importer<ParsedCSVDocument> {
  readonly name = "csv";
  readonly supportedExtensions = [".csv", ".tsv"];

  private parser = new CSVParser();

  async parse(content: string, _source?: string): Promise<ParsedCSVDocument> {
    const delimiter = this.parser.detectDelimiter(content);
    return this.parser.parse(content, { delimiter, headers: true, skipEmptyLines: true, trim: true });
  }

  validate(parsed: ParsedCSVDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (parsed.headers.length === 0) {
      errors.push("CSV has no headers");
    }

    if (parsed.totalRows === 0) {
      warnings.push("CSV has no data rows");
    }

    if (parsed.totalRows > 100_000) {
      warnings.push(`Large CSV (${parsed.totalRows} rows) — consider chunking`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async import(parsed: ParsedCSVDocument, options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const csvOptions = options as CSVImportOptions;
    const { ownerId, onProgress, batchSize = 100 } = options;
    const mapping = this.buildColumnMapping(parsed.headers, parsed.detectedTypes, csvOptions.columnMapping);

    const nodes: CreateNode[] = [];
    const edges: CreateEdge[] = [];
    const warnings: ImportWarning[] = [];
    const errors: ImportError[] = [];

    // Index nodes by their source ID for edge resolution
    const idToNodeTitle = new Map<string, string>();

    const isEdgeMode = csvOptions.edgeMode === true ||
      (mapping.sourceId !== undefined && mapping.targetId !== undefined);

    const totalBatches = Math.ceil(parsed.rows.length / batchSize);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * batchSize;
      const batchRows = parsed.rows.slice(batchStart, batchStart + batchSize);

      for (let rowIdx = 0; rowIdx < batchRows.length; rowIdx++) {
        const row = batchRows[rowIdx];
        if (!row) continue;
        const lineNum = batchStart + rowIdx + 2; // +2: 1-indexed + header row

        if (isEdgeMode) {
          const edge = this.rowToEdge(row, mapping, lineNum, warnings, errors);
          if (edge) edges.push(edge);
        } else {
          const node = this.rowToNode(row, mapping, ownerId, lineNum, warnings, errors);
          if (node) {
            // Track original ID for edge resolution
            const srcId = row[mapping.id ?? ""] ?? "";
            if (srcId) idToNodeTitle.set(srcId, node.title);
            nodes.push(node);
          }
        }
      }

      onProgress?.({
        phase: "importing",
        current: Math.min(batchStart + batchSize, parsed.rows.length),
        total: parsed.rows.length,
        percentage: Math.round(((batchIdx + 1) / totalBatches) * 100),
        message: `Processed batch ${batchIdx + 1}/${totalBatches}`,
      });
    }

    return {
      nodes,
      edges,
      warnings,
      errors,
      stats: {
        totalProcessed: parsed.totalRows,
        nodesCreated: nodes.length,
        edgesCreated: edges.length,
        duplicatesSkipped: 0,
        errorsEncountered: errors.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Convert a CSV row to a CreateNode
  private rowToNode(
    row: Record<string, string>,
    mapping: ColumnMapping,
    ownerId: string,
    line: number,
    warnings: ImportWarning[],
    _errors: ImportError[],
  ): CreateNode | null {
    const title = row[mapping.title ?? ""] ?? row["title"] ?? row["name"] ?? row["label"] ?? "";

    if (!title.trim()) {
      warnings.push({ message: `Row ${line}: no title found, skipping`, line });
      return null;
    }

    const content = row[mapping.content ?? ""] ?? row["content"] ?? row["body"] ?? row["description"];
    const rawType = row[mapping.type ?? ""] ?? row["type"] ?? "";
    const type = detectNodeType(rawType, title, content ?? "");

    const tagsRaw = row[mapping.tags ?? ""] ?? row["tags"] ?? "";
    const tags = tagsRaw
      ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
      : [];

    // Collect remaining columns as metadata
    const reservedCols = new Set(Object.values(mapping).filter(Boolean) as string[]);
    const metadata: Record<string, unknown> = { tags };
    for (const [key, value] of Object.entries(row)) {
      if (!reservedCols.has(key) && value !== "") {
        metadata[key] = value;
      }
    }

    return {
      type,
      title: title.trim().slice(0, 500),
      content: content?.trim().slice(0, 100_000) ?? undefined,
      metadata,
      ownerId,
    };
  }

  // Convert a CSV row to a CreateEdge
  private rowToEdge(
    row: Record<string, string>,
    mapping: ColumnMapping,
    line: number,
    warnings: ImportWarning[],
    errors: ImportError[],
  ): CreateEdge | null {
    const sourceId = row[mapping.sourceId ?? ""] ?? row["source_id"] ?? row["from"] ?? "";
    const targetId = row[mapping.targetId ?? ""] ?? row["target_id"] ?? row["to"] ?? "";

    if (!sourceId) {
      errors.push({ message: `Row ${line}: missing sourceId`, line, fatal: false });
      return null;
    }
    if (!targetId) {
      errors.push({ message: `Row ${line}: missing targetId`, line, fatal: false });
      return null;
    }

    const rawEdgeType = row[mapping.edgeType ?? ""] ?? row["type"] ?? row["edge_type"] ?? "related_to";
    const edgeType = this.parseEdgeType(rawEdgeType);

    const weightRaw = row["weight"] ?? row["strength"] ?? "";
    const weight = weightRaw ? Math.min(1, Math.max(0, parseFloat(weightRaw))) : 1;

    const reservedCols = new Set(["source_id", "target_id", "from", "to", "type", "edge_type", "weight"]);
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!reservedCols.has(key) && value !== "") {
        metadata[key] = value;
      }
    }

    void warnings;

    return {
      type: edgeType,
      sourceId,
      targetId,
      weight: isNaN(weight) ? 1 : weight,
      metadata,
    };
  }

  // Build column mapping by combining auto-detection with user overrides
  private buildColumnMapping(
    headers: string[],
    _detectedTypes: Record<string, string>,
    userMapping?: ColumnMapping,
  ): ColumnMapping {
    const mapping: ColumnMapping = {};

    // Auto-map by common names
    for (const header of headers) {
      const lower = header.toLowerCase();
      if (!mapping.title && /^(title|name|label|heading)$/.test(lower)) mapping.title = header;
      if (!mapping.content && /^(content|body|text|description|summary)$/.test(lower)) mapping.content = header;
      if (!mapping.type && /^(type|kind|category)$/.test(lower)) mapping.type = header;
      if (!mapping.id && /^(id|uuid|key)$/.test(lower)) mapping.id = header;
      if (!mapping.tags && /^(tags?|labels?)$/.test(lower)) mapping.tags = header;
      if (!mapping.sourceId && /^(source_?id|from|src)$/.test(lower)) mapping.sourceId = header;
      if (!mapping.targetId && /^(target_?id|to|dest)$/.test(lower)) mapping.targetId = header;
      if (!mapping.edgeType && /^(edge_?type|relation)$/.test(lower)) mapping.edgeType = header;
    }

    // User overrides take precedence
    if (userMapping) {
      Object.assign(mapping, userMapping);
    }

    return mapping;
  }

  private parseEdgeType(raw: string): CreateEdge["type"] {
    const normalized = raw.toLowerCase().replace(/\s+/g, "_");
    const validTypes: CreateEdge["type"][] = [
      "references", "contains", "related_to", "created_by", "tagged_with",
      "belongs_to", "depends_on", "derived_from", "mentions", "collaborates_with",
    ];
    return validTypes.find((t) => t === normalized) ?? "related_to";
  }
}
