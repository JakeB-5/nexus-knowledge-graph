import chalk from "chalk";

export type Alignment = "left" | "right" | "center";
export type OutputMode = "table" | "json" | "csv";

export interface ColumnDef {
  header: string;
  key?: string;
  width?: number;
  maxWidth?: number;
  align?: Alignment;
  color?: string;
  truncate?: boolean;
}

export interface TableOptions {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  mode?: OutputMode;
  showHeader?: boolean;
  showFooter?: boolean;
  footerRow?: Record<string, unknown>;
  rowSeparator?: boolean;
  borderColor?: string;
  headerColor?: string;
  maxColumnWidth?: number;
}

function pad(str: string, width: number, align: Alignment): string {
  const len = str.length;
  if (len >= width) return str;
  const diff = width - len;
  switch (align) {
    case "right":
      return " ".repeat(diff) + str;
    case "center": {
      const left = Math.floor(diff / 2);
      const right = diff - left;
      return " ".repeat(left) + str + " ".repeat(right);
    }
    default:
      return str + " ".repeat(diff);
  }
}

function truncateStr(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) return str;
  return str.slice(0, maxWidth - 1) + "…";
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function resolveWidths(columns: ColumnDef[], rows: Record<string, unknown>[], maxColumnWidth: number): number[] {
  return columns.map((col) => {
    if (col.width) return col.width;
    const headerLen = col.header.length;
    const dataLen = rows.reduce((max, row) => {
      const key = col.key ?? col.header.toLowerCase();
      const val = String(row[key] ?? "");
      return Math.max(max, val.length);
    }, 0);
    const natural = Math.max(headerLen, dataLen);
    const limit = col.maxWidth ?? maxColumnWidth;
    return Math.min(natural, limit);
  });
}

function renderBorder(widths: number[], left: string, mid: string, right: string, fill: string, borderColor: string): string {
  const segments = widths.map((w) => fill.repeat(w + 2));
  return chalk.hex(borderColor)(left + segments.join(mid) + right);
}

function renderRow(
  cells: string[],
  widths: number[],
  columns: ColumnDef[],
  borderColor: string,
): string {
  const sep = chalk.hex(borderColor)("│");
  const parts = cells.map((cell, i) => {
    const col = columns[i];
    const align = col?.align ?? "left";
    const width = widths[i] ?? 0;
    const truncated = col?.truncate !== false ? truncateStr(cell, width) : cell.slice(0, width);
    const padded = pad(truncated, width, align);
    const colored = col?.color ? chalk.hex(col.color)(padded) : padded;
    return ` ${colored} `;
  });
  return sep + parts.join(sep) + sep;
}

export class TableFormatter {
  private options: Required<TableOptions>;

  constructor(options: TableOptions) {
    this.options = {
      mode: "table",
      showHeader: true,
      showFooter: false,
      footerRow: {},
      rowSeparator: false,
      borderColor: "#666666",
      headerColor: "#ffffff",
      maxColumnWidth: 60,
      ...options,
    };
  }

  render(): string {
    const { mode } = this.options;

    switch (mode) {
      case "json":
        return this.renderJSON();
      case "csv":
        return this.renderCSV();
      default:
        return this.renderTable();
    }
  }

  print(): void {
    console.log(this.render());
  }

  private renderJSON(): string {
    const data = this.options.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of this.options.columns) {
        const key = col.key ?? col.header.toLowerCase();
        obj[key] = row[key];
      }
      return obj;
    });
    return JSON.stringify(data, null, 2);
  }

  private renderCSV(): string {
    const { columns, rows } = this.options;
    const headers = columns.map((c) => escapeCSV(c.header)).join(",");
    const dataRows = rows.map((row) =>
      columns
        .map((col) => {
          const key = col.key ?? col.header.toLowerCase();
          return escapeCSV(String(row[key] ?? ""));
        })
        .join(","),
    );
    return [headers, ...dataRows].join("\n");
  }

  private renderTable(): string {
    const { columns, rows, showHeader, showFooter, footerRow, rowSeparator, borderColor, headerColor, maxColumnWidth } = this.options;
    const widths = resolveWidths(columns, rows, maxColumnWidth);
    const lines: string[] = [];

    // Top border
    lines.push(renderBorder(widths, "┌", "┬", "┐", "─", borderColor));

    // Header
    if (showHeader) {
      const headerCells = columns.map((col) => chalk.hex(headerColor).bold(col.header));
      lines.push(renderRow(headerCells, widths, columns, borderColor));
      lines.push(renderBorder(widths, "├", "┼", "┤", "─", borderColor));
    }

    // Rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const cells = columns.map((col) => {
        const key = col.key ?? col.header.toLowerCase();
        return String(row[key] ?? "");
      });
      lines.push(renderRow(cells, widths, columns, borderColor));
      if (rowSeparator && i < rows.length - 1) {
        lines.push(renderBorder(widths, "├", "┼", "┤", "─", borderColor));
      }
    }

    // Footer
    if (showFooter && footerRow && Object.keys(footerRow).length > 0) {
      lines.push(renderBorder(widths, "├", "┼", "┤", "─", borderColor));
      const footerCells = columns.map((col) => {
        const key = col.key ?? col.header.toLowerCase();
        return chalk.bold(String(footerRow[key] ?? ""));
      });
      lines.push(renderRow(footerCells, widths, columns, borderColor));
    }

    // Bottom border
    lines.push(renderBorder(widths, "└", "┴", "┘", "─", borderColor));

    return lines.join("\n");
  }
}

/**
 * Quick helper to print a simple table from headers + rows
 */
export function printTable(
  headers: string[],
  rows: string[][],
  opts: Partial<Omit<TableOptions, "columns" | "rows">> = {},
): void {
  const columns: ColumnDef[] = headers.map((h) => ({ header: h }));
  const dataRows: Record<string, unknown>[] = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h.toLowerCase()] = row[i] ?? "";
    });
    return obj;
  });

  const formatter = new TableFormatter({ columns, rows: dataRows, ...opts });
  formatter.print();
}

/**
 * Auto-detect column widths from data and return formatted string
 */
export function formatTable(
  headers: string[],
  rows: string[][],
  mode: OutputMode = "table",
): string {
  const columns: ColumnDef[] = headers.map((h) => ({ header: h }));
  const dataRows: Record<string, unknown>[] = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h.toLowerCase()] = row[i] ?? "";
    });
    return obj;
  });
  return new TableFormatter({ columns, rows: dataRows, mode }).render();
}
