import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

interface ExportNode {
  id: string;
  title: string;
  type: string;
  content?: string;
  metadata?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

interface ExportEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight?: number;
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nodeToMarkdown(node: ExportNode, edges: ExportEdge[]): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${node.id}`);
  lines.push(`title: "${node.title}"`);
  lines.push(`type: ${node.type}`);
  if (node.createdAt) lines.push(`created: ${node.createdAt}`);
  if (node.updatedAt) lines.push(`updated: ${node.updatedAt}`);
  if (node.metadata) {
    for (const [k, v] of Object.entries(node.metadata)) {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${node.title}`);
  lines.push("");
  if (node.content) {
    lines.push(node.content);
    lines.push("");
  }

  const outgoing = edges.filter((e) => e.sourceId === node.id);
  const incoming = edges.filter((e) => e.targetId === node.id);

  if (outgoing.length > 0) {
    lines.push("## Links");
    for (const edge of outgoing) {
      lines.push(`- [[${edge.targetId}]] (${edge.type})`);
    }
    lines.push("");
  }

  if (incoming.length > 0) {
    lines.push("## Backlinks");
    for (const edge of incoming) {
      lines.push(`- [[${edge.sourceId}]] (${edge.type})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function fetchAllNodes(
  client: NexusClient,
  opts: { type?: string; since?: string; until?: string },
): Promise<ExportNode[]> {
  const nodes: ExportNode[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await client.listNodes({
      type: opts.type,
      limit: 100,
      page,
    });

    let items = result.items as ExportNode[];

    if (opts.since) {
      const since = new Date(opts.since).getTime();
      items = items.filter((n) => n.createdAt ? new Date(n.createdAt).getTime() >= since : true);
    }
    if (opts.until) {
      const until = new Date(opts.until).getTime();
      items = items.filter((n) => n.createdAt ? new Date(n.createdAt).getTime() <= until : true);
    }

    nodes.push(...items);
    hasMore = page < result.totalPages;
    page++;
  }

  return nodes;
}

export const exportCommands = new Command("export").description(
  "Export data from Nexus",
);

exportCommands
  .command("markdown")
  .description("Export nodes as markdown vault")
  .requiredOption("-o, --output <dir>", "Output directory")
  .option("--type <type>", "Filter by node type")
  .option("--since <date>", "Filter nodes created after date (ISO 8601)")
  .option("--until <date>", "Filter nodes created before date (ISO 8601)")
  .option("--edges", "Include edge information in markdown files")
  .action(async (opts: {
    output: string;
    type?: string;
    since?: string;
    until?: string;
    edges?: boolean;
  }) => {
    const spinner = ora("Fetching nodes...").start();

    try {
      const client = getClient();
      const nodes = await fetchAllNodes(client, opts);

      spinner.text = "Fetching edges...";
      let edges: ExportEdge[] = [];
      if (opts.edges) {
        try {
          const edgeResult = await client.listEdges({ limit: 10000, page: 1 });
          edges = edgeResult.items as ExportEdge[];
        } catch {
          // edges not critical
        }
      }

      spinner.text = `Writing ${nodes.length} markdown files...`;
      mkdirSync(opts.output, { recursive: true });

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        spinner.text = `[${i + 1}/${nodes.length}] ${node.title}`;
        const filename = `${slugify(node.title)}-${node.id.slice(0, 8)}.md`;
        const filePath = join(opts.output, filename);
        const nodeEdges = opts.edges ? edges : [];
        writeFileSync(filePath, nodeToMarkdown(node, nodeEdges), "utf-8");
      }

      spinner.succeed(
        chalk.green(`Exported ${nodes.length} nodes to ${opts.output}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Export failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

exportCommands
  .command("csv")
  .description("Export nodes as CSV file")
  .requiredOption("-o, --output <file>", "Output CSV file path")
  .option("--type <type>", "Filter by node type")
  .option("--since <date>", "Filter nodes created after date (ISO 8601)")
  .option("--until <date>", "Filter nodes created before date (ISO 8601)")
  .option("--edges", "Include edge count column")
  .action(async (opts: {
    output: string;
    type?: string;
    since?: string;
    until?: string;
    edges?: boolean;
  }) => {
    const spinner = ora("Fetching nodes...").start();

    try {
      const client = getClient();
      const nodes = await fetchAllNodes(client, opts);

      spinner.text = `Building CSV for ${nodes.length} nodes...`;
      ensureDir(opts.output);

      const headers = ["id", "title", "type", "createdAt", "updatedAt", "content"];
      if (opts.edges) headers.push("edgeCount");

      const escapeCSV = (val: string): string => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      let edgeCounts: Record<string, number> = {};
      if (opts.edges) {
        try {
          const edgeResult = await client.listEdges({ limit: 10000, page: 1 });
          for (const edge of edgeResult.items as ExportEdge[]) {
            edgeCounts[edge.sourceId] = (edgeCounts[edge.sourceId] ?? 0) + 1;
            edgeCounts[edge.targetId] = (edgeCounts[edge.targetId] ?? 0) + 1;
          }
        } catch {
          edgeCounts = {};
        }
      }

      const rows = nodes.map((node) => {
        const row = [
          node.id,
          node.title,
          node.type,
          node.createdAt ?? "",
          node.updatedAt ?? "",
          (node.content ?? "").replace(/\n/g, " "),
        ];
        if (opts.edges) row.push(String(edgeCounts[node.id] ?? 0));
        return row.map(escapeCSV).join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");
      writeFileSync(opts.output, csv, "utf-8");

      spinner.succeed(
        chalk.green(`Exported ${nodes.length} nodes to ${opts.output}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Export failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

exportCommands
  .command("json")
  .description("Export nodes as JSON file")
  .requiredOption("-o, --output <file>", "Output JSON file path")
  .option("--type <type>", "Filter by node type")
  .option("--since <date>", "Filter nodes created after date (ISO 8601)")
  .option("--until <date>", "Filter nodes created before date (ISO 8601)")
  .option("--edges", "Include edges in export")
  .option("--pretty", "Pretty-print JSON output")
  .action(async (opts: {
    output: string;
    type?: string;
    since?: string;
    until?: string;
    edges?: boolean;
    pretty?: boolean;
  }) => {
    const spinner = ora("Fetching nodes...").start();

    try {
      const client = getClient();
      const nodes = await fetchAllNodes(client, opts);

      let edges: ExportEdge[] = [];
      if (opts.edges) {
        spinner.text = "Fetching edges...";
        try {
          const edgeResult = await client.listEdges({ limit: 10000, page: 1 });
          edges = edgeResult.items as ExportEdge[];
        } catch {
          // edges optional
        }
      }

      spinner.text = "Writing JSON...";
      ensureDir(opts.output);

      const payload = opts.edges ? { nodes, edges, exportedAt: new Date().toISOString() } : { nodes, exportedAt: new Date().toISOString() };
      const json = opts.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
      writeFileSync(opts.output, json, "utf-8");

      spinner.succeed(
        chalk.green(
          `Exported ${nodes.length} nodes${opts.edges ? `, ${edges.length} edges` : ""} to ${opts.output}`,
        ),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Export failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
