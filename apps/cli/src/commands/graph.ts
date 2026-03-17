import { Command } from "commander";
import chalk from "chalk";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

export const graphCommands = new Command("graph")
  .description("Graph operations");

graphCommands
  .command("traverse <nodeId>")
  .description("Traverse the graph from a starting node")
  .option("-d, --depth <n>", "Max depth", "3")
  .option("--direction <dir>", "Direction: outgoing, incoming, both", "outgoing")
  .action(async (nodeId: string, opts) => {
    try {
      const client = new NexusClient({
        baseUrl: getApiUrl(),
        accessToken: getToken(),
      });

      const result = await client.traverse(nodeId, {
        maxDepth: Number(opts.depth),
        direction: opts.direction,
      });

      console.log(chalk.blue(`Traversal from ${nodeId}:`));
      console.log(`Visited: ${result.visited.length} nodes`);

      for (const [target, path] of Object.entries(result.paths)) {
        console.log(`  ${chalk.gray(path.join(" → "))}`);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

graphCommands
  .command("path <source> <target>")
  .description("Find shortest path between two nodes")
  .action(async (source: string, target: string) => {
    try {
      const client = new NexusClient({
        baseUrl: getApiUrl(),
        accessToken: getToken(),
      });

      const result = await client.shortestPath(source, target);

      if (result.path) {
        console.log(chalk.green("Path found:"));
        console.log(`  ${result.path.join(chalk.gray(" → "))}`);
      } else {
        console.log(chalk.yellow("No path found between the specified nodes."));
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
