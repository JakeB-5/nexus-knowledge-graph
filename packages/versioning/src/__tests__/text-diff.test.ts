import { describe, it, expect, beforeEach } from 'vitest';
import { TextDiff } from '../text-diff.js';

describe('TextDiff', () => {
  let td: TextDiff;

  beforeEach(() => {
    td = new TextDiff();
  });

  describe('diffLines', () => {
    it('returns equal lines for identical text', () => {
      const result = td.diffLines('a\nb\nc', 'a\nb\nc');
      expect(result.every(l => l.type === 'equal')).toBe(true);
      expect(result).toHaveLength(3);
    });

    it('detects an inserted line', () => {
      const result = td.diffLines('a\nb', 'a\nINSERTED\nb');
      const inserts = result.filter(l => l.type === 'insert');
      expect(inserts).toHaveLength(1);
      expect(inserts[0]!.content).toBe('INSERTED');
    });

    it('detects a deleted line', () => {
      const result = td.diffLines('a\nDELETED\nb', 'a\nb');
      const deletes = result.filter(l => l.type === 'delete');
      expect(deletes).toHaveLength(1);
      expect(deletes[0]!.content).toBe('DELETED');
    });

    it('assigns correct line numbers to equal lines', () => {
      const result = td.diffLines('x\ny', 'x\ny');
      expect(result[0]!.oldLineNumber).toBe(1);
      expect(result[0]!.newLineNumber).toBe(1);
      expect(result[1]!.oldLineNumber).toBe(2);
      expect(result[1]!.newLineNumber).toBe(2);
    });

    it('assigns null newLineNumber for deleted lines', () => {
      const result = td.diffLines('a\nb', 'a');
      const deleted = result.find(l => l.type === 'delete');
      expect(deleted!.newLineNumber).toBeNull();
      expect(deleted!.oldLineNumber).toBeGreaterThan(0);
    });

    it('assigns null oldLineNumber for inserted lines', () => {
      const result = td.diffLines('a', 'a\nb');
      const inserted = result.find(l => l.type === 'insert');
      expect(inserted!.oldLineNumber).toBeNull();
      expect(inserted!.newLineNumber).toBeGreaterThan(0);
    });

    it('handles empty old text', () => {
      const result = td.diffLines('', 'line1\nline2');
      const inserts = result.filter(l => l.type === 'insert');
      expect(inserts).toHaveLength(2);
    });

    it('handles empty new text', () => {
      const result = td.diffLines('line1\nline2', '');
      const deletes = result.filter(l => l.type === 'delete');
      expect(deletes).toHaveLength(2);
    });

    it('handles completely replaced content', () => {
      const result = td.diffLines('old1\nold2', 'new1\nnew2');
      const deletes = result.filter(l => l.type === 'delete');
      const inserts = result.filter(l => l.type === 'insert');
      expect(deletes).toHaveLength(2);
      expect(inserts).toHaveLength(2);
    });
  });

  describe('diffWords', () => {
    it('detects word-level changes', () => {
      const result = td.diffWords('hello world', 'hello earth');
      const deletes = result.filter(e => e.type === 'delete');
      const inserts = result.filter(e => e.type === 'insert');
      expect(deletes.some(e => e.text === 'world')).toBe(true);
      expect(inserts.some(e => e.text === 'earth')).toBe(true);
    });

    it('returns equal for identical text', () => {
      const result = td.diffWords('same text', 'same text');
      expect(result.every(e => e.type === 'equal')).toBe(true);
    });
  });

  describe('diffChars', () => {
    it('detects character-level changes', () => {
      const result = td.diffChars('cat', 'bat');
      const deletes = result.filter(e => e.type === 'delete');
      const inserts = result.filter(e => e.type === 'insert');
      expect(deletes.some(e => e.text === 'c')).toBe(true);
      expect(inserts.some(e => e.text === 'b')).toBe(true);
    });
  });

  describe('toUnifiedFormat', () => {
    it('produces unified diff headers', () => {
      const lines = td.diffLines('a\nb\nc', 'a\nX\nc');
      const output = td.toUnifiedFormat(lines, 1, 'old.txt', 'new.txt');
      expect(output).toContain('--- old.txt');
      expect(output).toContain('+++ new.txt');
      expect(output).toContain('@@');
    });

    it('marks deletions with - and insertions with +', () => {
      const lines = td.diffLines('old line', 'new line');
      const output = td.toUnifiedFormat(lines, 0);
      expect(output).toContain('-old line');
      expect(output).toContain('+new line');
    });

    it('returns empty string for identical content', () => {
      const lines = td.diffLines('same', 'same');
      const output = td.toUnifiedFormat(lines);
      expect(output).toBe('');
    });

    it('includes context lines', () => {
      const old = 'line1\nline2\nCHANGED\nline4\nline5';
      const updated = 'line1\nline2\nNEW\nline4\nline5';
      const lines = td.diffLines(old, updated);
      const output = td.toUnifiedFormat(lines, 2);
      expect(output).toContain(' line1');
    });
  });

  describe('toSideBySideFormat', () => {
    it('produces output with separator', () => {
      const lines = td.diffLines('left', 'right');
      const output = td.toSideBySideFormat(lines, 40);
      expect(output).toContain('<');
      expect(output).toContain('>');
    });

    it('shows equal lines on both sides', () => {
      const lines = td.diffLines('same\nline', 'same\nline');
      const output = td.toSideBySideFormat(lines, 40);
      expect(output).toContain('|');
    });
  });

  describe('buildPatch and applyPatch', () => {
    it('round-trips through patch and application', () => {
      const original = 'line1\nline2\nline3\nline4\nline5';
      const modified = 'line1\nMODIFIED\nline3\nline4\nline5';
      const diffLines = td.diffLines(original, modified);
      const patch = td.buildPatch(diffLines, 1, 'a', 'b');
      const result = td.applyPatch(original, patch);
      expect(result).toBe(modified);
    });

    it('preserves unchanged content', () => {
      const original = 'alpha\nbeta\ngamma';
      const modified = 'alpha\nbeta\nDELTA';
      const diffLines = td.diffLines(original, modified);
      const patch = td.buildPatch(diffLines, 0);
      const result = td.applyPatch(original, patch);
      expect(result).toContain('DELTA');
      expect(result).toContain('alpha');
    });

    it('patchToString produces readable output', () => {
      const diffLines = td.diffLines('old', 'new');
      const patch = td.buildPatch(diffLines, 0, 'a.txt', 'b.txt');
      const str = td.patchToString(patch);
      expect(str).toContain('--- a.txt');
      expect(str).toContain('+++ b.txt');
    });
  });

  describe('applyPatchFuzzy', () => {
    it('applies patch when content shifted by a few lines', () => {
      const original = 'line1\nline2\nTARGET\nline4';
      const modified = 'line1\nline2\nREPLACED\nline4';
      const diffLines = td.diffLines(original, modified);
      const patch = td.buildPatch(diffLines, 0);

      // Shift content by adding a prefix line
      const shifted = 'EXTRA\nline1\nline2\nTARGET\nline4';
      const result = td.applyPatchFuzzy(shifted, patch, 2);
      expect(result).toContain('REPLACED');
    });
  });
});
