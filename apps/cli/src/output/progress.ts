import chalk from "chalk";

export interface ProgressBarOptions {
  total: number;
  label?: string;
  width?: number;
  showETA?: boolean;
  showRate?: boolean;
  showPercent?: boolean;
  showCount?: boolean;
  unit?: string;
  fillChar?: string;
  emptyChar?: string;
  fillColor?: string;
  labelColor?: string;
}

export interface MultiBarOptions {
  width?: number;
  showETA?: boolean;
  showRate?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}

export class ProgressBar {
  private total: number;
  private current: number = 0;
  private startTime: number;
  private options: Required<ProgressBarOptions>;
  private lastLineLength: number = 0;

  constructor(options: ProgressBarOptions) {
    this.total = options.total;
    this.startTime = Date.now();
    this.options = {
      label: "",
      width: 30,
      showETA: true,
      showRate: true,
      showPercent: true,
      showCount: true,
      unit: "items",
      fillChar: "█",
      emptyChar: "░",
      fillColor: "#00cc00",
      labelColor: "#cccccc",
      ...options,
    };
  }

  update(current: number, label?: string): void {
    this.current = Math.min(current, this.total);
    if (label !== undefined) this.options.label = label;
    this.render();
  }

  increment(by = 1, label?: string): void {
    this.update(this.current + by, label);
  }

  complete(label?: string): void {
    this.current = this.total;
    if (label !== undefined) this.options.label = label;
    this.render();
    process.stdout.write("\n");
  }

  private render(): void {
    const { width, fillChar, emptyChar, fillColor, labelColor, showETA, showRate, showPercent, showCount, unit, label } = this.options;

    const fraction = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(fraction * width);
    const empty = width - filled;

    const bar =
      chalk.hex(fillColor)(fillChar.repeat(filled)) +
      chalk.gray(emptyChar.repeat(empty));

    const parts: string[] = [];

    if (label) parts.push(chalk.hex(labelColor)(label));
    parts.push(`[${bar}]`);

    if (showPercent) {
      parts.push(chalk.white(`${Math.round(fraction * 100)}%`));
    }

    if (showCount) {
      parts.push(chalk.gray(`${this.current}/${this.total} ${unit}`));
    }

    if (showRate && this.current > 0) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = this.current / elapsed;
      parts.push(chalk.cyan(`${rate.toFixed(1)}/s`));
    }

    if (showETA && this.current > 0 && this.current < this.total) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;
      parts.push(chalk.gray(`ETA: ${formatDuration(remaining)}`));
    }

    const line = parts.join(" ");

    // Clear previous line and write new one
    if (this.lastLineLength > 0) {
      process.stdout.write("\r" + " ".repeat(this.lastLineLength) + "\r");
    }
    process.stdout.write(line);
    this.lastLineLength = line.replace(/\x1B\[[0-9;]*m/g, "").length;
  }

  getElapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  getRate(): number {
    const elapsed = this.getElapsed();
    return elapsed > 0 ? this.current / elapsed : 0;
  }

  getETA(): number {
    const rate = this.getRate();
    return rate > 0 ? (this.total - this.current) / rate : Infinity;
  }
}

export interface MultiBarEntry {
  id: string;
  bar: ProgressBar;
  label: string;
}

export class MultiProgressBar {
  private bars: Map<string, { bar: ProgressBar; label: string; line: number }> = new Map();
  private lineCount: number = 0;
  private opts: Required<MultiBarOptions>;

  constructor(options: MultiBarOptions = {}) {
    this.opts = {
      width: 30,
      showETA: true,
      showRate: true,
      ...options,
    };
  }

  add(id: string, label: string, total: number): ProgressBar {
    const bar = new ProgressBar({
      total,
      label,
      width: this.opts.width,
      showETA: this.opts.showETA,
      showRate: this.opts.showRate,
    });

    this.bars.set(id, { bar, label, line: this.lineCount });
    this.lineCount++;
    process.stdout.write("\n");

    return bar;
  }

  update(id: string, current: number, label?: string): void {
    const entry = this.bars.get(id);
    if (!entry) return;

    // Move cursor to the bar's line
    const linesBack = this.lineCount - entry.line;
    process.stdout.write(`\x1B[${linesBack}A`);
    entry.bar.update(current, label);
    // Move cursor back down
    process.stdout.write(`\x1B[${linesBack}B`);
  }

  complete(id: string, label?: string): void {
    const entry = this.bars.get(id);
    if (!entry) return;
    const linesBack = this.lineCount - entry.line;
    process.stdout.write(`\x1B[${linesBack}A`);
    entry.bar.complete(label);
    process.stdout.write(`\x1B[${linesBack - 1}B`);
  }

  completeAll(): void {
    for (const [id] of this.bars) {
      this.complete(id);
    }
  }
}

/**
 * Simple byte-based progress bar for file transfers
 */
export class ByteProgressBar {
  private bar: ProgressBar;
  private totalBytes: number;

  constructor(totalBytes: number, label = "Downloading") {
    this.totalBytes = totalBytes;
    this.bar = new ProgressBar({
      total: totalBytes,
      label,
      unit: "bytes",
      showRate: true,
      showETA: true,
    });
  }

  update(bytesReceived: number): void {
    this.bar.update(bytesReceived, `${formatBytes(bytesReceived)} / ${formatBytes(this.totalBytes)}`);
  }

  complete(): void {
    this.bar.complete(`${formatBytes(this.totalBytes)} downloaded`);
  }
}

/**
 * Spinner-less timed progress that just tracks elapsed time
 */
export class Timer {
  private startTime: number;

  constructor(label: string) {
    this.startTime = Date.now();
    process.stdout.write(chalk.gray(`${label}...`));
  }

  done(suffix = "done"): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    process.stdout.write(
      ` ${chalk.green(suffix)} ${chalk.gray(`(${elapsed}s)`)}\n`,
    );
  }

  fail(message: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    process.stdout.write(
      ` ${chalk.red(`failed: ${message}`)} ${chalk.gray(`(${elapsed}s)`)}\n`,
    );
  }
}
