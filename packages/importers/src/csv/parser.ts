import type { ParsedCSVDocument, CSVParseOptions, ColumnType } from "../types.js";

// Token types for the CSV state machine
type TokenState = "field" | "quoted" | "escaped";

export class CSVParser {
  // Parse CSV string into structured document
  parse(content: string, options: CSVParseOptions = {}): ParsedCSVDocument {
    const {
      delimiter = ",",
      quote = '"',
      escape = '"',
      headers = true,
      skipEmptyLines = true,
      trim = true,
      maxRows,
    } = options;

    const rawRows = this.tokenize(content, delimiter, quote, escape);

    let headerRow: string[] = [];
    let dataRows: string[][] = rawRows;

    if (headers === true) {
      const firstRow = rawRows[0];
      if (!firstRow) {
        return { headers: [], rows: [], totalRows: 0, detectedTypes: {} };
      }
      headerRow = trim ? firstRow.map((h) => h.trim()) : firstRow;
      dataRows = rawRows.slice(1);
    } else if (Array.isArray(headers)) {
      headerRow = headers;
    } else {
      // Auto-generate column names
      const width = rawRows[0]?.length ?? 0;
      headerRow = Array.from({ length: width }, (_, i) => `col${i}`);
    }

    if (skipEmptyLines) {
      dataRows = dataRows.filter((row) => row.some((cell) => cell.trim() !== ""));
    }

    if (maxRows !== undefined) {
      dataRows = dataRows.slice(0, maxRows);
    }

    const rows: Record<string, string>[] = dataRows.map((row) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < headerRow.length; i++) {
        const key = headerRow[i] ?? `col${i}`;
        const rawValue = row[i] ?? "";
        record[key] = trim ? rawValue.trim() : rawValue;
      }
      return record;
    });

    const detectedTypes = this.detectColumnTypes(headerRow, rows);

    return {
      headers: headerRow,
      rows,
      totalRows: rows.length,
      detectedTypes,
    };
  }

  // Tokenize CSV content using a state machine
  private tokenize(
    content: string,
    delimiter: string,
    quote: string,
    escape: string,
  ): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = "";
    let state: TokenState = "field";
    let i = 0;

    const delim = delimiter[0] ?? ",";
    const q = quote[0] ?? '"';
    const esc = escape[0] ?? '"';

    while (i < content.length) {
      const ch = content[i] ?? "";
      const next = content[i + 1] ?? "";

      switch (state) {
        case "field":
          if (ch === q) {
            // Start of quoted field
            state = "quoted";
            i++;
          } else if (ch === delim) {
            // End of field
            currentRow.push(currentField);
            currentField = "";
            i++;
          } else if (ch === "\r" && next === "\n") {
            // Windows line ending
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = "";
            i += 2;
          } else if (ch === "\n" || ch === "\r") {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = "";
            i++;
          } else {
            currentField += ch;
            i++;
          }
          break;

        case "quoted":
          if (ch === esc && next === q) {
            // Escaped quote character
            currentField += q;
            i += 2;
          } else if (ch === q) {
            // End of quoted field
            state = "field";
            i++;
          } else {
            currentField += ch;
            i++;
          }
          break;

        case "escaped":
          currentField += ch;
          state = "quoted";
          i++;
          break;
      }
    }

    // Push last field/row
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }

  // Auto-detect the semantic type of each column
  detectColumnTypes(
    headers: string[],
    rows: Record<string, string>[],
  ): Record<string, ColumnType> {
    const types: Record<string, ColumnType> = {};

    for (const header of headers) {
      types[header] = this.detectSingleColumnType(header, rows);
    }

    return types;
  }

  private detectSingleColumnType(
    header: string,
    rows: Record<string, string>[],
  ): ColumnType {
    const lowerHeader = header.toLowerCase();

    // Name-based heuristics
    if (/^(id|uuid|node_?id|key)$/i.test(lowerHeader)) return "id";
    if (/^(title|name|label|heading)$/i.test(lowerHeader)) return "title";
    if (/^(content|body|text|description|summary|notes?)$/i.test(lowerHeader)) return "content";
    if (/^(type|kind|category|class)$/i.test(lowerHeader)) return "type";
    if (/^(tags?|labels?|keywords?)$/i.test(lowerHeader)) return "tags";
    if (/^(source_?id|from|src)$/i.test(lowerHeader)) return "id";
    if (/^(target_?id|to|dest)$/i.test(lowerHeader)) return "id";
    if (/^(date|created_?at|updated_?at|timestamp)$/i.test(lowerHeader)) return "date";

    // Value-based sampling
    const sample = rows.slice(0, 20).map((r) => r[header] ?? "").filter(Boolean);
    if (sample.length === 0) return "unknown";

    const numericCount = sample.filter((v) => /^-?\d+(\.\d+)?$/.test(v)).length;
    const boolCount = sample.filter((v) => /^(true|false|yes|no|1|0)$/i.test(v)).length;
    const dateCount = sample.filter((v) => !isNaN(Date.parse(v))).length;
    const uuidCount = sample.filter((v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    ).length;

    const ratio = (n: number) => n / sample.length;

    if (ratio(uuidCount) > 0.8) return "id";
    if (ratio(boolCount) > 0.8) return "boolean";
    if (ratio(numericCount) > 0.8) return "number";
    if (ratio(dateCount) > 0.7 && numericCount < dateCount) return "date";

    // Long values suggest content
    const avgLen = sample.reduce((sum, v) => sum + v.length, 0) / sample.length;
    if (avgLen > 100) return "content";
    if (avgLen > 20) return "title";

    return "unknown";
  }

  // Parse CSV from a stream-like string in chunks
  parseStream(
    content: string,
    options: CSVParseOptions,
    onBatch: (rows: Record<string, string>[]) => void,
    batchSize = 500,
  ): void {
    const doc = this.parse(content, options);
    const { rows } = doc;

    for (let i = 0; i < rows.length; i += batchSize) {
      onBatch(rows.slice(i, i + batchSize));
    }
  }

  // Detect delimiter by sampling first line
  detectDelimiter(content: string): string {
    const firstLine = content.split("\n")[0] ?? "";
    const candidates = [",", "\t", ";", "|"];
    let bestDelim = ",";
    let bestCount = 0;

    for (const delim of candidates) {
      // Count unquoted occurrences
      let inQuote = false;
      let count = 0;
      for (const ch of firstLine) {
        if (ch === '"') inQuote = !inQuote;
        if (!inQuote && ch === delim) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestDelim = delim;
      }
    }

    return bestDelim;
  }

  // Convert parsed rows back to CSV string
  serialize(
    rows: Record<string, string>[],
    headers: string[],
    delimiter = ",",
    quote = '"',
  ): string {
    const lines: string[] = [headers.map((h) => this.quoteField(h, delimiter, quote)).join(delimiter)];

    for (const row of rows) {
      const fields = headers.map((h) => this.quoteField(row[h] ?? "", delimiter, quote));
      lines.push(fields.join(delimiter));
    }

    return lines.join("\n");
  }

  private quoteField(value: string, delimiter: string, quote: string): string {
    if (value.includes(delimiter) || value.includes(quote) || value.includes("\n")) {
      return `${quote}${value.replace(new RegExp(quote, "g"), quote + quote)}${quote}`;
    }
    return value;
  }
}
