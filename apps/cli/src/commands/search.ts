import { Command } from "commander";
import chalk from "chalk";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

export const searchCommands = new Command("search")
  .description("Search the knowledge graph")
  .argument("<query>", "Search query")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-t, --types <types...>", "Filter by node types")
  .option("--semantic", "Use semantic search")
  .action(async (query: string, opts) => {
    try {
      const client = new NexusClient({
        baseUrl: getApiUrl(),
        accessToken: getToken(),
      });

      const result = await client.search(query, {
        limit: Number(opts.limit),
        types: opts.types,
        semantic: opts.semantic ?? false,
      });

      if (result.results.length === 0) {
        console.log(chalk.yellow("No results found."));
        return;
      }

      for (const hit of result.results) {
        console.log(
          `${chalk.blue(hit.id.slice(0, 8))} ${chalk.gray(`score: ${hit.score.toFixed(3)}`)}`,
        );
        for (const hl of hit.highlights) {
          console.log(`  ${chalk.dim(hl.slice(0, 120))}`);
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
