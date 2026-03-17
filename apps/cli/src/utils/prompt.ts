import chalk from "chalk";
import { createInterface } from "node:readline";

/**
 * Ask a yes/no question. Returns true if user answers 'y' or 'yes'.
 */
export async function confirm(
  question: string,
  defaultValue = false,
): Promise<boolean> {
  const hint = defaultValue ? chalk.gray("[Y/n]") : chalk.gray("[y/N]");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${chalk.yellow("?")} ${question} ${hint} `, (answer: string) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") resolve(defaultValue);
      else resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

/**
 * Ask for a text input with optional validation.
 */
export async function input(
  question: string,
  opts: {
    default?: string;
    validate?: (val: string) => string | true;
    placeholder?: string;
  } = {},
): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = opts.default ? chalk.gray(` (${opts.default})`) : "";

  return new Promise((resolve) => {
    const ask = (): void => {
      rl.question(`${chalk.cyan("?")} ${question}${hint}: `, (answer: string) => {
        const value = answer.trim() || opts.default || "";

        if (opts.validate) {
          const result = opts.validate(value);
          if (result !== true) {
            console.log(chalk.red(`  ✗ ${result}`));
            ask();
            return;
          }
        }

        rl.close();
        resolve(value);
      });
    };
    ask();
  });
}

/**
 * Password input with masked characters.
 */
export async function password(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    // Disable echo
    process.stdin.setRawMode?.(true);
    rl.question(`${chalk.cyan("?")} ${question}: `, (_answer: string) => {
      // readline with rawMode won't actually capture properly, so we handle it manually
      rl.close();
    });

    let pwd = "";

    const onData = (char: Buffer): void => {
      const c = char.toString();
      if (c === "\r" || c === "\n") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(pwd);
      } else if (c === "\u0003") {
        // Ctrl+C
        process.stdin.setRawMode?.(false);
        process.exit(0);
      } else if (c === "\u007f" || c === "\b") {
        // Backspace
        if (pwd.length > 0) {
          pwd = pwd.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        pwd += c;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

/**
 * Select one option from a list using arrow keys (simplified: numbered menu).
 */
export async function select<T extends string>(
  question: string,
  choices: T[],
  opts: { default?: T } = {},
): Promise<T> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log(`${chalk.cyan("?")} ${question}`);
    choices.forEach((choice, i) => {
      const isDefault = choice === opts.default;
      const marker = isDefault ? chalk.green("●") : chalk.gray("○");
      console.log(`  ${marker} ${chalk.white(String(i + 1))}. ${choice}`);
    });

    const defaultIdx = opts.default ? choices.indexOf(opts.default) + 1 : 1;
    const hint = chalk.gray(`[1-${choices.length}, default: ${defaultIdx}]`);

    const ask = (): void => {
      rl.question(`  Enter selection ${hint}: `, (answer: string) => {
        const trimmed = answer.trim();
        if (trimmed === "") {
          rl.close();
          resolve(opts.default ?? choices[0]!);
          return;
        }

        const idx = parseInt(trimmed, 10);
        if (isNaN(idx) || idx < 1 || idx > choices.length) {
          console.log(chalk.red(`  Please enter a number between 1 and ${choices.length}`));
          ask();
          return;
        }

        rl.close();
        resolve(choices[idx - 1]!);
      });
    };
    ask();
  });
}

/**
 * Multi-select: pick multiple options from a list.
 */
export async function multiSelect<T extends string>(
  question: string,
  choices: T[],
  opts: { defaults?: T[]; min?: number; max?: number } = {},
): Promise<T[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const selected = new Set<T>(opts.defaults ?? []);

  return new Promise((resolve) => {
    const render = (): void => {
      console.log(`${chalk.cyan("?")} ${question} ${chalk.gray("(space-separated numbers, or 'a' for all)")}`);
      choices.forEach((choice, i) => {
        const isSelected = selected.has(choice);
        const marker = isSelected ? chalk.green("☑") : chalk.gray("☐");
        const label = isSelected ? chalk.green(choice) : chalk.white(choice);
        console.log(`  ${marker} ${chalk.gray(String(i + 1))}. ${label}`);
      });
    };

    render();

    const ask = (): void => {
      rl.question(`  Enter selections: `, (answer: string) => {
        const trimmed = answer.trim().toLowerCase();

        if (trimmed === "a") {
          choices.forEach((c) => selected.add(c));
        } else if (trimmed === "") {
          // Keep current selection
        } else {
          const parts = trimmed.split(/[\s,]+/);
          for (const part of parts) {
            const idx = parseInt(part, 10);
            if (!isNaN(idx) && idx >= 1 && idx <= choices.length) {
              const choice = choices[idx - 1]!;
              if (selected.has(choice)) selected.delete(choice);
              else selected.add(choice);
            }
          }
        }

        const result = Array.from(selected);

        if (opts.min && result.length < opts.min) {
          console.log(chalk.red(`  Please select at least ${opts.min} option(s)`));
          ask();
          return;
        }

        if (opts.max && result.length > opts.max) {
          console.log(chalk.red(`  Please select at most ${opts.max} option(s)`));
          ask();
          return;
        }

        rl.close();
        resolve(result);
      });
    };
    ask();
  });
}

/**
 * Prompt for a number within an optional range.
 */
export async function numberInput(
  question: string,
  opts: { default?: number; min?: number; max?: number; integer?: boolean } = {},
): Promise<number> {
  return new Promise((resolve) => {
    const validate = (val: string): string | true => {
      const n = Number(val);
      if (val === "" && opts.default !== undefined) return true;
      if (isNaN(n)) return "Please enter a valid number";
      if (opts.integer && !Number.isInteger(n)) return "Please enter a whole number";
      if (opts.min !== undefined && n < opts.min) return `Minimum value is ${opts.min}`;
      if (opts.max !== undefined && n > opts.max) return `Maximum value is ${opts.max}`;
      return true;
    };

    const hint =
      opts.min !== undefined && opts.max !== undefined
        ? ` (${opts.min}-${opts.max})`
        : opts.min !== undefined
        ? ` (min: ${opts.min})`
        : opts.max !== undefined
        ? ` (max: ${opts.max})`
        : "";

    input(`${question}${hint}`, {
      default: opts.default !== undefined ? String(opts.default) : undefined,
      validate,
    }).then((val) => {
      const n = val === "" && opts.default !== undefined ? opts.default : Number(val);
      resolve(n);
    });
  });
}

/**
 * Show a simple spinner message while an async operation runs.
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  process.stdout.write(chalk.gray(`⠋ ${message}...`));
  try {
    const result = await fn();
    process.stdout.write(`\r${chalk.green("✓")} ${message}\n`);
    return result;
  } catch (err) {
    process.stdout.write(`\r${chalk.red("✗")} ${message}\n`);
    throw err;
  }
}

/**
 * Prompt for a list of values (one per line, end with empty line).
 */
export async function listInput(question: string): Promise<string[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const items: string[] = [];

  return new Promise((resolve) => {
    console.log(`${chalk.cyan("?")} ${question} ${chalk.gray("(one per line, empty line to finish)")}`);

    const ask = (): void => {
      rl.question("  > ", (line: string) => {
        const trimmed = line.trim();
        if (trimmed === "") {
          rl.close();
          resolve(items);
        } else {
          items.push(trimmed);
          ask();
        }
      });
    };
    ask();
  });
}
