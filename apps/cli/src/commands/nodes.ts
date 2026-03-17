import { Command } from "commander";
import chalk from "chalk";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

export const nodeCommands = new Command("nodes")
  .description("Manage knowledge nodes");

nodeCommands
  .command("list")
  .description("List nodes")
  .option("-t, --type <type>", "Filter by node type")
  .option("-s, --search <query>", "Search nodes")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-p, --page <n>", "Page number", "1")
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.listNodes({
        type: opts.type,
        search: opts.search,
        limit: Number(opts.limit),
        page: Number(opts.page),
      });

      if (result.items.length === 0) {
        console.log(chalk.yellow("No nodes found."));
        return;
      }

      for (const node of result.items) {
        console.log(
          `${chalk.blue(node.id.slice(0, 8))} ${chalk.gray(`[${node.type}]`)} ${node.title}`,
        );
      }
      console.log(chalk.gray(`\nPage ${result.page}/${result.totalPages} (${result.total} total)`));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

nodeCommands
  .command("get <id>")
  .description("Get a node by ID")
  .action(async (id: string) => {
    try {
      const client = getClient();
      const node = await client.getNode(id);
      console.log(JSON.stringify(node, null, 2));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

nodeCommands
  .command("create")
  .description("Create a new node")
  .requiredOption("-t, --title <title>", "Node title")
  .requiredOption("--type <type>", "Node type")
  .option("-c, --content <content>", "Node content")
  .action(async (opts) => {
    try {
      const client = getClient();
      const node = await client.createNode({
        title: opts.title,
        type: opts.type,
        content: opts.content,
        ownerId: "00000000-0000-0000-0000-000000000000", // TODO: from auth
        metadata: {},
      });
      console.log(chalk.green("Node created:"));
      console.log(JSON.stringify(node, null, 2));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

nodeCommands
  .command("delete <id>")
  .description("Delete a node")
  .action(async (id: string) => {
    try {
      const client = getClient();
      await client.deleteNode(id);
      console.log(chalk.green(`Node ${id} deleted.`));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
