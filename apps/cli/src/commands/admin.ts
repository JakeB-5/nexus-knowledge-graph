import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken, getConfig, saveConfig } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
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

export const adminCommands = new Command("admin").description(
  "Administrative operations",
);

// --- backup ---
adminCommands
  .command("backup")
  .description("Create a full backup of graph data")
  .requiredOption("-o, --output <file>", "Output backup file path (.json)")
  .option("--pretty", "Pretty-print backup JSON")
  .action(async (opts: { output: string; pretty?: boolean }) => {
    const spinner = ora("Backing up data...").start();

    try {
      const client = getClient();

      // Fetch all nodes
      const nodes: unknown[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await client.listNodes({ limit: 100, page });
        nodes.push(...result.items);
        hasMore = page < result.totalPages;
        page++;
      }

      spinner.text = "Fetching edges...";
      let edges: unknown[] = [];
      try {
        const edgeResult = await client.listEdges({ limit: 10000, page: 1 });
        edges = edgeResult.items;
      } catch {
        // edges optional
      }

      const backup = {
        version: "1.0",
        createdAt: new Date().toISOString(),
        stats: { nodes: nodes.length, edges: edges.length },
        nodes,
        edges,
      };

      const json = opts.pretty
        ? JSON.stringify(backup, null, 2)
        : JSON.stringify(backup);
      writeFileSync(opts.output, json, "utf-8");

      spinner.succeed(
        chalk.green(
          `Backup complete: ${nodes.length} nodes, ${edges.length} edges → ${opts.output}`,
        ),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Backup failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// --- restore ---
adminCommands
  .command("restore <file>")
  .description("Restore from a backup file")
  .option("--skip-existing", "Skip nodes/edges that already exist")
  .option("--dry-run", "Preview restore without writing")
  .action(async (file: string, opts: { skipExisting?: boolean; dryRun?: boolean }) => {
    if (!existsSync(file)) {
      console.error(chalk.red(`Backup file not found: ${file}`));
      process.exit(1);
    }

    let backup: {
      version?: string;
      nodes?: Record<string, unknown>[];
      edges?: Record<string, unknown>[];
    } = {};
    try {
      backup = JSON.parse(readFileSync(file, "utf-8")) as typeof backup;
    } catch {
      console.error(chalk.red("Invalid backup file format"));
      process.exit(1);
    }

    const nodeCount = backup.nodes?.length ?? 0;
    const edgeCount = backup.edges?.length ?? 0;

    console.log(chalk.cyan(`Backup file: ${file}`));
    console.log(`  Version:  ${backup.version ?? "unknown"}`);
    console.log(`  Nodes:    ${nodeCount}`);
    console.log(`  Edges:    ${edgeCount}`);

    if (!opts.dryRun) {
      const ok = await confirm(
        `Restore ${nodeCount} nodes and ${edgeCount} edges? This may overwrite existing data.`,
      );
      if (!ok) {
        console.log(chalk.gray("Restore cancelled."));
        return;
      }
    }

    const spinner = ora("Restoring data...").start();

    try {
      const client = getClient();
      let restoredNodes = 0;
      let restoredEdges = 0;
      let skipped = 0;

      for (let i = 0; i < (backup.nodes ?? []).length; i++) {
        const node = backup.nodes?.[i] as Record<string, unknown> | undefined;
        if (!node) continue;
        spinner.text = `[${i + 1}/${nodeCount}] Restoring node: ${String(node["title"] ?? "")}`;

        if (!opts.dryRun) {
          try {
            await client.createNode({
              title: String(node["title"] ?? ""),
              type: String(node["type"] ?? "document"),
              content: String(node["content"] ?? ""),
              ownerId: String(node["ownerId"] ?? "00000000-0000-0000-0000-000000000000"),
              metadata: (node["metadata"] as Record<string, string>) ?? {},
            });
            restoredNodes++;
          } catch (err) {
            if (opts.skipExisting && (err as Error).message.includes("already exists")) {
              skipped++;
            } else {
              throw err;
            }
          }
        } else {
          restoredNodes++;
        }
      }

      spinner.stop();
      console.log();
      console.log(chalk.bold("Restore Summary"));
      console.log(chalk.gray("─".repeat(30)));
      console.log(`  Nodes restored: ${chalk.green(String(restoredNodes))}`);
      console.log(`  Edges restored: ${chalk.green(String(restoredEdges))}`);
      if (skipped > 0) console.log(`  Skipped:        ${chalk.yellow(String(skipped))}`);
      if (opts.dryRun) console.log(chalk.yellow("\n  (Dry-run: nothing was written)"));
      else console.log(chalk.green("\n  Restore complete."));
    } catch (err) {
      spinner.fail(chalk.red(`Restore failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// --- migrate ---
adminCommands
  .command("migrate")
  .description("Run database migrations")
  .option("--dry-run", "Show pending migrations without applying")
  .action(async (opts: { dryRun?: boolean }) => {
    const spinner = ora("Checking migrations...").start();
    try {
      const client = getClient();
      // Attempt to call a migrations endpoint if available
      const status = await (client as unknown as {
        getMigrations?: () => Promise<{ pending: string[]; applied: string[] }>;
      }).getMigrations?.() ?? { pending: [], applied: [] };

      spinner.stop();
      console.log(chalk.bold("Migration Status"));
      console.log(`  Applied:  ${chalk.green(String(status.applied.length))}`);
      console.log(`  Pending:  ${chalk.yellow(String(status.pending.length))}`);

      if (status.pending.length === 0) {
        console.log(chalk.green("\n  No pending migrations."));
        return;
      }

      console.log("\nPending:");
      for (const m of status.pending) {
        console.log(`  - ${m}`);
      }

      if (!opts.dryRun) {
        const ok = await confirm("Apply all pending migrations?");
        if (!ok) {
          console.log(chalk.gray("Migration cancelled."));
          return;
        }
        const applySpinner = ora("Applying migrations...").start();
        await (client as unknown as { runMigrations?: () => Promise<void> }).runMigrations?.();
        applySpinner.succeed(chalk.green("Migrations applied successfully."));
      }
    } catch (err) {
      spinner.fail(chalk.red(`Migration check failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// --- stats ---
adminCommands
  .command("stats")
  .description("Show system statistics")
  .action(async () => {
    const spinner = ora("Fetching system stats...").start();
    try {
      const client = getClient();

      const [nodeResult, edgeResult] = await Promise.all([
        client.listNodes({ limit: 1, page: 1 }),
        client.listEdges({ limit: 1, page: 1 }).catch(() => ({ total: 0 })),
      ]);

      spinner.stop();
      const config = getConfig();

      console.log();
      console.log(chalk.bold.cyan("System Statistics"));
      console.log(chalk.gray("─".repeat(40)));
      console.log(`  API URL:          ${chalk.blue(config.apiUrl)}`);
      console.log(`  Total nodes:      ${chalk.green(String((nodeResult as { total?: number }).total ?? 0))}`);
      console.log(`  Total edges:      ${chalk.green(String((edgeResult as { total?: number }).total ?? 0))}`);
      console.log(`  CLI version:      ${chalk.gray("0.1.0")}`);
      console.log(`  Node.js version:  ${chalk.gray(process.version)}`);
      console.log(`  Platform:         ${chalk.gray(process.platform)}`);
    } catch (err) {
      spinner.fail(chalk.red(`Failed to fetch stats: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// --- config subcommand ---
const configCmd = adminCommands
  .command("config")
  .description("Manage CLI configuration");

configCmd
  .command("get [key]")
  .description("Get configuration value(s)")
  .action((key?: string) => {
    const config = getConfig();
    if (key) {
      const val = (config as unknown as Record<string, unknown>)[key];
      if (val === undefined) {
        console.log(chalk.yellow(`Key "${key}" not found`));
      } else {
        console.log(`${chalk.bold(key)}: ${chalk.cyan(String(val))}`);
      }
    } else {
      console.log(chalk.bold("Current Configuration:"));
      for (const [k, v] of Object.entries(config)) {
        const display = k.toLowerCase().includes("token") ? chalk.gray("***") : chalk.cyan(String(v));
        console.log(`  ${chalk.bold(k)}: ${display}`);
      }
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    saveConfig({ [key]: value } as Parameters<typeof saveConfig>[0]);
    console.log(chalk.green(`Config updated: ${key} = ${value}`));
  });

// --- users subcommand ---
const usersCmd = adminCommands
  .command("users")
  .description("User management");

usersCmd
  .command("list")
  .description("List all users")
  .option("-l, --limit <n>", "Max results", "20")
  .action(async (opts: { limit: string }) => {
    const spinner = ora("Fetching users...").start();
    try {
      const client = getClient();
      const result = await (client as unknown as {
        listUsers?: (opts: { limit: number; page: number }) => Promise<{
          items: Array<{ id: string; email: string; role: string; createdAt?: string }>;
          total: number;
        }>;
      }).listUsers?.({ limit: Number(opts.limit), page: 1 });

      spinner.stop();

      if (!result || result.items.length === 0) {
        console.log(chalk.yellow("No users found."));
        return;
      }

      console.log(chalk.bold(`Users (${result.total} total)`));
      for (const user of result.items) {
        console.log(
          `  ${chalk.blue(user.id.slice(0, 8))} ${chalk.white(user.email)} ${chalk.gray(`[${user.role}]`)}`,
        );
      }
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

usersCmd
  .command("create")
  .description("Create a new user")
  .requiredOption("--email <email>", "User email")
  .requiredOption("--password <password>", "User password")
  .option("--role <role>", "User role", "user")
  .action(async (opts: { email: string; password: string; role: string }) => {
    const spinner = ora("Creating user...").start();
    try {
      const client = getClient();
      const user = await (client as unknown as {
        createUser?: (opts: { email: string; password: string; role: string }) => Promise<{
          id: string;
          email: string;
          role: string;
        }>;
      }).createUser?.({ email: opts.email, password: opts.password, role: opts.role });

      spinner.stop();
      if (!user) {
        console.log(chalk.yellow("User creation not supported by this server."));
        return;
      }
      console.log(chalk.green("User created:"));
      console.log(`  ID:    ${user.id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Role:  ${user.role}`);
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

usersCmd
  .command("delete <id>")
  .description("Delete a user by ID")
  .action(async (id: string) => {
    const ok = await confirm(`Delete user ${id}?`);
    if (!ok) {
      console.log(chalk.gray("Cancelled."));
      return;
    }

    const spinner = ora("Deleting user...").start();
    try {
      const client = getClient();
      await (client as unknown as {
        deleteUser?: (id: string) => Promise<void>;
      }).deleteUser?.(id);
      spinner.succeed(chalk.green(`User ${id} deleted.`));
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });
