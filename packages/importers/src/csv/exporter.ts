import type { CreateNode, CreateEdge } from "@nexus/shared";
import type { Exporter, ExportOptions, ExportResult } from "../types.js";
import { CSVParser } from "./parser.js";

export interface CSVExportOptions extends ExportOptions {
  nodeColumns?: string[]; // which metadata fields to include as columns
  includeEdgesAsColumns?: boolean; // flatten edge counts into node rows
  delimiter?: string;
  quote?: string;
}

export class CSVExporter implements Exporter<CreateNode, CreateEdge> {
  readonly name = "csv";
  readonly defaultExtension = ".csv";

  private csvParser = new CSVParser();

  export(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: ExportOptions,
  ): Promise<ExportResult> {
    const csvOptions = options as CSVExportOptions;
    const delimiter = csvOptions.delimiter ?? ",";

    const nodeContent = this.exportNodes(nodes, edges, csvOptions, delimiter);

    if (options.includeEdges && edges.length > 0) {
      const edgeContent = this.exportEdges(edges, delimiter);
      // Return combined content with a separator comment
      const combined = `# Nodes\n${nodeContent}\n\n# Edges\n${edgeContent}`;
      return Promise.resolve({
        content: combined,
        mimeType: "text/csv",
        encoding: "utf-8",
      });
    }

    return Promise.resolve({
      content: nodeContent,
      mimeType: "text/csv",
      encoding: "utf-8",
    });
  }

  serialize(result: ExportResult): string {
    return result.content;
  }

  // Export nodes as CSV rows
  private exportNodes(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: CSVExportOptions,
    delimiter: string,
  ): string {
    if (nodes.length === 0) return "";

    // Collect all metadata keys across nodes
    const metaKeys = this.collectMetadataKeys(nodes, options.nodeColumns);

    // Build edge counts per node if requested
    const edgeCounts = new Map<string, number>();
    if (options.includeEdgesAsColumns) {
      for (const edge of edges) {
        edgeCounts.set(edge.sourceId, (edgeCounts.get(edge.sourceId) ?? 0) + 1);
      }
    }

    const baseHeaders = ["type", "title", "content", "ownerId"];
    const metaHeaders = metaKeys;
    const edgeHeaders = options.includeEdgesAsColumns ? ["outgoingEdges"] : [];
    const headers = [...baseHeaders, ...metaHeaders, ...edgeHeaders];

    const rows: Record<string, string>[] = nodes.map((node) => {
      const meta = node.metadata as Record<string, unknown>;
      const row: Record<string, string> = {
        type: node.type,
        title: node.title,
        content: node.content ?? "",
        ownerId: node.ownerId,
      };

      for (const key of metaKeys) {
        const val = meta[key];
        row[key] = val === undefined || val === null
          ? ""
          : Array.isArray(val)
            ? val.join(";")
            : String(val);
      }

      if (options.includeEdgesAsColumns) {
        row["outgoingEdges"] = String(edgeCounts.get(node.ownerId) ?? 0);
      }

      return row;
    });

    return this.csvParser.serialize(rows, headers, delimiter);
  }

  // Export edges as CSV rows
  private exportEdges(edges: CreateEdge[], delimiter: string): string {
    if (edges.length === 0) return "";

    const headers = ["type", "sourceId", "targetId", "weight"];

    // Collect all metadata keys
    const metaKeys = new Set<string>();
    for (const edge of edges) {
      const meta = edge.metadata as Record<string, unknown>;
      for (const key of Object.keys(meta)) {
        metaKeys.add(key);
      }
    }
    const allHeaders = [...headers, ...Array.from(metaKeys)];

    const rows: Record<string, string>[] = edges.map((edge) => {
      const meta = edge.metadata as Record<string, unknown>;
      const row: Record<string, string> = {
        type: edge.type,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        weight: String(edge.weight),
      };
      for (const key of metaKeys) {
        const val = meta[key];
        row[key] = val === undefined ? "" : String(val);
      }
      return row;
    });

    return this.csvParser.serialize(rows, allHeaders, delimiter);
  }

  // Collect unique metadata keys, respecting optional column filter
  private collectMetadataKeys(
    nodes: CreateNode[],
    allowedColumns?: string[],
  ): string[] {
    const keys = new Set<string>();

    for (const node of nodes) {
      const meta = node.metadata as Record<string, unknown>;
      for (const key of Object.keys(meta)) {
        if (!allowedColumns || allowedColumns.includes(key)) {
          keys.add(key);
        }
      }
    }

    return Array.from(keys).sort();
  }
}
