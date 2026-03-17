import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, getToken } from "../config.js";

function getClient(): NexusClient {
  return new NexusClient({
    baseUrl: getApiUrl(),
    accessToken: getToken(),
  });
}

interface ImportResult {
  nodes: number;
  edges: number;
  errors: string[];
  skipped: number;
}

function collectMarkdownFiles(path: string): string[] {
  const files: string[] = [];
  const stat = statSync(path);
  if (stat.isDirectory()) {
    const entries = readdirSync(path);
    for (const entry of entries) {
      const full = join(path, entry);
      const entryStat = statSync(full);
      if (entryStat.isDirectory()) {
        files.push(...collectMarkdownFiles(full));
      } else if (extname(entry).toLowerCase() === ".md") {
        files.push(full);
      }
    }
  } else if (extname(path).toLowerCase() === ".md") {
    files.push(path);
  }
  return files;
}

function parseMarkdownFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const frontmatter: Record<string, string> = {};
  let body = content;
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    const [, fm, rest] = match;
    if (fm && rest !== undefined) {
      body = rest;
      for (const line of fm.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          frontmatter[key] = value;
        }
      }
    }
  }
  return { frontmatter, body };
}

function extractMarkdownTitle(content: string, filePath: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) return h1Match[1].trim();
  return basename(filePath, ".md");
}

export const importCommands = new Command("import").description(
  "Import data into Nexus",
);

importCommands
  .command("markdown <path>")
  .description("Import markdown files or directory")
  .option("--dry-run", "Preview import without writing data")
  .option("--verbose", "Show detailed output per file")
  .option("--type <type>", "Node type to assign", "document")
  .action(async (path: string, opts: { dryRun?: boolean; verbose?: boolean; type: string }) => {
    if (!existsSync(path)) {
      console.error(chalk.red(`Path not found: ${path}`));
      process.exit(1);
    }

    const files = collectMarkdownFiles(path);
    if (files.length === 0) {
      console.log(chalk.yellow("No markdown files found."));
      return;
    }

    console.log(chalk.cyan(`Found ${files.length} markdown file(s)`));
    if (opts.dryRun) {
      console.log(chalk.yellow("Dry-run mode: no data will be written"));
    }

    const result: ImportResult = { nodes: 0, edges: 0, errors: [], skipped: 0 };
    const spinner = ora("Importing markdown files...").start();
    const client = getClient();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      spinner.text = `[${i + 1}/${files.length}] ${basename(file ?? "")}`;

      try {
        const content = readFileSync(file, "utf-8");
        const { frontmatter, body } = parseMarkdownFrontmatter(content);
        const title = frontmatter["title"] ?? extractMarkdownTitle(body, file);
        const nodeType = frontmatter["type"] ?? opts.type;

        if (opts.verbose) {
          spinner.stop();
          console.log(chalk.gray(`  -> ${file} | title: "${title}" | type: ${nodeType}`));
          spinner.start();
        }

        if (!opts.dryRun) {
          await client.createNode({
            title,
            type: nodeType,
            content: body,
            ownerId: "00000000-0000-0000-0000-000000000000",
            metadata: { ...frontmatter, sourcePath: file },
          });
        }
        result.nodes++;
      } catch (err) {
        result.errors.push(`${file}: ${(err as Error).message}`);
      }
    }

    spinner.stop();
    printImportSummary(result, opts.dryRun ?? false);
  });

importCommands
  .command("csv <path>")
  .description("Import CSV file with column mapping")
  .option("--mapping <json>", "JSON column mapping e.g. {\"title\":\"Name\",\"content\":\"Body\"}")
  .option("--type <type>", "Node type to assign", "record")
  .option("--dry-run", "Preview import without writing data")
  .option("--verbose", "Show detailed output per row")
  .action(async (
    path: string,
    opts: { mapping?: string; type: string; dryRun?: boolean; verbose?: boolean },
  ) => {
    if (!existsSync(path)) {
      console.error(chalk.red(`File not found: ${path}`));
      process.exit(1);
    }

    let mapping: Record<string, string> = { title: "title", content: "content" };
    if (opts.mapping) {
      try {
        mapping = JSON.parse(opts.mapping) as Record<string, string>;
      } catch {
        console.error(chalk.red("Invalid JSON mapping"));
        process.exit(1);
      }
    }

    const raw = readFileSync(path, "utf-8");
    const lines = raw.trim().split("\n");
    if (lines.length < 2) {
      console.log(chalk.yellow("CSV file has no data rows."));
      return;
    }

    const headers = (lines[0] ?? "").split(",").map((h: string) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1);

    console.log(chalk.cyan(`Found ${rows.length} rows in CSV`));
    if (opts.dryRun) console.log(chalk.yellow("Dry-run mode: no data will be written"));

    const result: ImportResult = { nodes: 0, edges: 0, errors: [], skipped: 0 };
    const spinner = ora("Importing CSV rows...").start();
    const client = getClient();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      spinner.text = `[${i + 1}/${rows.length}] Row ${i + 1}`;

      try {
        const values = row.split(",").map((v: string) => v.trim().replace(/^"|"$/g, ""));
        const record: Record<string, string> = {};
        headers.forEach((h: string, idx: number) => {
          record[h] = values[idx] ?? "";
        });

        const titleCol = mapping["title"] ?? "title";
        const contentCol = mapping["content"] ?? "content";
        const title = record[titleCol] ?? `Row ${i + 1}`;
        const content = record[contentCol] ?? "";

        if (!title) {
          result.skipped++;
          continue;
        }

        if (opts.verbose) {
          spinner.stop();
          console.log(chalk.gray(`  -> row ${i + 1} | title: "${title}"`));
          spinner.start();
        }

        if (!opts.dryRun) {
          await client.createNode({
            title,
            type: opts.type,
            content,
            ownerId: "00000000-0000-0000-0000-000000000000",
            metadata: record,
          });
        }
        result.nodes++;
      } catch (err) {
        result.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    spinner.stop();
    printImportSummary(result, opts.dryRun ?? false);
  });

importCommands
  .command("json <path>")
  .description("Import JSON data (array of objects or single object)")
  .option("--type <type>", "Node type to assign", "document")
  .option("--dry-run", "Preview import without writing data")
  .option("--verbose", "Show detailed output per item")
  .option("--title-field <field>", "Field to use as title", "title")
  .option("--content-field <field>", "Field to use as content", "content")
  .action(async (
    path: string,
    opts: {
      type: string;
      dryRun?: boolean;
      verbose?: boolean;
      titleField: string;
      contentField: string;
    },
  ) => {
    if (!existsSync(path)) {
      console.error(chalk.red(`File not found: ${path}`));
      process.exit(1);
    }

    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path, "utf-8"));
    } catch (err) {
      console.error(chalk.red(`Invalid JSON: ${(err as Error).message}`));
      process.exit(1);
    }

    const items: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [data as Record<string, unknown>];

    console.log(chalk.cyan(`Found ${items.length} item(s) in JSON`));
    if (opts.dryRun) console.log(chalk.yellow("Dry-run mode: no data will be written"));

    const result: ImportResult = { nodes: 0, edges: 0, errors: [], skipped: 0 };
    const spinner = ora("Importing JSON items...").start();
    const client = getClient();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      spinner.text = `[${i + 1}/${items.length}] Item ${i + 1}`;

      try {
        const title = String(item[opts.titleField] ?? `Item ${i + 1}`);
        const content = typeof item[opts.contentField] === "string"
          ? (item[opts.contentField] as string)
          : JSON.stringify(item[opts.contentField] ?? "");

        if (opts.verbose) {
          spinner.stop();
          console.log(chalk.gray(`  -> item ${i + 1} | title: "${title}"`));
          spinner.start();
        }

        if (!opts.dryRun) {
          await client.createNode({
            title,
            type: opts.type,
            content,
            ownerId: "00000000-0000-0000-0000-000000000000",
            metadata: Object.fromEntries(
              Object.entries(item).map(([k, v]) => [k, String(v ?? "")]),
            ),
          });
        }
        result.nodes++;
      } catch (err) {
        result.errors.push(`Item ${i + 1}: ${(err as Error).message}`);
      }
    }

    spinner.stop();
    printImportSummary(result, opts.dryRun ?? false);
  });

function printImportSummary(result: ImportResult, dryRun: boolean): void {
  console.log();
  console.log(chalk.bold("Import Summary"));
  console.log(chalk.gray("─".repeat(40)));
  console.log(`  Nodes: ${chalk.green(String(result.nodes))}`);
  console.log(`  Edges: ${chalk.green(String(result.edges))}`);
  if (result.skipped > 0) {
    console.log(`  Skipped: ${chalk.yellow(String(result.skipped))}`);
  }
  if (result.errors.length > 0) {
    console.log(`  Errors: ${chalk.red(String(result.errors.length))}`);
    for (const err of result.errors) {
      console.log(chalk.red(`    - ${err}`));
    }
  }
  if (dryRun) {
    console.log(chalk.yellow("\n  (Dry-run: no data was written)"));
  } else {
    console.log(chalk.green("\n  Import complete."));
  }
}
