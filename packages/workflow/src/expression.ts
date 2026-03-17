// Expression evaluator for the Nexus workflow engine
// Supports variable access, string interpolation, arithmetic, comparisons, and safe function calls

import { WorkflowError, WorkflowErrorCode } from './types.js';

export interface EvaluationContext {
  variables: Record<string, unknown>;
  stepResults: Map<string, unknown>;
}

// Token types for the expression parser
type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'identifier'
  | 'dot'
  | 'lbracket'
  | 'rbracket'
  | 'lparen'
  | 'rparen'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'comma'
  | 'dollar'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '$') { tokens.push({ type: 'dollar', value: '$', pos: i++ }); continue; }
    if (ch === '.') { tokens.push({ type: 'dot', value: '.', pos: i++ }); continue; }
    if (ch === '[') { tokens.push({ type: 'lbracket', value: '[', pos: i++ }); continue; }
    if (ch === ']') { tokens.push({ type: 'rbracket', value: ']', pos: i++ }); continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(', pos: i++ }); continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')', pos: i++ }); continue; }
    if (ch === '+') { tokens.push({ type: 'plus', value: '+', pos: i++ }); continue; }
    if (ch === '-' && (tokens.length === 0 || ['plus','minus','star','slash','lparen','comma'].includes(tokens[tokens.length - 1]!.type))) {
      // Unary minus - treat as part of number
      let num = '-';
      i++;
      while (i < expr.length && (expr[i]! >= '0' && expr[i]! <= '9' || expr[i] === '.')) {
        num += expr[i++];
      }
      tokens.push({ type: 'number', value: num, pos: i - num.length });
      continue;
    }
    if (ch === '-') { tokens.push({ type: 'minus', value: '-', pos: i++ }); continue; }
    if (ch === '*') { tokens.push({ type: 'star', value: '*', pos: i++ }); continue; }
    if (ch === '/') { tokens.push({ type: 'slash', value: '/', pos: i++ }); continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',', pos: i++ }); continue; }

    // Comparison operators
    if (ch === '=' && expr[i + 1] === '=') { tokens.push({ type: 'eq', value: '==', pos: i }); i += 2; continue; }
    if (ch === '!' && expr[i + 1] === '=') { tokens.push({ type: 'ne', value: '!=', pos: i }); i += 2; continue; }
    if (ch === '>' && expr[i + 1] === '=') { tokens.push({ type: 'gte', value: '>=', pos: i }); i += 2; continue; }
    if (ch === '<' && expr[i + 1] === '=') { tokens.push({ type: 'lte', value: '<=', pos: i }); i += 2; continue; }
    if (ch === '>') { tokens.push({ type: 'gt', value: '>', pos: i++ }); continue; }
    if (ch === '<') { tokens.push({ type: 'lt', value: '<', pos: i++ }); continue; }

    // Numbers
    if (ch !== undefined && ch >= '0' && ch <= '9') {
      let num = '';
      while (i < expr.length && (expr[i]! >= '0' && expr[i]! <= '9' || expr[i] === '.')) {
        num += expr[i++];
      }
      tokens.push({ type: 'number', value: num, pos: i - num.length });
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          i++;
          const escaped = expr[i];
          if (escaped === 'n') str += '\n';
          else if (escaped === 't') str += '\t';
          else str += escaped;
          i++;
        } else {
          str += expr[i++];
        }
      }
      i++; // closing quote
      tokens.push({ type: 'string', value: str, pos: i - str.length - 2 });
      continue;
    }

    // Identifiers / keywords
    if (ch !== undefined && (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch === '_')) {
      let ident = '';
      while (i < expr.length && (expr[i]! >= 'a' && expr[i]! <= 'z' || expr[i]! >= 'A' && expr[i]! <= 'Z' || expr[i]! >= '0' && expr[i]! <= '9' || expr[i] === '_')) {
        ident += expr[i++];
      }
      if (ident === 'true') tokens.push({ type: 'boolean', value: 'true', pos: i - ident.length });
      else if (ident === 'false') tokens.push({ type: 'boolean', value: 'false', pos: i - ident.length });
      else if (ident === 'null') tokens.push({ type: 'null', value: 'null', pos: i - ident.length });
      else tokens.push({ type: 'identifier', value: ident, pos: i - ident.length });
      continue;
    }

    throw new WorkflowError(WorkflowErrorCode.ExpressionError, `Unexpected character '${ch}' at position ${i} in expression: ${expr}`);
  }

  tokens.push({ type: 'eof', value: '', pos: i });
  return tokens;
}

// Recursive descent parser + evaluator
class ExpressionParser {
  private tokens: Token[];
  private pos: number = 0;
  private ctx: EvaluationContext;

  constructor(tokens: Token[], ctx: EvaluationContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'eof', value: '', pos: -1 };
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new WorkflowError(WorkflowErrorCode.ExpressionError, 'Unexpected end of expression');
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.consume();
    if (t.type !== type) {
      throw new WorkflowError(WorkflowErrorCode.ExpressionError, `Expected ${type} but got ${t.type} ('${t.value}')`);
    }
    return t;
  }

  parse(): unknown {
    const result = this.parseComparison();
    if (this.peek().type !== 'eof') {
      throw new WorkflowError(WorkflowErrorCode.ExpressionError, `Unexpected token '${this.peek().value}' after expression`);
    }
    return result;
  }

  private parseComparison(): unknown {
    const left = this.parseAddSub();
    const op = this.peek();
    if (['eq', 'ne', 'gt', 'lt', 'gte', 'lte'].includes(op.type)) {
      this.consume();
      const right = this.parseAddSub();
      return this.applyComparison(op.type as 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte', left, right);
    }
    return left;
  }

  private applyComparison(op: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte', left: unknown, right: unknown): boolean {
    switch (op) {
      case 'eq': return left === right || String(left) === String(right);
      case 'ne': return left !== right && String(left) !== String(right);
      case 'gt': return Number(left) > Number(right);
      case 'lt': return Number(left) < Number(right);
      case 'gte': return Number(left) >= Number(right);
      case 'lte': return Number(left) <= Number(right);
    }
  }

  private parseAddSub(): unknown {
    let left = this.parseMulDiv();
    while (this.peek().type === 'plus' || this.peek().type === 'minus') {
      const op = this.consume();
      const right = this.parseMulDiv();
      if (op.type === 'plus') {
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right);
        } else {
          left = Number(left) + Number(right);
        }
      } else {
        left = Number(left) - Number(right);
      }
    }
    return left;
  }

  private parseMulDiv(): unknown {
    let left = this.parseUnary();
    while (this.peek().type === 'star' || this.peek().type === 'slash') {
      const op = this.consume();
      const right = this.parseUnary();
      if (op.type === 'star') {
        left = Number(left) * Number(right);
      } else {
        const divisor = Number(right);
        if (divisor === 0) throw new WorkflowError(WorkflowErrorCode.ExpressionError, 'Division by zero');
        left = Number(left) / divisor;
      }
    }
    return left;
  }

  private parseUnary(): unknown {
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const t = this.peek();

    if (t.type === 'number') {
      this.consume();
      return parseFloat(t.value);
    }
    if (t.type === 'string') {
      this.consume();
      return t.value;
    }
    if (t.type === 'boolean') {
      this.consume();
      return t.value === 'true';
    }
    if (t.type === 'null') {
      this.consume();
      return null;
    }
    if (t.type === 'dollar') {
      return this.parseVariableAccess();
    }
    if (t.type === 'identifier') {
      return this.parseFunctionOrIdentifier();
    }
    if (t.type === 'lparen') {
      this.consume();
      const val = this.parseComparison();
      this.expect('rparen');
      return val;
    }

    throw new WorkflowError(WorkflowErrorCode.ExpressionError, `Unexpected token '${t.value}' (${t.type}) at position ${t.pos}`);
  }

  private parseVariableAccess(): unknown {
    this.expect('dollar');
    // Build path: $.step1.output.id or $.variables.name
    const parts: string[] = [];

    // First segment after $
    if (this.peek().type === 'dot') {
      this.consume(); // consume dot
      if (this.peek().type === 'identifier') {
        parts.push(this.consume().value);
      }
    } else if (this.peek().type === 'lbracket') {
      // $['key'] syntax
      this.consume();
      const key = this.expect('string');
      this.expect('rbracket');
      parts.push(key.value);
    }

    // Remaining path segments
    while (this.peek().type === 'dot' || this.peek().type === 'lbracket') {
      if (this.peek().type === 'dot') {
        this.consume();
        if (this.peek().type === 'identifier') {
          parts.push(this.consume().value);
        }
      } else {
        this.consume(); // [
        if (this.peek().type === 'string') {
          parts.push(this.consume().value);
        } else if (this.peek().type === 'number') {
          parts.push(this.consume().value);
        }
        this.expect('rbracket');
      }
    }

    return this.resolveVariable(parts);
  }

  private resolveVariable(parts: string[]): unknown {
    if (parts.length === 0) return undefined;

    const root = parts[0];
    if (!root) return undefined;

    let current: unknown;

    // Check if root refers to a step result: $.stepId.output.field
    if (this.ctx.stepResults.has(root)) {
      current = this.ctx.stepResults.get(root);
    } else if (root in this.ctx.variables) {
      current = this.ctx.variables[root];
    } else {
      return undefined;
    }

    // Navigate remaining path
    for (let i = 1; i < parts.length; i++) {
      const key = parts[i];
      if (key === undefined) break;
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        const idx = parseInt(key, 10);
        if (!isNaN(idx) && Array.isArray(current)) {
          current = current[idx];
        } else {
          current = (current as Record<string, unknown>)[key];
        }
      } else {
        return undefined;
      }
    }

    return current;
  }

  private parseFunctionOrIdentifier(): unknown {
    const name = this.consume().value;

    // Check if it's a function call
    if (this.peek().type === 'lparen') {
      return this.callFunction(name);
    }

    // Plain identifier - look up in variables
    return this.ctx.variables[name] ?? undefined;
  }

  private callFunction(name: string): unknown {
    this.expect('lparen');
    const args: unknown[] = [];

    if (this.peek().type !== 'rparen') {
      args.push(this.parseComparison());
      while (this.peek().type === 'comma') {
        this.consume();
        args.push(this.parseComparison());
      }
    }

    this.expect('rparen');

    return this.applyFunction(name, args);
  }

  private applyFunction(name: string, args: unknown[]): unknown {
    switch (name) {
      case 'length': {
        const val = args[0];
        if (typeof val === 'string' || Array.isArray(val)) return val.length;
        if (val === null || val === undefined) return 0;
        return Object.keys(val as object).length;
      }
      case 'upper': return typeof args[0] === 'string' ? args[0].toUpperCase() : String(args[0]).toUpperCase();
      case 'lower': return typeof args[0] === 'string' ? args[0].toLowerCase() : String(args[0]).toLowerCase();
      case 'now': return new Date().toISOString();
      case 'format': {
        const template = String(args[0] ?? '');
        const data = args[1] ?? {};
        return template.replace(/\{(\w+)\}/g, (_, key: string) => String((data as Record<string, unknown>)[key] ?? ''));
      }
      case 'string': return String(args[0] ?? '');
      case 'number': return Number(args[0] ?? 0);
      case 'boolean': return Boolean(args[0]);
      case 'map': {
        const arr = args[0];
        if (!Array.isArray(arr)) return [];
        const fn = args[1];
        if (typeof fn !== 'function') return arr.map(String);
        return arr.map(fn as (item: unknown) => unknown);
      }
      case 'filter': {
        const arr = args[0];
        if (!Array.isArray(arr)) return [];
        const fn = args[1];
        if (typeof fn !== 'function') return arr;
        return arr.filter(fn as (item: unknown) => boolean);
      }
      case 'first': {
        const arr = args[0];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[0] ?? null;
      }
      case 'last': {
        const arr = args[0];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[arr.length - 1] ?? null;
      }
      case 'count': {
        const arr = args[0];
        if (Array.isArray(arr)) return arr.length;
        if (typeof arr === 'string') return arr.length;
        return 0;
      }
      case 'contains': {
        const haystack = args[0];
        const needle = args[1];
        if (typeof haystack === 'string') return haystack.includes(String(needle));
        if (Array.isArray(haystack)) return haystack.includes(needle);
        return false;
      }
      case 'matches': {
        const str = String(args[0] ?? '');
        const pattern = String(args[1] ?? '');
        try {
          return new RegExp(pattern).test(str);
        } catch {
          return false;
        }
      }
      case 'trim': return typeof args[0] === 'string' ? args[0].trim() : String(args[0] ?? '').trim();
      case 'split': {
        const str = String(args[0] ?? '');
        const sep = String(args[1] ?? ',');
        return str.split(sep);
      }
      case 'join': {
        const arr = args[0];
        const sep = String(args[1] ?? ',');
        if (Array.isArray(arr)) return arr.map(String).join(sep);
        return String(arr ?? '');
      }
      case 'keys': {
        const obj = args[0];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.keys(obj);
        return [];
      }
      case 'values': {
        const obj = args[0];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.values(obj);
        return [];
      }
      case 'not': return !args[0];
      case 'if': return args[0] ? args[1] : args[2];
      case 'coalesce': return args.find(a => a !== null && a !== undefined) ?? null;
      case 'min': return Math.min(...(args.map(Number)));
      case 'max': return Math.max(...(args.map(Number)));
      case 'abs': return Math.abs(Number(args[0]));
      case 'floor': return Math.floor(Number(args[0]));
      case 'ceil': return Math.ceil(Number(args[0]));
      case 'round': return Math.round(Number(args[0]));
      default:
        throw new WorkflowError(WorkflowErrorCode.ExpressionError, `Unknown function: ${name}`);
    }
  }
}

export class ExpressionEvaluator {
  /**
   * Evaluate a single expression string and return the result.
   * Supports: $.var.path, function calls, arithmetic, comparisons.
   */
  evaluate(expression: string, ctx: EvaluationContext): unknown {
    const trimmed = expression.trim();
    if (!trimmed) return undefined;

    try {
      const tokens = tokenize(trimmed);
      const parser = new ExpressionParser(tokens, ctx);
      return parser.parse();
    } catch (err) {
      if (err instanceof WorkflowError) throw err;
      throw new WorkflowError(
        WorkflowErrorCode.ExpressionError,
        `Failed to evaluate expression "${expression}": ${String(err)}`
      );
    }
  }

  /**
   * Interpolate a template string, replacing {{expression}} with evaluated values.
   * Example: "Hello {{$.name}}, you have {{count($.items)}} items."
   */
  interpolate(template: string, ctx: EvaluationContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
      try {
        const result = this.evaluate(expr.trim(), ctx);
        if (result === null || result === undefined) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        return String(result);
      } catch {
        return '';
      }
    });
  }

  /**
   * Evaluate a value that may be an expression string, template, or plain value.
   * Strings starting with '{{' or '$' are treated as expressions.
   */
  resolveValue(value: unknown, ctx: EvaluationContext): unknown {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Pure expression: starts with $ or is a function call
      if (trimmed.startsWith('$') || /^\w+\(/.test(trimmed)) {
        return this.evaluate(trimmed, ctx);
      }
      // Template string with interpolation markers
      if (trimmed.includes('{{')) {
        return this.interpolate(trimmed, ctx);
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, ctx));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.resolveValue(v, ctx);
      }
      return result;
    }
    return value;
  }

  /**
   * Evaluate a boolean expression - coerces result to boolean.
   */
  evaluateBool(expression: string, ctx: EvaluationContext): boolean {
    const result = this.evaluate(expression, ctx);
    return this.isTruthy(result);
  }

  /**
   * Determine truthiness: false, null, undefined, 0, '', [] are falsy.
   */
  isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }
}
