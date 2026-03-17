import type { CreateNode, CreateEdge, NodeType, EdgeType } from "@nexus/shared";

// Result of an import operation
export interface ImportResult {
  nodes: CreateNode[];
  edges: CreateEdge[];
  warnings: ImportWarning[];
  errors: ImportError[];
  stats: ImportStats;
}

export interface ImportWarning {
  message: string;
  source?: string;
  line?: number;
}

export interface ImportError {
  message: string;
  source?: string;
  line?: number;
  fatal: boolean;
}

export interface ImportStats {
  totalProcessed: number;
  nodesCreated: number;
  edgesCreated: number;
  duplicatesSkipped: number;
  errorsEncountered: number;
  durationMs: number;
}

// Options for export operations
export interface ExportOptions {
  includeMetadata: boolean;
  includeEdges: boolean;
  format?: string;
  pretty?: boolean;
  encoding?: BufferEncoding;
}

// Options for import operations
export interface ImportOptions {
  ownerId: string;
  defaultNodeType?: NodeType;
  defaultEdgeType?: EdgeType;
  skipDuplicates?: boolean;
  validateBeforeImport?: boolean;
  maxNodes?: number;
  batchSize?: number;
  onProgress?: ProgressCallback;
  tags?: string[];
}

// Progress callback type
export type ProgressCallback = (progress: ImportProgress) => void;

export interface ImportProgress {
  phase: "parsing" | "validating" | "deduplicating" | "importing";
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

// Importer interface
export interface Importer<TRaw = unknown> {
  readonly name: string;
  readonly supportedExtensions: string[];

  parse(content: string, source?: string): Promise<TRaw>;
  validate(parsed: TRaw): ValidationResult;
  import(parsed: TRaw, options: ImportOptions): Promise<ImportResult>;
}

// Exporter interface
export interface Exporter<TNode = CreateNode, TEdge = CreateEdge> {
  readonly name: string;
  readonly defaultExtension: string;

  export(nodes: TNode[], edges: TEdge[], options: ExportOptions): Promise<ExportResult>;
  serialize(result: ExportResult): string;
}

export interface ExportResult {
  content: string;
  filename?: string;
  mimeType: string;
  encoding: BufferEncoding;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Large document chunking
export interface DocumentChunk {
  index: number;
  total: number;
  content: string;
  startOffset: number;
  endOffset: number;
  metadata: Record<string, unknown>;
}

// Parsed markdown document structure
export interface ParsedMarkdownDocument {
  frontMatter: Record<string, unknown>;
  title: string;
  sections: ParsedSection[];
  links: ParsedLink[];
  codeBlocks: ParsedCodeBlock[];
  tags: string[];
  rawContent: string;
  source?: string;
}

export interface ParsedSection {
  level: number;
  heading: string;
  content: string;
  children: ParsedSection[];
  startLine: number;
}

export interface ParsedLink {
  type: "wikilink" | "external" | "internal";
  target: string;
  label?: string;
  line?: number;
}

export interface ParsedCodeBlock {
  language: string;
  content: string;
  metadata: Record<string, unknown>;
  line?: number;
}

// CSV column mapping configuration
export interface ColumnMapping {
  title?: string;
  content?: string;
  type?: string;
  id?: string;
  tags?: string;
  sourceId?: string;
  targetId?: string;
  edgeType?: string;
  [key: string]: string | undefined;
}

export interface CSVParseOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  headers?: boolean | string[];
  skipEmptyLines?: boolean;
  trim?: boolean;
  maxRows?: number;
}

export interface ParsedCSVDocument {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  detectedTypes: Record<string, ColumnType>;
}

export type ColumnType = "id" | "title" | "content" | "type" | "number" | "boolean" | "date" | "tags" | "unknown";

// JSON import structures
export interface ParsedJSONDocument {
  root: unknown;
  nodeCount: number;
  depth: number;
  isArray: boolean;
  isJsonLd: boolean;
}

// HTML parsed structure
export interface ParsedHTMLDocument {
  title: string;
  metaTags: Record<string, string>;
  headings: HTMLHeading[];
  links: HTMLLink[];
  images: HTMLImage[];
  textContent: string;
  source?: string;
}

export interface HTMLHeading {
  level: number;
  text: string;
}

export interface HTMLLink {
  href: string;
  text: string;
  isExternal: boolean;
}

export interface HTMLImage {
  src: string;
  alt?: string;
  title?: string;
}
