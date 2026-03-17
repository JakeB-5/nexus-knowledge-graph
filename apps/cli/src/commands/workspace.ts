import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken, getConfig, saveConfig } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  nodeCount?: number;
}

type WorkspaceClient = {
  listWorkspaces?: () => Promise<Workspace[]>;
  createWorkspace?: (opts: { name: string; description?: string }) => Promise<Workspace>;
  deleteWorkspace?: (id: string) => Promise<void>;
  getWorkspace?: (id: string) => Promise<Workspace>;
  switchWorkspace?: (id: string) => Promise<void>;
};

function getWorkspaceClient(): WorkspaceClient {
  return getClient() as unknown as WorkspaceClient;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${question} [y/N] `), (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function getActiveWorkspace(): string | undefined {
  const config = getConfig() as unknown as Record<string, unknown>;
  return config["activeWorkspace"] as string | undefined;
}

function setActiveWorkspace(id: string | undefined): void {
  saveConfig({ activeWorkspace: id } as Parameters<typeof saveConfig>[0]);
}

export const workspaceCommands = new Command("workspace").description(
  "Manage workspaces",
);

workspaceCommands
  .command("list")
  .description("List all available workspaces")
  .action(async () => {
    const spinner = ora("Fetching workspaces...").start();
    try {
      const client = getWorkspaceClient();
      const workspaces = await client.listWorkspaces?.() ?? [];

      spinner.stop();

      if (workspaces.length === 0) {
        console.log(chalk.yellow("No workspaces found."));
        return;
      }

      const activeId = getActiveWorkspace();
      console.log(chalk.bold(`Workspaces (${workspaces.length})`));
      console.log();

      for (const ws of workspaces) {
        const isActive = ws.id === activeId;
        const marker = isActive ? chalk.green("● ") : chalk.gray("○ ");
        const name = isActive ? chalk.green.bold(ws.name) : chalk.white(ws.name);
        const desc = ws.description ? chalk.gray(` — ${ws.description}`) : "";
        const nodes = ws.nodeCount !== undefined ? chalk.gray(` (${ws.nodeCount} nodes)`) : "";
        console.log(`  ${marker}${name}${desc}${nodes}`);
        console.log(`    ${chalk.gray("id:")} ${chalk.blue(ws.id)}`);
        if (ws.createdAt) {
          console.log(`    ${chalk.gray("created:")} ${new Date(ws.createdAt).toLocaleDateString()}`);
        }
        console.log();
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

workspaceCommands
  .command("create <name>")
  .description("Create a new workspace")
  .option("-d, --description <desc>", "Workspace description")
  .option("--switch", "Switch to the new workspace after creation")
  .action(async (name: string, opts: { description?: string; switch?: boolean }) => {
    const spinner = ora(`Creating workspace "${name}"...`).start();
    try {
      const client = getWorkspaceClient();
      const ws = await client.createWorkspace?.({
        name,
        description: opts.description,
      });

      if (!ws) {
        spinner.fail(chalk.red("Workspace creation not supported by this server."));
        process.exit(1);
        return;
      }

      spinner.succeed(chalk.green(`Workspace "${ws.name}" created (id: ${ws.id})`));

      if (opts.switch) {
        setActiveWorkspace(ws.id);
        console.log(chalk.green(`Switched to workspace "${ws.name}"`));
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

workspaceCommands
  .command("switch <nameOrId>")
  .description("Switch to a different workspace")
  .action(async (nameOrId: string) => {
    const spinner = ora("Switching workspace...").start();
    try {
      const client = getWorkspaceClient();
      const workspaces = await client.listWorkspaces?.() ?? [];

      const ws = workspaces.find(
        (w) =>
          w.id === nameOrId ||
          w.name.toLowerCase() === nameOrId.toLowerCase(),
      );

      if (!ws) {
        spinner.fail(chalk.red(`Workspace "${nameOrId}" not found`));
        console.log(
          chalk.gray("Available: " + workspaces.map((w) => w.name).join(", ")),
        );
        process.exit(1);
        return;
      }

      setActiveWorkspace(ws.id);

      // Notify server if supported
      try {
        await client.switchWorkspace?.(ws.id);
      } catch {
        // server-side switch optional
      }

      spinner.succeed(chalk.green(`Switched to workspace "${ws.name}" (${ws.id})`));
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

workspaceCommands
  .command("info")
  .description("Show information about the current workspace")
  .action(async () => {
    const activeId = getActiveWorkspace();
    if (!activeId) {
      console.log(chalk.yellow("No active workspace set."));
      console.log(chalk.gray("Use: nexus workspace switch <name>"));
      return;
    }

    const spinner = ora("Fetching workspace info...").start();
    try {
      const client = getWorkspaceClient();
      let ws: Workspace | undefined;

      try {
        ws = await client.getWorkspace?.(activeId);
      } catch {
        // fallback: find from list
        const all = await client.listWorkspaces?.() ?? [];
        ws = all.find((w) => w.id === activeId);
      }

      spinner.stop();

      if (!ws) {
        console.log(chalk.yellow(`Workspace ${activeId} not found on server.`));
        return;
      }

      console.log();
      console.log(chalk.bold.cyan("Current Workspace"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`  ID:          ${chalk.blue(ws.id)}`);
      console.log(`  Name:        ${chalk.white.bold(ws.name)}`);
      if (ws.description) console.log(`  Description: ${chalk.gray(ws.description)}`);
      if (ws.nodeCount !== undefined) console.log(`  Nodes:       ${chalk.green(String(ws.nodeCount))}`);
      if (ws.createdAt) {
        console.log(`  Created:     ${new Date(ws.createdAt).toLocaleString()}`);
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

workspaceCommands
  .command("delete <nameOrId>")
  .description("Delete a workspace")
  .option("--force", "Skip confirmation prompt")
  .action(async (nameOrId: string, opts: { force?: boolean }) => {
    const spinner = ora("Looking up workspace...").start();
    try {
      const client = getWorkspaceClient();
      const workspaces = await client.listWorkspaces?.() ?? [];
      const ws = workspaces.find(
        (w) =>
          w.id === nameOrId ||
          w.name.toLowerCase() === nameOrId.toLowerCase(),
      );

      spinner.stop();

      if (!ws) {
        console.error(chalk.red(`Workspace "${nameOrId}" not found`));
        process.exit(1);
        return;
      }

      if (!opts.force) {
        const ok = await confirm(
          `Delete workspace "${ws.name}"? This will permanently remove all data.`,
        );
        if (!ok) {
          console.log(chalk.gray("Cancelled."));
          return;
        }
      }

      const delSpinner = ora(`Deleting workspace "${ws.name}"...`).start();
      await client.deleteWorkspace?.(ws.id);

      // Clear active workspace if it was deleted
      if (getActiveWorkspace() === ws.id) {
        setActiveWorkspace(undefined);
      }

      delSpinner.succeed(chalk.green(`Workspace "${ws.name}" deleted.`));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
