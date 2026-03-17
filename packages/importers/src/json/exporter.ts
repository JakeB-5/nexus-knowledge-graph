import type { CreateNode, CreateEdge } from "@nexus/shared";
import type { Exporter, ExportOptions, ExportResult } from "../types.js";

export type JSONExportFormat = "flat" | "nested" | "jsonld";

export interface JSONExportOptions extends ExportOptions {
  jsonFormat?: JSONExportFormat;
  jsonldContext?: Record<string, unknown>;
}

export class JSONExporter implements Exporter<CreateNode, CreateEdge> {
  readonly name = "json";
  readonly defaultExtension = ".json";

  export(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: ExportOptions,
  ): Promise<ExportResult> {
    const jsonOptions = options as JSONExportOptions;
    const format = jsonOptions.jsonFormat ?? "flat";

    let content: unknown;
    switch (format) {
      case "nested":
        content = this.exportNested(nodes, edges);
        break;
      case "jsonld":
        content = this.exportJsonLd(nodes, edges, jsonOptions.jsonldContext);
        break;
      default:
        content = this.exportFlat(nodes, edges, options);
    }

    const serialized = JSON.stringify(content, null, options.pretty ? 2 : 0);

    return Promise.resolve({
      content: serialized,
      mimeType: "application/json",
      encoding: "utf-8",
    });
  }

  serialize(result: ExportResult): string {
    return result.content;
  }

  // Flat export: nodes array + edges array
  private exportFlat(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: ExportOptions,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      nodes: nodes.map((n) => this.nodeToJSON(n, options.includeMetadata)),
    };

    if (options.includeEdges) {
      result["edges"] = edges.map((e) => this.edgeToJSON(e));
    }

    return result;
  }

  // Nested export: tree structure based on contains edges
  private exportNested(nodes: CreateNode[], edges: CreateEdge[]): Record<string, unknown> {
    // Build parent → children map
    const childrenMap = new Map<string, string[]>();
    const childSet = new Set<string>();

    for (const edge of edges) {
      if (edge.type === "contains") {
        const children = childrenMap.get(edge.sourceId) ?? [];
        children.push(edge.targetId);
        childrenMap.set(edge.sourceId, children);
        childSet.add(edge.targetId);
      }
    }

    // Build id → node index (using ownerId as proxy since CreateNode has no id)
    const nodeMap = new Map<string, CreateNode>();
    for (const node of nodes) {
      nodeMap.set(node.title, node); // use title as key since no id on CreateNode
    }

    // Root nodes: those not appearing as children
    const rootNodes = nodes.filter((n) => !childSet.has(n.title));

    const renderNode = (node: CreateNode, depth: number): Record<string, unknown> => {
      const result: Record<string, unknown> = {
        type: node.type,
        title: node.title,
        ownerId: node.ownerId,
      };

      if (node.content) result["content"] = node.content;
      if (node.metadata && Object.keys(node.metadata).length > 0) {
        result["metadata"] = node.metadata;
      }

      const childIds = childrenMap.get(node.title) ?? [];
      if (childIds.length > 0 && depth < 10) {
        result["children"] = childIds
          .map((id) => nodeMap.get(id))
          .filter(Boolean)
          .map((child) => renderNode(child!, depth + 1));
      }

      return result;
    };

    return {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      format: "nested",
      nodes: rootNodes.map((n) => renderNode(n, 0)),
    };
  }

  // JSON-LD export: semantic web compatible
  private exportJsonLd(
    nodes: CreateNode[],
    edges: CreateEdge[],
    customContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {
      "@vocab": "https://nexus.example.com/ontology#",
      "nexus": "https://nexus.example.com/ontology#",
      "schema": "https://schema.org/",
      "title": "schema:name",
      "content": "schema:description",
      "type": "@type",
      "references": { "@id": "nexus:references", "@type": "@id" },
      "contains": { "@id": "nexus:contains", "@type": "@id" },
      "related_to": { "@id": "nexus:relatedTo", "@type": "@id" },
      ...customContext,
    };

    // Build edges lookup
    const edgesBySource = new Map<string, CreateEdge[]>();
    for (const edge of edges) {
      const list = edgesBySource.get(edge.sourceId) ?? [];
      list.push(edge);
      edgesBySource.set(edge.sourceId, list);
    }

    // Generate stable IDs from titles
    const titleToId = new Map<string, string>();
    for (const node of nodes) {
      const id = `urn:nexus:node:${encodeURIComponent(node.title.toLowerCase().replace(/\s+/g, "-"))}`;
      titleToId.set(node.title, id);
    }

    const graph = nodes.map((node) => {
      const nodeId = titleToId.get(node.title) ?? `urn:nexus:node:${Math.random()}`;
      const jsonLdNode: Record<string, unknown> = {
        "@id": nodeId,
        "@type": `nexus:${node.type}`,
        "title": node.title,
      };

      if (node.content) jsonLdNode["content"] = node.content;

      const meta = node.metadata as Record<string, unknown>;
      if (meta["tags"] && Array.isArray(meta["tags"])) {
        jsonLdNode["nexus:tags"] = meta["tags"];
      }

      // Add edge predicates
      const nodeEdges = edgesBySource.get(node.title) ?? [];
      for (const edge of nodeEdges) {
        const targetId = titleToId.get(edge.targetId) ?? edge.targetId;
        const predicate = this.edgeTypeToPredicate(edge.type);
        const existing = jsonLdNode[predicate];
        if (Array.isArray(existing)) {
          (existing as unknown[]).push({ "@id": targetId });
        } else if (existing) {
          jsonLdNode[predicate] = [existing, { "@id": targetId }];
        } else {
          jsonLdNode[predicate] = { "@id": targetId };
        }
      }

      return jsonLdNode;
    });

    return {
      "@context": context,
      "@graph": graph,
    };
  }

  private nodeToJSON(node: CreateNode, includeMetadata: boolean): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: node.type,
      title: node.title,
      ownerId: node.ownerId,
    };

    if (node.content !== undefined) result["content"] = node.content;
    if (includeMetadata && node.metadata) result["metadata"] = node.metadata;

    return result;
  }

  private edgeToJSON(edge: CreateEdge): Record<string, unknown> {
    return {
      type: edge.type,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      weight: edge.weight,
      ...(Object.keys(edge.metadata).length > 0 ? { metadata: edge.metadata } : {}),
    };
  }

  private edgeTypeToPredicate(type: string): string {
    const map: Record<string, string> = {
      references: "references",
      contains: "contains",
      related_to: "related_to",
      created_by: "nexus:createdBy",
      tagged_with: "nexus:taggedWith",
      belongs_to: "nexus:belongsTo",
      depends_on: "nexus:dependsOn",
      derived_from: "nexus:derivedFrom",
      mentions: "nexus:mentions",
      collaborates_with: "nexus:collaboratesWith",
    };
    return map[type] ?? `nexus:${type}`;
  }
}
