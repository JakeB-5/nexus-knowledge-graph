// Myers diff algorithm implementation for text diffing

import type { TextDiffLine, TextPatch, PatchHunk } from './types.js';

export interface MyersEdit {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

// Myers shortest edit script
function myersEditScript(a: string[], b: string[]): MyersEdit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) return [];

  // v[k] = x coordinate of furthest reaching path on diagonal k
  const v: Map<number, number> = new Map();
  v.set(1, 0);

  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    const snapshot = new Map(v);
    trace.push(snapshot);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const vkm1 = v.get(k - 1) ?? -1;
      const vkp1 = v.get(k + 1) ?? -1;

      if (k === -d || (k !== d && vkm1 < vkp1)) {
        x = vkp1;
      } else {
        x = vkm1 + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v.set(k, x);

      if (x >= n && y >= m) {
        return backtrack(trace, a, b, d);
      }
    }
  }

  return [];
}

function backtrack(
  trace: Map<number, number>[],
  a: string[],
  b: string[],
): MyersEdit[] {
  const edits: MyersEdit[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;

    let prevK: number;
    const vkm1 = v.get(k - 1) ?? -1;
    const vkp1 = v.get(k + 1) ?? -1;

    if (k === -d || (k !== d && vkm1 < vkp1)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX + 1 && y > prevY + 1) {
      edits.unshift({ type: 'equal', text: a[x - 1]! });
      x--;
      y--;
    }

    if (d > 0) {
      if (x === prevX + 1) {
        edits.unshift({ type: 'delete', text: a[x - 1]! });
        x--;
      } else {
        edits.unshift({ type: 'insert', text: b[y - 1]! });
        y--;
      }
    }

    while (x > prevX && y > prevY) {
      edits.unshift({ type: 'equal', text: a[x - 1]! });
      x--;
      y--;
    }
  }

  return edits;
}

export class TextDiff {
  // Line-by-line diff
  diffLines(oldText: string, newText: string): TextDiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    const edits = myersEditScript(oldLines, newLines);
    const result: TextDiffLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const edit of edits) {
      switch (edit.type) {
        case 'equal':
          result.push({
            type: 'equal',
            content: edit.text,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          });
          break;
        case 'delete':
          result.push({
            type: 'delete',
            content: edit.text,
            oldLineNumber: oldLineNum++,
            newLineNumber: null,
          });
          break;
        case 'insert':
          result.push({
            type: 'insert',
            content: edit.text,
            oldLineNumber: null,
            newLineNumber: newLineNum++,
          });
          break;
      }
    }

    return result;
  }

  // Word-by-word diff
  diffWords(oldText: string, newText: string): MyersEdit[] {
    const tokenize = (text: string): string[] =>
      text.split(/(\s+)/).filter(t => t.length > 0);

    const oldTokens = tokenize(oldText);
    const newTokens = tokenize(newText);
    return myersEditScript(oldTokens, newTokens);
  }

  // Character-by-character diff
  diffChars(oldText: string, newText: string): MyersEdit[] {
    const oldChars = [...oldText];
    const newChars = [...newText];
    return myersEditScript(oldChars, newChars);
  }

  // Generate unified diff format output
  toUnifiedFormat(
    diffLines: TextDiffLine[],
    contextLines = 3,
    fromFile = 'a',
    toFile = 'b',
  ): string {
    const hunks = this.buildHunks(diffLines, contextLines);
    if (hunks.length === 0) return '';

    const lines: string[] = [];
    lines.push(`--- ${fromFile}`);
    lines.push(`+++ ${toFile}`);

    for (const hunk of hunks) {
      lines.push(
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
      );
      for (const line of hunk.lines) {
        if (line.type === 'equal') lines.push(` ${line.content}`);
        else if (line.type === 'delete') lines.push(`-${line.content}`);
        else lines.push(`+${line.content}`);
      }
    }

    return lines.join('\n');
  }

  // Generate side-by-side diff format
  toSideBySideFormat(
    diffLines: TextDiffLine[],
    width = 80,
  ): string {
    const colWidth = Math.floor((width - 3) / 2);
    const rows: string[] = [];

    for (const line of diffLines) {
      const pad = (s: string) => s.slice(0, colWidth).padEnd(colWidth);
      switch (line.type) {
        case 'equal':
          rows.push(`${pad(line.content)} | ${pad(line.content)}`);
          break;
        case 'delete':
          rows.push(`${pad(line.content)} < ${' '.repeat(colWidth)}`);
          break;
        case 'insert':
          rows.push(`${' '.repeat(colWidth)} > ${pad(line.content)}`);
          break;
      }
    }

    return rows.join('\n');
  }

  // Build a patch from diff lines
  buildPatch(
    diffLines: TextDiffLine[],
    contextLines = 3,
    fromFile = 'a',
    toFile = 'b',
  ): TextPatch {
    return {
      hunks: this.buildHunks(diffLines, contextLines),
      fromFile,
      toFile,
    };
  }

  // Apply a text patch to original content
  applyPatch(original: string, patch: TextPatch): string {
    const lines = original.split('\n');
    const result: string[] = [...lines];
    let offset = 0;

    for (const hunk of patch.hunks) {
      const start = hunk.oldStart - 1 + offset;
      const deletions: string[] = [];
      const insertions: string[] = [];

      for (const line of hunk.lines) {
        if (line.type === 'delete') deletions.push(line.content);
        else if (line.type === 'insert') insertions.push(line.content);
      }

      result.splice(start, deletions.length, ...insertions);
      offset += insertions.length - deletions.length;
    }

    return result.join('\n');
  }

  // Fuzzy patch application: try to find the hunk in nearby lines
  applyPatchFuzzy(original: string, patch: TextPatch, fuzzFactor = 2): string {
    const lines = original.split('\n');
    const result: string[] = [...lines];
    let offset = 0;

    for (const hunk of patch.hunks) {
      const targetStart = hunk.oldStart - 1 + offset;
      const deleteLines = hunk.lines
        .filter(l => l.type === 'delete' || l.type === 'equal')
        .map(l => l.content);

      // Try exact position first, then search nearby
      let foundAt = -1;
      for (let delta = 0; delta <= fuzzFactor; delta++) {
        for (const sign of [0, 1, -1]) {
          const tryStart = targetStart + sign * delta;
          if (tryStart < 0 || tryStart + deleteLines.length > result.length) continue;
          const slice = result.slice(tryStart, tryStart + deleteLines.length);
          if (slice.every((l, i) => l === deleteLines[i])) {
            foundAt = tryStart;
            break;
          }
        }
        if (foundAt !== -1) break;
      }

      if (foundAt === -1) {
        // Cannot apply this hunk; skip
        continue;
      }

      const insertions = hunk.lines
        .filter(l => l.type === 'insert' || l.type === 'equal')
        .map(l => l.content);

      result.splice(foundAt, deleteLines.length, ...insertions);
      offset += insertions.length - deleteLines.length;
    }

    return result.join('\n');
  }

  // Format patch as string
  patchToString(patch: TextPatch): string {
    const lines: string[] = [];
    lines.push(`--- ${patch.fromFile}`);
    lines.push(`+++ ${patch.toFile}`);

    for (const hunk of patch.hunks) {
      lines.push(
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
      );
      for (const line of hunk.lines) {
        if (line.type === 'equal') lines.push(` ${line.content}`);
        else if (line.type === 'delete') lines.push(`-${line.content}`);
        else lines.push(`+${line.content}`);
      }
    }

    return lines.join('\n');
  }

  private buildHunks(diffLines: TextDiffLine[], contextLines: number): PatchHunk[] {
    const hunks: PatchHunk[] = [];
    const changes = diffLines
      .map((l, i) => ({ ...l, index: i }))
      .filter(l => l.type !== 'equal');

    if (changes.length === 0) return [];

    // Group changes into hunks separated by more than 2*contextLines equal lines
    const groups: typeof changes[number][][] = [];
    let currentGroup: typeof changes[number][] = [];

    for (let i = 0; i < changes.length; i++) {
      if (currentGroup.length === 0) {
        currentGroup.push(changes[i]!);
      } else {
        const prev = currentGroup[currentGroup.length - 1]!;
        const gap = changes[i]!.index - prev.index;
        if (gap <= 2 * contextLines + 1) {
          currentGroup.push(changes[i]!);
        } else {
          groups.push(currentGroup);
          currentGroup = [changes[i]!];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    for (const group of groups) {
      const firstIdx = Math.max(0, group[0]!.index - contextLines);
      const lastIdx = Math.min(diffLines.length - 1, group[group.length - 1]!.index + contextLines);

      const hunkLines = diffLines.slice(firstIdx, lastIdx + 1);

      let oldStart = 0;
      let newStart = 0;
      let oldCount = 0;
      let newCount = 0;

      for (const line of hunkLines) {
        if (line.oldLineNumber !== null && oldStart === 0) oldStart = line.oldLineNumber;
        if (line.newLineNumber !== null && newStart === 0) newStart = line.newLineNumber;
        if (line.type === 'equal' || line.type === 'delete') oldCount++;
        if (line.type === 'equal' || line.type === 'insert') newCount++;
      }

      hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
    }

    return hunks;
  }
}
