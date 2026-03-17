import { Command } from "commander";
import chalk from "chalk";
import { createInterface, Interface } from "node:readline";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

interface GraphNode {
  id: string;
  title: string;
  type: string;
  content?: string;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}

const COMMANDS = [
  "help",
  "list",
  "get",
  "go",
  "back",
  "neighbors",
  "search",
  "create",
  "delete",
  "path",
  "quit",
  "exit",
  "clear",
  "history",
  "info",
];

const HELP_TEXT = `
${chalk.bold.cyan("Nexus Interactive Shell")}
${chalk.gray("─".repeat(50))}

${chalk.bold("Navigation:")}
  ${chalk.cyan("go <nodeId>")}         Navigate to a node
  ${chalk.cyan("back")}                Go to previous node
  ${chalk.cyan("neighbors")}           Show neighbors of current node
  ${chalk.cyan("path <targetId>")}     Find path to another node

${chalk.bold("Nodes:")}
  ${chalk.cyan("list [type]")}         List nodes (optionally filter by type)
  ${chalk.cyan("get <id>")}            Show node details
  ${chalk.cyan("search <query>")}      Search nodes by text
  ${chalk.cyan("create")}              Create a new node (interactive)
  ${chalk.cyan("delete <id>")}         Delete a node

${chalk.bold("Utility:")}
  ${chalk.cyan("info")}                Show current node info
  ${chalk.cyan("history")}             Show navigation history
  ${chalk.cyan("clear")}               Clear the screen
  ${chalk.cyan("help")}                Show this help
  ${chalk.cyan("quit / exit")}         Exit the shell

`;

class ReplContext {
  currentNode: GraphNode | null = null;
  navigationHistory: GraphNode[] = [];
  nodeCache: Map<string, GraphNode> = new Map();
  commandHistory: string[] = [];
  client: NexusClient;

  constructor() {
    this.client = getClient();
  }

  async goToNode(id: string): Promise<void> {
    if (this.currentNode) {
      this.navigationHistory.push(this.currentNode);
    }
    const node = await this.fetchNode(id);
    this.currentNode = node;
    this.printNodeHeader(node);
  }

  async fetchNode(id: string): Promise<GraphNode> {
    if (this.nodeCache.has(id)) {
      return this.nodeCache.get(id)!;
    }
    const node = await this.client.getNode(id) as GraphNode;
    this.nodeCache.set(id, node);
    return node;
  }

  goBack(): void {
    const prev = this.navigationHistory.pop();
    if (!prev) {
      console.log(chalk.yellow("No previous node in history."));
      return;
    }
    this.currentNode = prev;
    this.printNodeHeader(prev);
  }

  printNodeHeader(node: GraphNode): void {
    console.log();
    console.log(chalk.bold.cyan(`📄 ${node.title}`));
    console.log(chalk.gray(`   ID: ${node.id} | Type: ${node.type}`));
    console.log();
  }

  getPrompt(): string {
    const loc = this.currentNode
      ? chalk.cyan(this.currentNode.title.slice(0, 20))
      : chalk.gray("(root)");
    return `nexus ${loc} ${chalk.gray(">")} `;
  }
}

async function handleCommand(
  input: string,
  ctx: ReplContext,
  _rl: Interface,
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  switch (cmd) {
    case "": {
      break;
    }

    case "help": {
      console.log(HELP_TEXT);
      break;
    }

    case "quit":
    case "exit": {
      console.log(chalk.gray("\nGoodbye!\n"));
      return false;
    }

    case "clear": {
      process.stdout.write("\x1Bc");
      break;
    }

    case "history": {
      if (ctx.navigationHistory.length === 0) {
        console.log(chalk.gray("No navigation history."));
      } else {
        console.log(chalk.bold("Navigation History:"));
        ctx.navigationHistory.forEach((n, i) => {
          console.log(
            `  ${chalk.gray(String(i + 1))}. ${chalk.cyan(n.id.slice(0, 8))} ${n.title}`,
          );
        });
      }
      break;
    }

    case "info": {
      if (!ctx.currentNode) {
        console.log(chalk.gray("No current node. Use 'go <id>' to navigate."));
      } else {
        const n = ctx.currentNode;
        console.log(chalk.bold("Current Node:"));
        console.log(`  ID:      ${chalk.blue(n.id)}`);
        console.log(`  Title:   ${chalk.white(n.title)}`);
        console.log(`  Type:    ${chalk.gray(n.type)}`);
        if (n.content) {
          console.log(`  Content: ${chalk.gray(n.content.slice(0, 100))}${n.content.length > 100 ? "…" : ""}`);
        }
      }
      break;
    }

    case "back": {
      ctx.goBack();
      break;
    }

    case "go": {
      const id = args[0];
      if (!id) {
        console.log(chalk.yellow("Usage: go <nodeId>"));
        break;
      }
      try {
        await ctx.goToNode(id);
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "get": {
      const id = args[0] ?? ctx.currentNode?.id;
      if (!id) {
        console.log(chalk.yellow("Usage: get <nodeId>"));
        break;
      }
      try {
        const node = await ctx.fetchNode(id);
        console.log(JSON.stringify(node, null, 2));
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "list": {
      const type = args[0];
      try {
        const result = await ctx.client.listNodes({
          type,
          limit: 20,
          page: 1,
        });
        if (result.items.length === 0) {
          console.log(chalk.yellow("No nodes found."));
        } else {
          console.log(chalk.bold(`Nodes (${result.total} total, showing ${result.items.length}):`));
          for (const item of result.items as GraphNode[]) {
            console.log(
              `  ${chalk.blue(item.id.slice(0, 8))} ${chalk.gray(`[${item.type}]`)} ${item.title}`,
            );
          }
        }
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "search": {
      const query = args.join(" ");
      if (!query) {
        console.log(chalk.yellow("Usage: search <query>"));
        break;
      }
      try {
        const result = await ctx.client.searchNodes({ query, limit: 10 });
        if (!result.hits || result.hits.length === 0) {
          console.log(chalk.yellow(`No results for "${query}"`));
        } else {
          console.log(chalk.bold(`Search results for "${query}":`));
          for (const hit of result.hits as Array<{ node: GraphNode; score?: number }>) {
            const score = hit.score !== undefined ? chalk.gray(` (score: ${hit.score.toFixed(3)})`) : "";
            console.log(
              `  ${chalk.blue(hit.node.id.slice(0, 8))} ${hit.node.title}${score}`,
            );
          }
        }
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "neighbors": {
      const id = args[0] ?? ctx.currentNode?.id;
      if (!id) {
        console.log(chalk.yellow("No current node. Use 'go <id>' first or specify an id."));
        break;
      }
      try {
        const edges = await ctx.client.listEdges({ nodeId: id, limit: 50, page: 1 });
        if (!edges.items || edges.items.length === 0) {
          console.log(chalk.yellow("No neighbors found."));
        } else {
          console.log(chalk.bold(`Neighbors of ${id.slice(0, 8)}:`));
          for (const edge of edges.items as GraphEdge[]) {
            const neighborId = edge.sourceId === id ? edge.targetId : edge.sourceId;
            const direction = edge.sourceId === id ? chalk.green("→") : chalk.blue("←");
            let neighborTitle = neighborId.slice(0, 8);
            try {
              const neighbor = await ctx.fetchNode(neighborId);
              neighborTitle = neighbor.title;
            } catch {
              // use id fallback
            }
            console.log(
              `  ${direction} ${chalk.cyan(neighborId.slice(0, 8))} ${neighborTitle} ${chalk.gray(`[${edge.type}]`)}`,
            );
          }
        }
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "path": {
      const targetId = args[0];
      const sourceId = ctx.currentNode?.id;
      if (!targetId || !sourceId) {
        console.log(chalk.yellow("Usage: path <targetId>  (must have a current node selected)"));
        break;
      }
      try {
        const result = await (ctx.client as unknown as {
          findPath?: (from: string, to: string) => Promise<{ path: string[] }>;
        }).findPath?.(sourceId, targetId);
        if (!result) {
          console.log(chalk.yellow("Path finding not supported by this server."));
        } else if (!result.path || result.path.length === 0) {
          console.log(chalk.yellow("No path found."));
        } else {
          console.log(chalk.bold(`Path (${result.path.length} hops):`));
          const pathParts = result.path.map((id: string) => chalk.cyan(id.slice(0, 8)));
          console.log("  " + pathParts.join(chalk.gray(" → ")));
        }
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    case "delete": {
      const id = args[0] ?? ctx.currentNode?.id;
      if (!id) {
        console.log(chalk.yellow("Usage: delete <nodeId>"));
        break;
      }
      try {
        await ctx.client.deleteNode(id);
        ctx.nodeCache.delete(id);
        if (ctx.currentNode?.id === id) ctx.currentNode = null;
        console.log(chalk.green(`Node ${id} deleted.`));
      } catch (err) {
        console.log(chalk.red(`Error: ${(err as Error).message}`));
      }
      break;
    }

    default: {
      const suggestions = COMMANDS.filter((c) => c.startsWith(cmd));
      if (suggestions.length > 0) {
        console.log(
          chalk.yellow(`Unknown command "${cmd}". Did you mean: ${suggestions.join(", ")}?`),
        );
      } else {
        console.log(chalk.yellow(`Unknown command "${cmd}". Type 'help' for available commands.`));
      }
    }
  }

  return true;
}

async function startRepl(): Promise<void> {
  const ctx = new ReplContext();

  console.log(chalk.bold.cyan("\nNexus Interactive Shell"));
  console.log(chalk.gray(`Connected to: ${getApiUrl()}`));
  console.log(chalk.gray("Type 'help' for available commands, 'exit' to quit.\n"));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string): [string[], string] => {
      const completions = COMMANDS.filter((c) => c.startsWith(line.toLowerCase()));
      return [completions.length ? completions : COMMANDS, line];
    },
    terminal: true,
  });

  // Enable history
  (rl as unknown as { history: string[] }).history = ctx.commandHistory;

  const askNext = (): void => {
    rl.question(ctx.getPrompt(), async (input: string) => {
      const trimmed = input.trim();
      if (trimmed) {
        ctx.commandHistory.unshift(trimmed);
        if (ctx.commandHistory.length > 100) ctx.commandHistory.pop();
      }

      const cont = await handleCommand(trimmed, ctx, rl);
      if (!cont) {
        rl.close();
        return;
      }
      askNext();
    });
  };

  rl.on("close", () => {
    process.exit(0);
  });

  askNext();
}

export const interactiveCommands = new Command("interactive")
  .alias("repl")
  .description("Start an interactive REPL session")
  .action(async () => {
    try {
      await startRepl();
    } catch (err) {
      console.error(chalk.red(`Fatal error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
