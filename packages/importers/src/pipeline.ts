import type { CreateNode, CreateEdge } from "@nexus/shared";
import type {
  ImportResult,
  ImportOptions,
  ImportProgress,
  ImportWarning,
  ImportError,
  Importer,
} from "./types.js";
import { Deduplicator } from "./deduplication.js";
import { sanitizeNode, isValidNode } from "./transforms.js";

export interface PipelineOptions {
  chunkSize?: number;
  deduplicate?: boolean;
  validate?: boolean;
  sanitize?: boolean;
  onProgress?: (progress: ImportProgress) => void;
  onError?: (error: ImportError) => void;
  rollbackOnFailure?: boolean;
  maxErrors?: number;
}

export interface PipelineStage<TInput, TOutput> {
  name: string;
  run(input: TInput, options: PipelineOptions): Promise<TOutput>;
}

export interface PipelineState {
  phase: ImportProgress["phase"];
  processedCount: number;
  totalCount: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

// ─── Pipeline Stage Implementations ─────────────────────────────────────────

// Stage 1: Validate nodes
export class ValidationStage implements PipelineStage<CreateNode[], CreateNode[]> {
  readonly name = "validation";

  async run(nodes: CreateNode[], _options: PipelineOptions): Promise<CreateNode[]> {
    const valid: CreateNode[] = [];

    for (const node of nodes) {
      if (isValidNode(node)) {
        valid.push(node);
      }
    }

    return valid;
  }
}

// Stage 2: Sanitize / normalize node data
export class SanitizationStage implements PipelineStage<CreateNode[], CreateNode[]> {
  readonly name = "sanitization";

  async run(nodes: CreateNode[], _options: PipelineOptions): Promise<CreateNode[]> {
    return nodes.map((n) => sanitizeNode(n));
  }
}

// Stage 3: Deduplicate nodes
export class DeduplicationStage implements PipelineStage<CreateNode[], CreateNode[]> {
  readonly name = "deduplication";

  async run(nodes: CreateNode[], _options: PipelineOptions): Promise<CreateNode[]> {
    const dedup = new Deduplicator({ strategy: "combined", mergeStrategy: "merge_metadata" });
    const result = dedup.deduplicate(nodes);
    return result.unique;
  }
}

// ─── Import Pipeline ─────────────────────────────────────────────────────────

export class ImportPipeline {
  private stages: Array<PipelineStage<CreateNode[], CreateNode[]>> = [];
  private options: PipelineOptions;

  constructor(options: PipelineOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize ?? 200,
      deduplicate: options.deduplicate ?? true,
      validate: options.validate ?? true,
      sanitize: options.sanitize ?? true,
      rollbackOnFailure: options.rollbackOnFailure ?? false,
      maxErrors: options.maxErrors ?? 100,
      onProgress: options.onProgress,
      onError: options.onError,
    };

    // Register default stages
    if (this.options.validate) this.stages.push(new ValidationStage());
    if (this.options.sanitize) this.stages.push(new SanitizationStage());
    if (this.options.deduplicate) this.stages.push(new DeduplicationStage());
  }

  // Add a custom stage
  addStage(stage: PipelineStage<CreateNode[], CreateNode[]>): this {
    this.stages.push(stage);
    return this;
  }

  // Run the full pipeline on importer output
  async run<TRaw>(
    rawContent: string,
    importer: Importer<TRaw>,
    importOptions: ImportOptions,
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    let snapshot: { nodes: CreateNode[]; edges: CreateEdge[] } | null = null;

    // --- Parse ---
    this.reportProgress({ phase: "parsing", current: 0, total: 1, percentage: 0 });

    let parsed: TRaw;
    try {
      parsed = await importer.parse(rawContent, importOptions.tags?.[0]);
    } catch (e) {
      const err: ImportError = { message: `Parse failed: ${String(e)}`, fatal: true };
      errors.push(err);
      this.options.onError?.(err);
      return this.emptyResult(errors, warnings, startTime);
    }

    this.reportProgress({ phase: "parsing", current: 1, total: 1, percentage: 100 });

    // --- Validate input ---
    this.reportProgress({ phase: "validating", current: 0, total: 1, percentage: 0 });
    const validation = importer.validate(parsed);
    if (!validation.valid) {
      for (const e of validation.errors) {
        const err: ImportError = { message: e, fatal: true };
        errors.push(err);
        this.options.onError?.(err);
      }
      return this.emptyResult(errors, warnings, startTime);
    }
    for (const w of validation.warnings) {
      warnings.push({ message: w });
    }
    this.reportProgress({ phase: "validating", current: 1, total: 1, percentage: 100 });

    // --- Import raw data ---
    let result: ImportResult;
    try {
      result = await importer.import(parsed, importOptions);
    } catch (e) {
      const err: ImportError = { message: `Import failed: ${String(e)}`, fatal: true };
      errors.push(err);
      this.options.onError?.(err);
      return this.emptyResult(errors, warnings, startTime);
    }

    errors.push(...result.errors);
    warnings.push(...result.warnings);

    if (errors.filter((e) => e.fatal).length > 0) {
      return { ...result, errors, warnings };
    }

    // Save snapshot for rollback
    if (this.options.rollbackOnFailure) {
      snapshot = { nodes: [...result.nodes], edges: [...result.edges] };
    }

    // --- Run pipeline stages on nodes ---
    let nodes = result.nodes;
    const edges = result.edges;

    try {
      for (const stage of this.stages) {
        const before = nodes.length;
        nodes = await stage.run(nodes, this.options);

        if (stage.name === "deduplication") {
          this.reportProgress({
            phase: "deduplicating",
            current: nodes.length,
            total: before,
            percentage: 100,
            message: `Deduplicated: ${before} → ${nodes.length} nodes`,
          });
        }
      }
    } catch (e) {
      const err: ImportError = { message: `Pipeline stage failed: ${String(e)}`, fatal: true };
      errors.push(err);
      this.options.onError?.(err);

      if (this.options.rollbackOnFailure && snapshot) {
        nodes = snapshot.nodes;
        warnings.push({ message: "Rolled back to pre-pipeline snapshot due to stage failure" });
      }
    }

    // --- Batch processing ---
    const finalNodes = await this.processBatches(nodes, importOptions);

    this.reportProgress({
      phase: "importing",
      current: finalNodes.length,
      total: finalNodes.length,
      percentage: 100,
      message: `Pipeline complete: ${finalNodes.length} nodes, ${edges.length} edges`,
    });

    return {
      nodes: finalNodes,
      edges,
      warnings,
      errors,
      stats: {
        totalProcessed: result.stats.totalProcessed,
        nodesCreated: finalNodes.length,
        edgesCreated: edges.length,
        duplicatesSkipped: result.nodes.length - finalNodes.length,
        errorsEncountered: errors.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Run pipeline stages on pre-parsed import result (for chaining)
  async runOnResult(result: ImportResult): Promise<ImportResult> {
    const startTime = Date.now();
    let nodes = result.nodes;
    const errors = [...result.errors];
    const warnings = [...result.warnings];

    for (const stage of this.stages) {
      nodes = await stage.run(nodes, this.options);
    }

    return {
      nodes,
      edges: result.edges,
      warnings,
      errors,
      stats: {
        ...result.stats,
        nodesCreated: nodes.length,
        duplicatesSkipped: result.nodes.length - nodes.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Process nodes in batches with progress reporting
  private async processBatches(
    nodes: CreateNode[],
    _options: ImportOptions,
  ): Promise<CreateNode[]> {
    const chunkSize = this.options.chunkSize ?? 200;
    const result: CreateNode[] = [];

    for (let i = 0; i < nodes.length; i += chunkSize) {
      const chunk = nodes.slice(i, i + chunkSize);
      result.push(...chunk);

      this.reportProgress({
        phase: "importing",
        current: Math.min(i + chunkSize, nodes.length),
        total: nodes.length,
        percentage: Math.round((Math.min(i + chunkSize, nodes.length) / nodes.length) * 100),
        message: `Batch ${Math.floor(i / chunkSize) + 1}`,
      });

      // Yield to event loop between batches
      await Promise.resolve();
    }

    return result;
  }

  private reportProgress(progress: Omit<ImportProgress, "message"> & { message?: string }): void {
    this.options.onProgress?.({
      phase: progress.phase,
      current: progress.current,
      total: progress.total,
      percentage: progress.percentage,
      message: progress.message,
    });
  }

  private emptyResult(
    errors: ImportError[],
    warnings: ImportWarning[],
    startTime: number,
  ): ImportResult {
    return {
      nodes: [],
      edges: [],
      warnings,
      errors,
      stats: {
        totalProcessed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        duplicatesSkipped: 0,
        errorsEncountered: errors.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Collect errors from multiple pipeline runs
  static mergeResults(results: ImportResult[]): ImportResult {
    const merged: ImportResult = {
      nodes: [],
      edges: [],
      warnings: [],
      errors: [],
      stats: {
        totalProcessed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        duplicatesSkipped: 0,
        errorsEncountered: 0,
        durationMs: 0,
      },
    };

    for (const r of results) {
      merged.nodes.push(...r.nodes);
      merged.edges.push(...r.edges);
      merged.warnings.push(...r.warnings);
      merged.errors.push(...r.errors);
      merged.stats.totalProcessed += r.stats.totalProcessed;
      merged.stats.nodesCreated += r.stats.nodesCreated;
      merged.stats.edgesCreated += r.stats.edgesCreated;
      merged.stats.duplicatesSkipped += r.stats.duplicatesSkipped;
      merged.stats.errorsEncountered += r.stats.errorsEncountered;
      merged.stats.durationMs += r.stats.durationMs;
    }

    return merged;
  }
}
