import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

interface NodeRecord {
  id: string;
  title: string;
  type: string;
  createdAt?: string;
}

interface EdgeRecord {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight?: number;
}

function printTable(
  headers: string[],
  rows: string[][],
  colors?: (string | undefined)[],
): void {
  const widths = headers.map((h, i) => {
    const colWidth = Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length));
    return Math.min(colWidth, 60);
  });

  const separator = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = headers
    .map((h, i) => ` ${h.padEnd(widths[i] ?? 0)} `)
    .join("│");
  const headerLine = widths.map((w) => "─".repeat(w + 2)).join("┬");

  console.log(chalk.gray("┌" + headerLine + "┐"));
  console.log(chalk.bold("│" + header + "│"));
  console.log(chalk.gray("├" + separator + "┤"));

  for (const row of rows) {
    const cells = row
      .map((cell, i) => {
        const truncated = (cell ?? "").length > (widths[i] ?? 0)
          ? (cell ?? "").slice(0, (widths[i] ?? 0) - 1) + "…"
          : cell ?? "";
        const padded = ` ${truncated.padEnd(widths[i] ?? 0)} `;
        const color = colors?.[i];
        return color ? chalk.hex(color)(padded) : padded;
      })
      .join("│");
    console.log("│" + cells + "│");
  }

  console.log(chalk.gray("└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘"));
}

async function fetchAllNodes(client: NexusClient): Promise<NodeRecord[]> {
  const nodes: NodeRecord[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const result = await client.listNodes({ limit: 100, page });
    nodes.push(...(result.items as NodeRecord[]));
    hasMore = page < result.totalPages;
    page++;
  }
  return nodes;
}

async function fetchAllEdges(client: NexusClient): Promise<EdgeRecord[]> {
  try {
    const result = await client.listEdges({ limit: 10000, page: 1 });
    return result.items as EdgeRecord[];
  } catch {
    return [];
  }
}

export const analyticsCommands = new Command("analytics").description(
  "Graph analytics and statistics",
);

analyticsCommands
  .command("overview")
  .description("Show overall graph statistics")
  .action(async () => {
    const spinner = ora("Gathering statistics...").start();

    try {
      const client = getClient();
      const [nodes, edges] = await Promise.all([
        fetchAllNodes(client),
        fetchAllEdges(client),
      ]);

      spinner.stop();

      // Count by type
      const nodeTypes = new Map<string, number>();
      for (const node of nodes) {
        nodeTypes.set(node.type, (nodeTypes.get(node.type) ?? 0) + 1);
      }
      const edgeTypes = new Map<string, number>();
      for (const edge of edges) {
        edgeTypes.set(edge.type, (edgeTypes.get(edge.type) ?? 0) + 1);
      }

      // Degree stats
      const degrees = new Map<string, number>();
      for (const edge of edges) {
        degrees.set(edge.sourceId, (degrees.get(edge.sourceId) ?? 0) + 1);
        degrees.set(edge.targetId, (degrees.get(edge.targetId) ?? 0) + 1);
      }
      const degreeValues = Array.from(degrees.values());
      const avgDegree = degreeValues.length > 0
        ? degreeValues.reduce((a, b) => a + b, 0) / degreeValues.length
        : 0;
      const maxDegree = degreeValues.length > 0 ? Math.max(...degreeValues) : 0;

      const connectedNodes = degrees.size;
      const orphanCount = nodes.length - connectedNodes;
      const density = nodes.length > 1
        ? (2 * edges.length) / (nodes.length * (nodes.length - 1))
        : 0;

      console.log();
      console.log(chalk.bold.cyan("Graph Overview"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`  Total nodes:       ${chalk.green(String(nodes.length))}`);
      console.log(`  Total edges:       ${chalk.green(String(edges.length))}`);
      console.log(`  Orphan nodes:      ${chalk.yellow(String(orphanCount))}`);
      console.log(`  Graph density:     ${chalk.blue(density.toFixed(6))}`);
      console.log(`  Avg degree:        ${chalk.blue(avgDegree.toFixed(2))}`);
      console.log(`  Max degree:        ${chalk.blue(String(maxDegree))}`);
      console.log();

      if (nodeTypes.size > 0) {
        console.log(chalk.bold("Node Types"));
        printTable(
          ["Type", "Count"],
          Array.from(nodeTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => [type, String(count)]),
        );
      }

      if (edgeTypes.size > 0) {
        console.log();
        console.log(chalk.bold("Edge Types"));
        printTable(
          ["Type", "Count"],
          Array.from(edgeTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => [type, String(count)]),
        );
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

analyticsCommands
  .command("top-nodes")
  .description("List most connected nodes by degree")
  .option("-l, --limit <n>", "Number of nodes to show", "20")
  .action(async (opts: { limit: string }) => {
    const limit = Number(opts.limit);
    const spinner = ora("Analyzing node connections...").start();

    try {
      const client = getClient();
      const [nodes, edges] = await Promise.all([
        fetchAllNodes(client),
        fetchAllEdges(client),
      ]);

      const degrees = new Map<string, number>();
      for (const edge of edges) {
        degrees.set(edge.sourceId, (degrees.get(edge.sourceId) ?? 0) + 1);
        degrees.set(edge.targetId, (degrees.get(edge.targetId) ?? 0) + 1);
      }

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const ranked = Array.from(degrees.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, degree]) => {
          const node = nodeMap.get(id);
          return [
            id.slice(0, 8),
            node?.title ?? "(unknown)",
            node?.type ?? "?",
            String(degree),
          ];
        });

      spinner.stop();
      console.log();
      console.log(chalk.bold.cyan(`Top ${limit} Most Connected Nodes`));
      printTable(["ID", "Title", "Type", "Degree"], ranked);
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

analyticsCommands
  .command("orphans")
  .description("List nodes with no edges (orphans)")
  .option("-t, --type <type>", "Filter by node type")
  .action(async (opts: { type?: string }) => {
    const spinner = ora("Finding orphan nodes...").start();

    try {
      const client = getClient();
      const [nodes, edges] = await Promise.all([
        fetchAllNodes(client),
        fetchAllEdges(client),
      ]);

      const connected = new Set<string>();
      for (const edge of edges) {
        connected.add(edge.sourceId);
        connected.add(edge.targetId);
      }

      let orphans = nodes.filter((n) => !connected.has(n.id));
      if (opts.type) orphans = orphans.filter((n) => n.type === opts.type);

      spinner.stop();
      console.log();
      console.log(chalk.bold.cyan(`Orphan Nodes (${orphans.length})`));

      if (orphans.length === 0) {
        console.log(chalk.green("No orphan nodes found."));
        return;
      }

      printTable(
        ["ID", "Title", "Type", "Created"],
        orphans.map((n) => [
          n.id.slice(0, 8),
          n.title,
          n.type,
          n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "?",
        ]),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

analyticsCommands
  .command("dead-ends")
  .description("List nodes with only incoming edges (dead-ends)")
  .action(async () => {
    const spinner = ora("Finding dead-end nodes...").start();

    try {
      const client = getClient();
      const [nodes, edges] = await Promise.all([
        fetchAllNodes(client),
        fetchAllEdges(client),
      ]);

      const hasSources = new Set(edges.map((e) => e.sourceId));
      const hasTargets = new Set(edges.map((e) => e.targetId));

      const deadEnds = nodes.filter(
        (n) => hasTargets.has(n.id) && !hasSources.has(n.id),
      );

      spinner.stop();
      console.log();
      console.log(chalk.bold.cyan(`Dead-End Nodes (${deadEnds.length})`));

      if (deadEnds.length === 0) {
        console.log(chalk.green("No dead-end nodes found."));
        return;
      }

      const inDegrees = new Map<string, number>();
      for (const edge of edges) {
        inDegrees.set(edge.targetId, (inDegrees.get(edge.targetId) ?? 0) + 1);
      }

      printTable(
        ["ID", "Title", "Type", "In-Degree"],
        deadEnds.map((n) => [
          n.id.slice(0, 8),
          n.title,
          n.type,
          String(inDegrees.get(n.id) ?? 0),
        ]),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

analyticsCommands
  .command("growth")
  .description("Show graph growth over time")
  .option("--by <period>", "Group by: day, week, month", "month")
  .action(async (opts: { by: string }) => {
    const spinner = ora("Calculating growth...").start();

    try {
      const client = getClient();
      const nodes = await fetchAllNodes(client);

      const nodesWithDates = nodes.filter((n) => n.createdAt);
      if (nodesWithDates.length === 0) {
        spinner.stop();
        console.log(chalk.yellow("No nodes with creation dates found."));
        return;
      }

      const buckets = new Map<string, number>();
      for (const node of nodesWithDates) {
        const date = new Date(node.createdAt!);
        let key: string;
        if (opts.by === "day") {
          key = date.toISOString().slice(0, 10);
        } else if (opts.by === "week") {
          const dayOfWeek = date.getDay();
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - dayOfWeek);
          key = weekStart.toISOString().slice(0, 10);
        } else {
          key = date.toISOString().slice(0, 7);
        }
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }

      const sorted = Array.from(buckets.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );

      const maxCount = Math.max(...sorted.map(([, c]) => c));
      const barWidth = 30;

      spinner.stop();
      console.log();
      console.log(chalk.bold.cyan(`Node Growth by ${opts.by}`));
      console.log();

      let cumulative = 0;
      for (const [period, count] of sorted) {
        cumulative += count;
        const bar = "█".repeat(Math.round((count / maxCount) * barWidth));
        console.log(
          `  ${chalk.gray(period)}  ${chalk.green(bar.padEnd(barWidth))} ${chalk.white(String(count).padStart(5))} (total: ${chalk.cyan(String(cumulative))})`,
        );
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
